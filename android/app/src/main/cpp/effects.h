#pragma once
#include <algorithm>
#include <array>
#include <cmath>
#include <vector>

namespace pliage {
// All storage/coefficient setup happens before playback. Processing is stereo,
// in-place, with no lookahead or extra dry-path buffering.
class Effects {
    struct Delay {
        std::vector<float> data;
        size_t at = 0;
        float damp = 0;
        float comb(float x) {
            float y = data[at]; damp += .25f * (y - damp);
            data[at] = x + .76f * damp;
            if (++at == data.size()) at = 0;
            return y;
        }
    };
    std::array<Delay, 8> room;
    std::vector<float> chorusL, chorusR;
    size_t chorusAt = 0;
    float rate = 48000, phase = 0, lowL = 0, lowR = 0, lowAlpha = 0;
    float reverb = 0, chorus = 0, tone = 1, targetTone = 1;
    float wetReverb = 0, wetChorus = 0, compGain = 1;
    float attack = 0, release = 0, threshold = -1, slope = .5f, makeup = 1;
    bool compression = false;
    float read(const std::vector<float>& data, float delay) const {
        float pos = static_cast<float>(chorusAt) - delay;
        if (pos < 0) pos += data.size();
        size_t a = static_cast<size_t>(pos), b = (a + 1) % data.size();
        return data[a] + (data[b] - data[a]) * (pos - a);
    }
public:
    void prepare(int sampleRate) {
        rate = sampleRate;
        const float seconds[] = {.0297f, .0371f, .0411f, .0437f, .0307f, .0383f, .0421f, .0449f};
        for (size_t i = 0; i < room.size(); i++) { room[i].data.assign(static_cast<size_t>(seconds[i] * rate), 0); room[i].at = 0; room[i].damp = 0; }
        chorusL.assign(static_cast<size_t>(rate * .04f) + 2, 0); chorusR = chorusL;
        chorusAt = 0; phase = lowL = lowR = 0;
        lowAlpha = 1 - std::exp(-2 * 3.14159265f * 900 / rate);
        setCompressor(false, 0);
    }
    void setReverb(float value) { reverb = std::clamp(value, 0.f, 1.f); }
    void setChorus(float value) { chorus = std::clamp(value, 0.f, 1.f); }
    void setTone(float db) { targetTone = std::pow(10.f, std::clamp(db, -12.f, 12.f) / 20); }
    void setCompressor(bool on, int preset) {
        constexpr float thresholds[] = {-1, -6, -12, -18, -24}, ratios[] = {2, 4, 8, 14, 20}, attacks[] = {.010f, .008f, .005f, .003f, .003f}, makeups[] = {.5f, 1.5f, 3, 4.5f, 6};
        int p = std::clamp(preset, 0, 4);
        compression = on; threshold = thresholds[p]; slope = 1 - 1 / ratios[p];
        attack = std::exp(-1 / (attacks[p] * rate)); release = std::exp(-1 / (.25f * rate));
        makeup = std::pow(10.f, makeups[p] / 20);
    }
    void process(float* data, int frames) {
        for (int i = 0; i < frames; i++) {
            // Smooth effect amounts to avoid discontinuities while turning knobs.
            wetReverb += .002f * (reverb - wetReverb); wetChorus += .002f * (chorus - wetChorus); tone += .002f * (targetTone - tone);
            float l = data[i * 2], r = data[i * 2 + 1];
            lowL += lowAlpha * (l - lowL); lowR += lowAlpha * (r - lowR);
            l += (tone - 1) * (l - lowL); r += (tone - 1) * (r - lowR);
            chorusL[chorusAt] = l; chorusR[chorusAt] = r;
            if (wetChorus > .00001f) {
                l += wetChorus * .4f * read(chorusL, rate * (.018f + .003f * std::sin(phase)));
                r += wetChorus * .4f * read(chorusR, rate * (.018f + .003f * std::cos(phase)));
            }
            if (++chorusAt == chorusL.size()) chorusAt = 0;
            phase += 2 * 3.14159265f * .7f / rate; if (phase > 2 * 3.14159265f) phase -= 2 * 3.14159265f;
            float rl = 0, rr = 0, input = (l + r) * .06f * wetReverb;
            for (int j = 0; j < 4; j++) { rl += room[j].comb(input); rr += room[j + 4].comb(input); }
            l += rl; r += rr;
            float wanted = 1;
            if (compression) {
                float db = 20 * std::log10(std::max(.000001f, std::max(std::fabs(l), std::fabs(r))));
                wanted = std::pow(10.f, -std::max(0.f, db - threshold) * slope / 20) * makeup;
            }
            float coeff = wanted < compGain ? attack : release;
            compGain = coeff * compGain + (1 - coeff) * wanted;
            data[i * 2] = l * compGain; data[i * 2 + 1] = r * compGain;
        }
    }
};
}
