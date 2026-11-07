// Android practice audio. The audio callback alone owns the synth; callers send
// bounded messages through a single-producer/single-consumer queue. No locks,
// file reads or allocations in the callback. Java serializes all JNI callers.
#include <aaudio/AAudio.h>
#include <jni.h>
#include <dlfcn.h>
#include <atomic>
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <memory>
#include <thread>
#include <time.h>
#include "song.h"
#define TSF_IMPLEMENTATION
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wnull-pointer-subtraction"
#include "vendor/tsf.h"
#pragma clang diagnostic pop

namespace {
struct Message { int status, a, b, c = 0; double value = 0; };
constexpr unsigned QUEUE_SIZE = 2048;
struct Piano {
    tsf* synth = nullptr;
    tsf* extra = nullptr;
    tsf* channels[18]{};
    AAudioStream* stream = nullptr;
    pliage::Song* song = nullptr;
    std::atomic<pliage::Song*> pendingSong{nullptr}, retiredSong{nullptr};
    size_t cursor = 0;
    double position = 0, ratio = 1;
    int transpose = 0;
    bool playing = false, metronome = false;
    float clickVolume = .5f;
    int64_t renderedFrames = 0, startAt = -1;
    struct Click { int64_t at = -1; bool accent = false; } clicks[32];
    struct Off { int64_t at = -1; int channel = 0, note = 0; } offs[512];
    bool audible[512]{};
    int programs[16]{}, currentPrograms[18]{}, banks[18]{}, volumes[18]{}, expressions[18]{};
    float faders[18]{};
    std::atomic<double> publishedPosition{0};
    std::atomic<bool> publishedPlaying{false};
    bool exclusive = false, int16 = false;
    Message queue[QUEUE_SIZE]{};
    std::atomic<unsigned> head{0}, tail{0};
    std::atomic<bool> panic{false};
    std::atomic<int> error{0}, callbackFrames{0};
    std::atomic<float> gain{0.5f};
    std::atomic<float> peak{0};
    std::atomic<int> voices{0};
    std::atomic<unsigned> dropped{0}, notes{0};
    int rate = 48000, burst = 0, buffer = 0, previousXruns = 0;

