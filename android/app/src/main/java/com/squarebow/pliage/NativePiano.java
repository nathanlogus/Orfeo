package com.squarebow.pliage;
import org.json.JSONArray;
import java.util.Arrays;

/** Serialized JNI access; only the AAudio callback ever touches the synth. */
final class NativePiano {
    private static final boolean AVAILABLE;
    static {
        boolean loaded;
        try { System.loadLibrary("pliage_piano"); loaded = true; }
        catch (UnsatisfiedLinkError e) { loaded = false; }
        AVAILABLE = loaded;
    }
    private volatile long handle;
    private volatile boolean suspended;
    private static native long create(String path, String extra, float gain, int rate, boolean exclusive);
    private static native void destroy(long handle);
    private static native void message(long handle, int status, int a, int b);
    private static native void volume(long handle, float gain);
    private static native String snapshot(long handle);
    private static native void control(long handle, int code, int a, int b, int c, double value);
    private static native long prepareSong(double[] times, int[] tracks, byte[] bytes, double duration);
    private static native long installSong(long handle, long data);
    private static native void discardSong(long data);
    private double[] songTimes = new double[0];
    private int[] songTracks = new int[0];
    private byte[] songBytes = new byte[0];
    private double duration;

    synchronized void start(String path, String extra, float gain, int rate, boolean exclusive) {
        stop();
        if (!AVAILABLE) throw new IllegalStateException("Native piano library is unavailable on this device.");
        if (suspended) throw new IllegalStateException("Pliage is in the background.");
        handle = create(path, extra, gain, rate, exclusive);
        if (suspended) { stop(); throw new IllegalStateException("Pliage is in the background."); }
    }
    synchronized void stop() { if (handle != 0) { destroy(handle); handle = 0; } }
    void setSuspended(boolean value) { suspended = value; }
    boolean ready() { return handle != 0 && !suspended; }
    synchronized void midi(int status, int a, int b) { if (handle != 0) message(handle, status, a, b); }
    synchronized void liveNote(int note, int velocity, int program) {
        if (handle != 0) { message(handle, 0xc0, program, 0); message(handle, 0x90, note, velocity); }
    }
    synchronized void gain(float gain) { if (handle != 0) volume(handle, gain); }
    synchronized String status() {
        return handle == 0 ? "{\"running\":false,\"suspended\":" + suspended + "}" : snapshot(handle);
    }
    private void upload(double[] times, int[] tracks, byte[] bytes) {
        // JSON conversion, sorting/checkpoint generation and old-song
        // reclamation stay outside the lock used by the MIDI receiver.
        long prepared = prepareSong(times, tracks, bytes, duration), retired = 0;
        synchronized (this) {
            if (handle != 0) { retired = installSong(handle, prepared); prepared = 0; }
        }
        if (prepared != 0) discardSong(prepared);
        if (retired != 0) discardSong(retired);
    }
    void command(String name, JSONArray args) throws Exception {
        if (handle == 0) return;
            if (name.equals("loadSong")) {
                JSONArray times = args.getJSONArray(0), tracks = args.getJSONArray(1), bytes = args.getJSONArray(2);
                if (tracks.length() != times.length() || bytes.length() != times.length() * 3) throw new IllegalArgumentException("Invalid song arrays");
                songTimes = new double[times.length()]; songTracks = new int[times.length()]; songBytes = new byte[bytes.length()];
                for (int i = 0; i < songTimes.length; i++) { songTimes[i] = times.getDouble(i); songTracks[i] = tracks.getInt(i); }
                for (int i = 0; i < songBytes.length; i++) songBytes[i] = (byte) bytes.getInt(i);
                duration = args.getDouble(4); upload(songTimes, songTracks, songBytes); return;
            }
            if (name.equals("setSongClicks")) {
                JSONArray times = args.getJSONArray(0), accents = args.getJSONArray(1);
                int base = songTimes.length, count = times.length();
                double[] t = Arrays.copyOf(songTimes, base + count);
                int[] tracks = Arrays.copyOf(songTracks, base + count);
                byte[] bytes = Arrays.copyOf(songBytes, (base + count) * 3);
                for (int i = 0; i < count; i++) { t[base + i] = times.getDouble(i); tracks[base + i] = -1; bytes[(base + i) * 3] = (byte) 0xf8; bytes[(base + i) * 3 + 1] = (byte) accents.optInt(i); }
                upload(t, tracks, bytes); return;
            }
        synchronized (this) {
          if (handle == 0) return;
          switch (name) {
            case "seek": control(handle, 1, 0, 0, 0, args.getDouble(0)); break;
            case "play": control(handle, 2, 0, 0, 0, 0); break;
            case "pause": control(handle, 3, 0, 0, 0, 0); break;
            case "setTempoRatio": control(handle, 4, 0, 0, 0, args.getDouble(0)); break;
            case "setTranspose": control(handle, 5, args.getInt(0), 0, 0, 0); break;
            case "setAudibleTracks": {
                JSONArray audible = args.getJSONArray(0);
                for (int i = 0; i < Math.min(512, audible.length()); i++) control(handle, 6, i, audible.getBoolean(i) ? 1 : 0, 0, 0);
                break;
            }
            case "setChannelProgram": control(handle, 7, args.getInt(0), args.getInt(1), 0, 0); break;
            case "setChannel":
                control(handle, 8, args.getInt(0), 0, 0, args.getDouble(1));
                control(handle, 9, args.getInt(0), 0, 0, args.getDouble(2)); break;
            case "setMasterGain": volume(handle, (float) args.getDouble(0)); break;
            case "setMetronome": control(handle, 10, args.getBoolean(0) ? 1 : 0, 0, 0, args.getDouble(1)); break;
            case "clickAfter": control(handle, 11, args.getBoolean(1) ? 1 : 0, 0, 0, args.getDouble(0)); break;
            case "cancelPendingClicks": control(handle, 12, 0, 0, 0, 0); break;
            case "playAfter": control(handle, 13, 0, 0, 0, args.getDouble(0)); break;
            case "noteFor": control(handle, 14, args.getInt(0) == 15 ? 17 : args.getInt(0), args.getInt(1), args.getInt(2), args.getDouble(3)); break;
            case "midi": control(handle, 15, args.getInt(0), args.getInt(1), args.optInt(2), 0); break;
            case "setPreviewProgram": control(handle, 16, args.getInt(0), 0, 0, 0); break;
            case "setMasterReverb": control(handle, 17, 0, 0, 0, args.getDouble(0)); break;
            case "setMasterChorus": control(handle, 18, 0, 0, 0, args.getDouble(0)); break;
            case "setToneDb": control(handle, 19, 0, 0, 0, args.getDouble(0)); break;
            case "setCompressor": control(handle, 20, args.getBoolean(0) ? 1 : 0, args.getInt(1), 0, 0); break;
            default: throw new IllegalArgumentException("Unsupported native command: " + name);
          }
        }
    }
}
