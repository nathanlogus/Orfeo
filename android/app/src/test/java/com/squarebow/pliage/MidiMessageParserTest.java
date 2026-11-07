package com.squarebow.pliage;
import java.util.ArrayList;
import java.util.Arrays;

public final class MidiMessageParserTest {
    private static void check(boolean condition, String label) { if (!condition) throw new AssertionError(label); }
    public static void main(String[] args) {
        ArrayList<String> received = new ArrayList<>();
        MidiMessageParser p = new MidiMessageParser((status, a, b, stamp) -> received.add(status + ":" + a + ":" + b + ":" + stamp));
        p.receive(new byte[]{(byte)0x90, 60}, 0, 2, 10);
        p.receive(new byte[]{(byte)0xf8, 90, 64, (byte)0xfe, 80}, 0, 5, 20);
        p.receive(new byte[]{(byte)0xc0, 4, 5, (byte)0x80, 60, 0}, 0, 6, 30);
        check(received.equals(Arrays.asList("144:60:90:10", "144:64:80:20", "192:4:0:30", "192:5:0:30", "128:60:0:30")), "split messages, running status and realtime interleaving");
        received.clear();
        p.receive(new byte[]{(byte)0xf0, 12, (byte)0xf8, 45, (byte)0xf7, 60, 70, (byte)0x90, 67, 100}, 0, 10, 40);
        check(received.equals(Arrays.asList("144:67:100:40")), "SysEx must not become notes or preserve running status");
        received.clear();
        p.receive(new byte[]{0, (byte)0xf2, 1, 2, 60, 80, (byte)0x90, 62, 70, 0}, 1, 8, 50);
        check(received.equals(Arrays.asList("144:62:70:50")), "offset/count bounds and system-common cancellation");
        check(NativeVelocity.shape(64, "normal", 100, 127) == 64, "normal velocity");
        check(NativeVelocity.shape(64, "soft", 100, 127) == 84, "soft velocity");
        check(NativeVelocity.shape(64, "hard", 100, 127) == 42, "hard velocity");
        check(NativeVelocity.shape(50, "fixed", 100, 80) == 80, "fixed velocity respects maximum");
        System.out.println("Android MIDI: framing and velocity checks passed");
    }
}
