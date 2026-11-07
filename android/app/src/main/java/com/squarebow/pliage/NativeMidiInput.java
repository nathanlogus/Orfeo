package com.squarebow.pliage;

import android.content.Context;
import android.media.midi.MidiDevice;
import android.media.midi.MidiDeviceInfo;
import android.media.midi.MidiManager;
import android.media.midi.MidiOutputPort;
import android.media.midi.MidiReceiver;
import android.os.Handler;
import android.os.HandlerThread;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/** Android MIDI -> native synth. Web MIDI remains the independent UI/scoring feed. */
final class NativeMidiInput {
    private final NativePiano piano;
    private final MidiManager manager;
    private final HandlerThread thread = new HandlerThread("Pliage MIDI");
    private final Handler handler;
    private final Map<Integer, Device> devices = new HashMap<>(); // handler thread only
    private final Set<Integer> opening = new HashSet<>();
    private final Set<String> waiting = new HashSet<>();
    private volatile Set<String> owners = Collections.emptySet();
    private volatile boolean enabled, closed;
    private volatile Config config = new Config();
    private final int[] held = new int[128];
    private long notes, measuredNotes, inputNs, worstInputNs, handleNs, worstHandleNs;
    private int epoch;
    private volatile int currentProgram;

    private static final class Config {
        Set<String> allowed = Collections.emptySet();
        boolean autoReconnect = true, followProgram = true, muted;
        String curve = "normal";
        int fixed = 100, min = 1, max = 127, duplicateMs, program;
        Set<Integer> controls = new HashSet<>();
    }
    private static final class Device {
        MidiDevice midi;
        final ArrayList<MidiOutputPort> ports = new ArrayList<>();
        final ArrayList<Port> receivers = new ArrayList<>();
    }
    private static final class Port {
        String key;
        volatile boolean active = true;
        final boolean[] held = new boolean[128];
        final int[] swallowed = new int[128];
        final long[] lastOn = new long[128];
    }
    NativeMidiInput(Context context, NativePiano piano) {
        this.piano = piano;
        manager = (MidiManager) context.getSystemService(Context.MIDI_SERVICE);
        thread.start(); handler = new Handler(thread.getLooper());
        if (manager != null) manager.registerDeviceCallback(callback, handler);
    }
    private final MidiManager.DeviceCallback callback = new MidiManager.DeviceCallback() {
        @Override public void onDeviceAdded(MidiDeviceInfo info) { scan(); }
        @Override public void onDeviceRemoved(MidiDeviceInfo info) {
            Device d = devices.remove(info.getId());
            if (!config.autoReconnect) waiting.add(keyOf(info));
            if (d != null) release(d);
            publishOwners();
        }
    };
    private static String keyOf(MidiDeviceInfo info) {
        String name = info.getProperties().getString(MidiDeviceInfo.PROPERTY_PRODUCT);
        if (name == null || name.isEmpty()) name = info.getProperties().getString(MidiDeviceInfo.PROPERTY_NAME, "MIDI keyboard");
        return name.trim().replaceFirst("^\\d+\\s*-\\s*", "")
            .replaceFirst("^MIDI(?:IN|OUT)\\d*\\s*\\((.+)\\)$", "$1")
            .replaceFirst("(?i)\\s+(MIDI|Port|DAW|Out|In)(\\s*\\d+)?$", "")
            .replaceAll("\\s{2,}", " ").trim();
    }
    void configure(String json) throws Exception {
        JSONObject p = new JSONObject(json); Config c = new Config();
        Set<String> allowed = new HashSet<>(); JSONArray a = p.optJSONArray("allowed");
        if (a != null) for (int i = 0; i < a.length(); i++) allowed.add(a.getString(i));
        c.allowed = allowed; c.autoReconnect = p.optBoolean("autoReconnect", true);
        c.followProgram = p.optBoolean("followProgramChange", true); c.muted = p.optBoolean("muted");
        c.curve = p.optString("velocityCurve", "normal"); c.fixed = p.optInt("fixedVelocity", 100);
        c.min = p.optInt("minVelocity", 1); c.max = p.optInt("maxVelocity", 127);
        c.duplicateMs = p.optInt("duplicateFilterMs");
        c.program = p.optInt("liveProgram");
        JSONObject controls = p.optJSONObject("controls");
        int[] ids = {64, 66, 67, 1, 11, 7, -1, -2, -3};
        String[] names = {"sustain", "sostenuto", "soft", "modWheel", "expression", "volume", "pitchBend", "channelPressure", "polyPressure"};
        for (int i = 0; i < ids.length; i++) if (controls == null || controls.optBoolean(names[i], ids[i] != 7)) c.controls.add(ids[i]);
        boolean reset = config.muted != c.muted;
        Set<Integer> previousControls = config.controls;
        if (c.program != config.program) currentProgram = c.program;
        config = c;
        handler.post(() -> {
            if (reset) reset();
            for (int cc : previousControls) if (!c.controls.contains(cc)) {
                if (cc >= 0) piano.midi(0xb0, cc, cc == 7 || cc == 11 ? 127 : 0);
                else if (cc == -1) piano.midi(0xe0, 0, 64);
            }
            scan();
        });
    }
    void enable(boolean value) {
        enabled = value;
        if (!value) owners = Collections.emptySet();
        handler.post(() -> {
            epoch++;
            if (!value) { for (Device d : devices.values()) release(d); devices.clear(); publishOwners(); }
            else { synchronized (this) { notes = measuredNotes = inputNs = worstInputNs = handleNs = worstHandleNs = 0; } scan(); }
        });
    }
    void rescan() { handler.post(() -> { waiting.clear(); scan(); }); }
    boolean owns(String key) { return enabled && piano.ready() && owners.contains(key) && config.allowed.contains(key); }
    private void scan() {
        if (closed || !enabled || manager == null) return;
        for (Integer id : new ArrayList<>(devices.keySet())) {
            Device d = devices.get(id);
            if (!config.allowed.contains(keyOf(d.midi.getInfo()))) { devices.remove(id); release(d); }
        }
        publishOwners();
        for (MidiDeviceInfo info : manager.getDevices()) {
            int id = info.getId();
            if (info.getOutputPortCount() == 0 || !config.allowed.contains(keyOf(info)) || devices.containsKey(id) || opening.contains(id) || waiting.contains(keyOf(info))) continue;
            opening.add(id); final int ticket = epoch;
            manager.openDevice(info, midi -> {
                opening.remove(id);
                if (midi == null) return;
                if (closed || !enabled || ticket != epoch || !config.allowed.contains(keyOf(info))) { try { midi.close(); } catch (Exception ignored) {} return; }
                Device d = new Device(); d.midi = midi;
                for (int index = 0; index < info.getOutputPortCount(); index++) {
                    MidiOutputPort output = midi.openOutputPort(index);
                    if (output == null) continue;
                    Port port = new Port(); port.key = keyOf(info);
                    MidiMessageParser parser = new MidiMessageParser((status, a, b, stamp) -> receive(port, status, a, b, stamp));
                    output.connect(new MidiReceiver() {
                        private boolean prioritized;
                        @Override public void onSend(byte[] data, int offset, int count, long timestamp) {
                            if (!prioritized) {
                                prioritized = true;
                                try { android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_AUDIO); }
                                catch (SecurityException ignored) { /* Device policy may retain its default priority. */ }
                            }
                            parser.receive(data, offset, count, timestamp);
                        }
                    });
                    d.ports.add(output); d.receivers.add(port);
                }
                devices.put(id, d); publishOwners();
            }, handler);
        }
    }
    private void publishOwners() {
        Set<String> names = new HashSet<>();
        for (Device d : devices.values()) if (!d.ports.isEmpty()) names.add(keyOf(d.midi.getInfo()));
        owners = Collections.unmodifiableSet(names);
    }
    private synchronized void receive(Port port, int status, int a, int b, long timestamp) {
        if (!port.active || !enabled || !piano.ready() || !config.allowed.contains(port.key)) return;
        long now = System.nanoTime(); Config c = config; int type = status & 0xf0;
        if (type == 0x90 && b > 0) {
            if (c.muted || b < c.min || (c.duplicateMs > 0 && port.lastOn[a] != 0 && now - port.lastOn[a] < c.duplicateMs * 1000000L)) { port.swallowed[a]++; return; }
            port.lastOn[a] = now;
            int velocity = NativeVelocity.shape(b, c.curve, c.fixed, c.max);
            piano.liveNote(a, velocity, currentProgram);
            if (!port.held[a]) { port.held[a] = true; held[a]++; }
            notes++;
            long delay = timestamp > 0 && timestamp <= now && now - timestamp < 1000000000L ? now - timestamp : 0;
            if (timestamp > 0 && timestamp <= now && now - timestamp < 1000000000L) measuredNotes++;
            inputNs += delay; worstInputNs = Math.max(worstInputNs, delay);
            long handled = System.nanoTime() - now; handleNs += handled; worstHandleNs = Math.max(worstHandleNs, handled);
        } else if (type == 0x80 || type == 0x90) {
            if (port.swallowed[a] > 0) { port.swallowed[a]--; return; }
            if (port.held[a]) { port.held[a] = false; if (--held[a] == 0) piano.midi(0x80, a, 0); }
        } else if (type == 0xb0 && c.controls.contains(a)) piano.midi(status, a, b);
        else if (type == 0xe0 && c.controls.contains(-1)) piano.midi(status, a, b);
        else if (type == 0xc0 && c.followProgram) { currentProgram = a; piano.midi(status, a, b); }
    }
    synchronized void reset() {
        for (int n = 0; n < 128; n++) held[n] = 0;
        for (Device d : devices.values()) for (Port p : d.receivers) { java.util.Arrays.fill(p.held, false); java.util.Arrays.fill(p.swallowed, 0); }
        piano.midi(0xb0, 64, 0); piano.midi(0xb0, 120, 0); piano.midi(0xb0, 121, 0);
    }
    void requestReset() { handler.post(this::reset); }
    private void release(Device d) {
        synchronized (this) {
            for (Port p : d.receivers) { p.active = false; for (int n = 0; n < 128; n++) if (p.held[n]) { p.held[n] = false; if (--held[n] <= 0) { held[n] = 0; piano.midi(0x80, n, 0); } } }
            piano.midi(0xb0, 64, 0);
        }
        for (MidiOutputPort p : d.ports) try { p.close(); } catch (Exception ignored) {}
        try { d.midi.close(); } catch (Exception ignored) {}
    }
    synchronized JSONObject status() throws Exception {
        return new JSONObject().put("directMidi", enabled && piano.ready() && !owners.isEmpty())
            .put("directDevices", new JSONArray(owners)).put("nativeInputNotes", notes)
            .put("nativeInputMs", measuredNotes == 0 ? JSONObject.NULL : inputNs / (measuredNotes * 1e6))
            .put("nativeInputWorstMs", worstInputNs / 1e6)
            .put("nativeHandleMs", notes == 0 ? 0 : handleNs / (notes * 1e6)).put("nativeHandleWorstMs", worstHandleNs / 1e6);
    }
    void close() {
        closed = true; enable(false);
        if (manager != null) manager.unregisterDeviceCallback(callback);
        handler.post(thread::quitSafely);
    }
}