    ~Piano() {
        if (stream) { AAudioStream_requestStop(stream); AAudioStream_close(stream); }
        delete song; delete pendingSong.load(); delete retiredSong.load();
        if (extra) tsf_close(extra);
        if (synth) tsf_close(synth);
    }
    void send(int status, int a, int b, int c = 0, double value = 0) {
        unsigned h = head.load(std::memory_order_relaxed);
        unsigned next = (h + 1) % QUEUE_SIZE;
        if (next == tail.load(std::memory_order_acquire)) {
            dropped.fetch_add(1); panic.store(true); return;
        }
        queue[h] = {status, a, b, c, value}; head.store(next, std::memory_order_release);
    }
    void allOff(int channel) {
        tsf_channel_sounds_off_all(synth, channel);
        tsf_channel_midi_control(synth, channel, 64, 0);
        if (extra) { tsf_channel_sounds_off_all(extra, channel); tsf_channel_midi_control(extra, channel, 64, 0); }
    }
    void stopSongNotes() {
        for (int ch = 0; ch < 16; ch++) allOff(ch);
        for (auto& off : offs) if (off.channel < 16) off.at = -1;
    }
    void program(int ch, int p) {
        if (currentPrograms[ch] == p) return;
        currentPrograms[ch] = p;
        if (channels[ch]) allOff(ch);
        channels[ch] = extra && tsf_get_presetindex(extra, ch == 9 ? 128 : banks[ch], p) >= 0 ? extra : synth;
        if (!tsf_channel_set_presetnumber(channels[ch], ch, p, ch == 9)) tsf_channel_set_presetindex(channels[ch], ch, 0);
    }
    void volumeFor(int ch) {
        const float v = std::pow(volumes[ch] / 127.f, 3.f) * std::pow(expressions[ch] / 127.f, 3.f) * faders[ch];
        tsf_channel_set_volume(synth, ch, v);
        if (extra) tsf_channel_set_volume(extra, ch, v);
    }
    void midi(int ch, int status, int a, int b) {
        switch (status & 0xf0) {
            case 0x90: if (b) { tsf_channel_note_on(channels[ch], ch, a, b / 127.f); if (ch == 16) notes.fetch_add(1); }
                else tsf_channel_note_off(channels[ch], ch, a); break;
            case 0x80: tsf_channel_note_off(channels[ch], ch, a); break;
            case 0xc0: program(ch, ch < 16 && programs[ch] >= 0 ? programs[ch] : a); break;
            case 0xe0: tsf_channel_set_pitchwheel(synth, ch, a | (b << 7)); if (extra) tsf_channel_set_pitchwheel(extra, ch, a | (b << 7)); break;
            case 0xb0:
                if (a == 0 || a == 32) {
                    const int bank = a == 0 ? (b << 7) | (banks[ch] & 127) : (banks[ch] & 0x3f80) | b;
                    if (bank != banks[ch]) currentPrograms[ch] = -1;
                    banks[ch] = bank;
                }
                if (a == 7) volumes[ch] = b;
                if (a == 11) expressions[ch] = b;
                tsf_channel_midi_control(synth, ch, a, b);
                if (extra) tsf_channel_midi_control(extra, ch, a, b);
                if (a == 121) { volumes[ch] = expressions[ch] = 127; }
                volumeFor(ch); break;
        }
    }
    void click(double delay, bool accent) {
        for (auto& c : clicks) if (c.at < 0) { c.at = renderedFrames + static_cast<int64_t>(std::max(0., delay) * rate); c.accent = accent; break; }
    }
    void seek(double time) {
        stopSongNotes(); position = std::max(0., time);
        if (!song || song->events.empty()) { cursor = 0; return; }
        cursor = song->indexAt(position);
        auto state = song->stateAt(cursor);
        for (int ch = 0; ch < 16; ch++) {
            const auto& c = state[ch];
            midi(ch, 0xb0, 0, c.bank >> 7); midi(ch, 0xb0, 32, c.bank & 127);
            midi(ch, 0xc0, c.program, 0); midi(ch, 0xb0, 7, c.volume);
            midi(ch, 0xb0, 11, c.expression); midi(ch, 0xb0, 64, c.sustain);
            midi(ch, 0xb0, 10, c.pan); midi(ch, 0xe0, c.bend & 127, c.bend >> 7);
        }
    }
    void messages() {
        if (panic.exchange(false)) {
            for (int ch = 0; ch < 18; ch++) allOff(ch);
            tail.store(head.load(std::memory_order_acquire), std::memory_order_release);
        }
        unsigned t = tail.load(std::memory_order_relaxed);
        // Bound work even if a controller floods its MIDI port.
        for (unsigned n = 0; n < 256 && t != head.load(std::memory_order_acquire); ++n) {
            auto m = queue[t]; t = (t + 1) % QUEUE_SIZE;
            if (m.status < 0x1000) { midi((m.status & 0x100) ? 16 : m.status & 15, m.status, m.a, m.b); continue; }
            switch (m.status - 0x1000) {
                case 1: seek(m.value); break;
                case 2: playing = true; startAt = -1; break;
                case 3: playing = false; startAt = -1; stopSongNotes(); break;
                case 4: ratio = std::clamp(m.value, .01, 10.); break;
                case 5: stopSongNotes(); transpose = std::clamp(m.a, -48, 48); break;
                case 6: if (m.a >= 0 && m.a < 512 && audible[m.a] != (m.b != 0)) { audible[m.a] = m.b; stopSongNotes(); } break;
                case 7: if (m.a >= 0 && m.a < 16) { programs[m.a] = m.b; if (m.b >= 0) program(m.a, m.b); } break;
                case 8: if (m.a >= 0 && m.a < 16) { faders[m.a] = std::clamp(static_cast<float>(m.value), 0.f, 4.f); volumeFor(m.a); } break;
                case 9: if (m.a >= 0 && m.a < 16) { tsf_channel_set_pan(synth, m.a, (m.value + 1) * .5f); if (extra) tsf_channel_set_pan(extra, m.a, (m.value + 1) * .5f); } break;
                case 10: metronome = m.a; clickVolume = std::clamp(static_cast<float>(m.value), 0.f, 1.f); break;
                case 11: click(m.value, m.a); break;
                case 12: for (auto& c : clicks) c.at = -1; startAt = -1; break;
                case 13: playing = false; startAt = renderedFrames + static_cast<int64_t>(m.value * rate); break;
                case 14:
                    for (auto& off : offs) if (off.at >= 0 && off.channel == m.a && off.note == m.b) { off.at = -1; midi(m.a, 0x80, m.b, 0); }
                    midi(m.a, 0x90, m.b, m.c);
                    for (auto& off : offs) if (off.at < 0) { off = {renderedFrames + static_cast<int64_t>(m.value * rate), m.a, m.b}; break; }
                    break;
                case 15: midi((m.a & 15) == 15 ? 16 : m.a & 15, m.a, m.b, m.c); break;
                case 16: program(17, m.a); break;
            }
        }
        tail.store(t, std::memory_order_release);
    }
    void renderFloat(float* out, int frames) {
        if (auto next = pendingSong.load(std::memory_order_acquire)) {
            retiredSong.store(song, std::memory_order_release); song = next;
            seek(position); pendingSong.store(nullptr, std::memory_order_release);
        }
        for (int at = 0; at < frames;) {
            messages();
            if (startAt >= 0 && renderedFrames >= startAt) { playing = true; startAt = -1; }
            while (playing && song && cursor < song->events.size() && song->events[cursor].time <= position + 1e-9) {
                auto e = song->events[cursor++];
                if (e.status == 0xf8) { if (metronome) click(0, e.a != 0); continue; }
                int ch = e.status & 15, type = e.status & 0xf0;
                if (type == 0x90 && e.b && e.track >= 0 && !audible[e.track]) continue;
                if ((type == 0x90 || type == 0x80) && ch != 9) { e.a += transpose; if (e.a < 0 || e.a > 127) continue; }
                midi(ch, e.status, e.a, e.b);
            }
            int count = std::min(64, frames - at);
            if (playing && song && cursor < song->events.size()) count = std::min(count, std::max(1, static_cast<int>(std::ceil((song->events[cursor].time - position) * rate / ratio))));
            if (startAt > renderedFrames) count = std::min<int64_t>(count, startAt - renderedFrames);
            for (auto& off : offs) if (off.at >= 0) {
                if (off.at <= renderedFrames) { midi(off.channel, 0x80, off.note, 0); off.at = -1; }
                else count = std::min<int64_t>(count, off.at - renderedFrames);
            }
            tsf_render_float(synth, out + at * 2, count, 0);
            if (extra) tsf_render_float(extra, out + at * 2, count, 1);
            for (auto& c : clicks) if (c.at >= 0) {
                for (int i = 0; i < count; i++) {
                    double age = (renderedFrames + i - c.at) / static_cast<double>(rate);
                    if (age >= 0 && age < .045) {
                        float v = std::sin(age * (c.accent ? 1400 : 1000) * 6.28318530718) * std::exp(-age * 100) * clickVolume * .5;
                        out[(at + i) * 2] += v; out[(at + i) * 2 + 1] += v;
                    }
                }
                if (renderedFrames + count - c.at > rate * .045) c.at = -1;
            }
            renderedFrames += count; at += count;
            if (playing) position += count * ratio / rate;
            if (song && position >= song->duration && cursor == song->events.size()) playing = false;
        }
        publishedPosition.store(position); publishedPlaying.store(playing);
    }
    static aaudio_data_callback_result_t render(AAudioStream*, void* user, void* data, int32_t frames) {
        auto* p = static_cast<Piano*>(user);
        p->callbackFrames.store(frames, std::memory_order_relaxed);
        // Exclusive hardware can use PCM16. A fixed scratch buffer keeps
        // conversion allocation-free, even if the device asks for a large block.
        float scratch[512];
        // Zero-lookahead safety shaping: linear up to 0.8, smoothly limited
        // above it, never exceeding full scale even on dense chords.
        const float gain = p->gain.load(std::memory_order_relaxed);
        float peak = 0;
        for (int at = 0; at < frames; at += 256) {
            const int n = std::min(256, frames - at);
            float* out = p->int16 ? scratch : static_cast<float*>(data) + at * 2;
            p->renderFloat(out, n);
            for (int i = 0; i < n * 2; ++i) {
                float x = out[i] * gain, a = std::fabs(x);
                out[i] = a <= .8f ? x : std::copysign(.8f + .2f * std::tanh((a - .8f) * 5.f), x);
                peak = std::max(peak, std::fabs(out[i]));
                if (p->int16) static_cast<int16_t*>(data)[at * 2 + i] = static_cast<int16_t>(out[i] * 32767);
            }
        }
        float old = p->peak.load(std::memory_order_relaxed);
        while (old < peak && !p->peak.compare_exchange_weak(old, peak, std::memory_order_relaxed)) {}
        p->voices.store(tsf_active_voice_count(p->synth) + (p->extra ? tsf_active_voice_count(p->extra) : 0), std::memory_order_relaxed);
        return AAUDIO_CALLBACK_RESULT_CONTINUE;
    }
    static void onError(AAudioStream*, void* user, aaudio_result_t result) {
        // Never close a stream from its callback. The bridge poll reconnects
        // on its own thread after a headphone/output change.
        static_cast<Piano*>(user)->error.store(result);
    }
};
void fail(JNIEnv* env, const char* text) { env->ThrowNew(env->FindClass("java/lang/IllegalStateException"), text); }
Piano* piano(jlong handle) { return reinterpret_cast<Piano*>(handle); }
}

extern "C" JNIEXPORT jlong JNICALL
Java_com_squarebow_pliage_NativePiano_create(JNIEnv* env, jclass, jstring path, jstring extraPath, jfloat volume, jint rate, jboolean exclusive) {
    auto p = std::make_unique<Piano>();
    const char* filename = env->GetStringUTFChars(path, nullptr);
    p->synth = tsf_load_filename(filename);
    env->ReleaseStringUTFChars(path, filename);
    const char* extraName = env->GetStringUTFChars(extraPath, nullptr);
    if (*extraName) p->extra = tsf_load_filename(extraName);
    bool extraFailed = *extraName && !p->extra;
    env->ReleaseStringUTFChars(extraPath, extraName);
    if (!p->synth) { fail(env, "Native keyboard audio could not load this SF2 sound set (SF3 is not supported)."); return 0; }
    if (extraFailed) { fail(env, "The selected native sound set could not be loaded. SF2 is required."); return 0; }
    if (!tsf_set_max_voices(p->synth, 128) || (p->extra && !tsf_set_max_voices(p->extra, 128))) {
        fail(env, "Not enough memory for the native piano voices."); return 0;
    }
    std::fill(std::begin(p->audible), std::end(p->audible), true);
    std::fill(std::begin(p->programs), std::end(p->programs), -1);
    std::fill(std::begin(p->currentPrograms), std::end(p->currentPrograms), -1);
    std::fill(std::begin(p->volumes), std::end(p->volumes), 127);
    std::fill(std::begin(p->expressions), std::end(p->expressions), 127);
    std::fill(std::begin(p->faders), std::end(p->faders), 1.f);
    for (int ch = 0; ch < 18; ch++) {
        tsf_channel_set_presetindex(p->synth, ch, 0);
        if (p->extra) tsf_channel_set_presetindex(p->extra, ch, 0);
        p->program(ch, 0);
    }
    AAudioStreamBuilder* builder = nullptr;
    aaudio_result_t result = AAudio_createStreamBuilder(&builder);
    if (result != AAUDIO_OK) { fail(env, AAudio_convertResultToText(result)); return 0; }
    AAudioStreamBuilder_setDirection(builder, AAUDIO_DIRECTION_OUTPUT);
    AAudioStreamBuilder_setFormat(builder, exclusive ? AAUDIO_FORMAT_PCM_I16 : AAUDIO_FORMAT_PCM_FLOAT);
    AAudioStreamBuilder_setChannelCount(builder, 2);
    if (rate > 0) AAudioStreamBuilder_setSampleRate(builder, rate);
    // Match Web Audio's positional stereo mask, rather than an indexed mask,
    // so Android can share the same MMAP endpoint. Resolve newer optional
    // builder APIs at runtime to keep Android 8 (API 26) working.
    using SetInt = void (*)(AAudioStreamBuilder*, int32_t);
    if (auto setMask = reinterpret_cast<SetInt>(dlsym(RTLD_DEFAULT, "AAudioStreamBuilder_setChannelMask")))
        setMask(builder, AAUDIO_CHANNEL_STEREO);
    if (auto setUsage = reinterpret_cast<SetInt>(dlsym(RTLD_DEFAULT, "AAudioStreamBuilder_setUsage")))
        setUsage(builder, AAUDIO_USAGE_MEDIA);
    AAudioStreamBuilder_setPerformanceMode(builder, AAUDIO_PERFORMANCE_MODE_LOW_LATENCY);
    AAudioStreamBuilder_setSharingMode(builder, exclusive ? AAUDIO_SHARING_MODE_EXCLUSIVE : AAUDIO_SHARING_MODE_SHARED);
    AAudioStreamBuilder_setDataCallback(builder, Piano::render, p.get());
    AAudioStreamBuilder_setErrorCallback(builder, Piano::onError, p.get());
    result = AAudioStreamBuilder_openStream(builder, &p->stream);
    AAudioStreamBuilder_delete(builder);
    if (result != AAUDIO_OK) { fail(env, AAudio_convertResultToText(result)); return 0; }
    p->exclusive = AAudioStream_getSharingMode(p->stream) == AAUDIO_SHARING_MODE_EXCLUSIVE;
    p->int16 = AAudioStream_getFormat(p->stream) == AAUDIO_FORMAT_PCM_I16;
    p->rate = AAudioStream_getSampleRate(p->stream);
    p->burst = AAudioStream_getFramesPerBurst(p->stream);
    // Try one burst only on the exclusive path. The control-side status poll
    // grows it automatically if the driver reports underruns.
    result = AAudioStream_setBufferSizeInFrames(p->stream, p->burst * (p->exclusive ? 1 : 2));
    if (result < 0) { fail(env, AAudio_convertResultToText(result)); return 0; }
    p->buffer = result;
    p->gain.store(std::clamp(volume, 0.f, 1.f));
    tsf_set_output(p->synth, TSF_STEREO_INTERLEAVED, p->rate, 0);
    if (p->extra) tsf_set_output(p->extra, TSF_STEREO_INTERLEAVED, p->rate, 0);
    result = AAudioStream_requestStart(p->stream);
    if (result != AAUDIO_OK) { fail(env, AAudio_convertResultToText(result)); return 0; }
    return reinterpret_cast<jlong>(p.release());
}
extern "C" JNIEXPORT void JNICALL
Java_com_squarebow_pliage_NativePiano_destroy(JNIEnv*, jclass, jlong handle) { delete piano(handle); }
extern "C" JNIEXPORT void JNICALL
Java_com_squarebow_pliage_NativePiano_message(JNIEnv*, jclass, jlong handle, jint status, jint a, jint b) {
    piano(handle)->send(status | 0x100, std::clamp(a, 0, 127), std::clamp(b, 0, 127));
}
extern "C" JNIEXPORT void JNICALL
Java_com_squarebow_pliage_NativePiano_control(JNIEnv*, jclass, jlong handle, jint code, jint a, jint b, jint c, jdouble value) {
    piano(handle)->send(0x1000 + code, a, b, c, value);
}
extern "C" JNIEXPORT jlong JNICALL
Java_com_squarebow_pliage_NativePiano_prepareSong(JNIEnv* env, jclass, jdoubleArray times, jintArray tracks, jbyteArray bytes, jdouble duration) {
    const int count = env->GetArrayLength(times);
    if (env->GetArrayLength(tracks) != count || env->GetArrayLength(bytes) != count * 3 || !std::isfinite(duration)) { fail(env, "Invalid native song data."); return 0; }
    auto* t = env->GetDoubleArrayElements(times, nullptr);
    auto* tr = env->GetIntArrayElements(tracks, nullptr);
    auto* b = env->GetByteArrayElements(bytes, nullptr);
    std::vector<pliage::Event> events; events.reserve(count);
    bool valid = true;
    for (int i = 0; i < count; i++) {
        if (!std::isfinite(t[i]) || tr[i] >= 512 || tr[i] < -1) { valid = false; break; }
        events.push_back({t[i], tr[i], static_cast<unsigned char>(b[i * 3]), b[i * 3 + 1] & 127, b[i * 3 + 2] & 127});
    }
    env->ReleaseDoubleArrayElements(times, t, JNI_ABORT); env->ReleaseIntArrayElements(tracks, tr, JNI_ABORT); env->ReleaseByteArrayElements(bytes, b, JNI_ABORT);
    if (!valid) { fail(env, "Native songs support at most 512 tracks and finite event times."); return 0; }
    auto next = std::make_unique<pliage::Song>(std::move(events), duration);
    return reinterpret_cast<jlong>(next.release());
}
extern "C" JNIEXPORT void JNICALL
Java_com_squarebow_pliage_NativePiano_discardSong(JNIEnv*, jclass, jlong data) { delete reinterpret_cast<pliage::Song*>(data); }
extern "C" JNIEXPORT jlong JNICALL
Java_com_squarebow_pliage_NativePiano_installSong(JNIEnv* env, jclass, jlong handle, jlong data) {
    std::unique_ptr<pliage::Song> next(reinterpret_cast<pliage::Song*>(data));
    auto* p = piano(handle);
    // Only the control thread waits. The callback acknowledges a swap after
    // publishing the old immutable song for reclamation on this thread.
    for (int tries = 0; p->pendingSong.load(std::memory_order_acquire); tries++) {
        if (tries > 1000) { fail(env, "The audio output stopped while loading a song."); return 0; }
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }
    auto* retired = p->retiredSong.exchange(nullptr);
    p->pendingSong.store(next.release(), std::memory_order_release);
    return reinterpret_cast<jlong>(retired);
}
extern "C" JNIEXPORT void JNICALL
Java_com_squarebow_pliage_NativePiano_volume(JNIEnv*, jclass, jlong handle, jfloat gain) {
    piano(handle)->gain.store(std::clamp(gain, 0.f, 1.f));
}
extern "C" JNIEXPORT jstring JNICALL
Java_com_squarebow_pliage_NativePiano_snapshot(JNIEnv* env, jclass, jlong handle) {
    auto* p = piano(handle);
    int xruns = AAudioStream_getXRunCount(p->stream);
    if (xruns > p->previousXruns && p->buffer < p->burst * 4) {
        int grown = AAudioStream_setBufferSizeInFrames(p->stream, p->buffer + p->burst);
        if (grown >= 0) p->buffer = grown;
    }
    p->previousXruns = xruns;
    int64_t frame = 0, at = 0; timespec now{};
    double latency = -1;
    if (AAudioStream_getTimestamp(p->stream, CLOCK_MONOTONIC, &frame, &at) == AAUDIO_OK) {
        clock_gettime(CLOCK_MONOTONIC, &now);
        double next = at / 1e6 + (AAudioStream_getFramesWritten(p->stream) - frame) * 1000.0 / p->rate;
        latency = std::max(0.0, next - (now.tv_sec * 1000.0 + now.tv_nsec / 1e6));
    }
    char json[800];
    std::snprintf(json, sizeof(json),
        "{\"running\":%s,\"rate\":%d,\"burstFrames\":%d,\"bufferFrames\":%d,\"callbackFrames\":%d,\"outputMs\":%.3f,\"xruns\":%d,\"dropped\":%u,\"notes\":%u,\"errorCode\":%d,\"lowLatency\":%s,\"voices\":%d,\"peak\":%.4f,\"exclusive\":%s,\"position\":%.6f,\"playing\":%s}",
        p->error.load() ? "false" : "true", p->rate, p->burst, p->buffer, p->callbackFrames.load(), latency,
        AAudioStream_getXRunCount(p->stream), p->dropped.load(), p->notes.load(), p->error.load(),
        AAudioStream_getPerformanceMode(p->stream) == AAUDIO_PERFORMANCE_MODE_LOW_LATENCY ? "true" : "false",
        p->voices.load(), p->peak.exchange(0), p->exclusive ? "true" : "false", p->publishedPosition.load(), p->publishedPlaying.load() ? "true" : "false");
    return env->NewStringUTF(json);
}
