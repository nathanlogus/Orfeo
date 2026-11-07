package com.squarebow.pliage;

/** MIDI byte framing, including running status, split packets and realtime bytes. */
final class MidiMessageParser {
    interface Sink { void send(int status, int a, int b, long timestamp); }
    private final Sink sink;
    private int status, count, needed, a;
    private boolean sysex;
    private long stamp;
    MidiMessageParser(Sink sink) { this.sink = sink; }
    void receive(byte[] bytes, int offset, int length, long timestamp) {
        for (int i = offset; i < offset + length; i++) {
            int value = bytes[i] & 255;
            if (value >= 0xf8) continue; // realtime can occur inside any message
            if ((value & 128) != 0) {
                count = 0; stamp = timestamp;
                if (value >= 0xf0) {
                    sysex = value == 0xf0; status = 0; needed = 0;
                    continue;
                }
                sysex = false; status = value;
                needed = (value & 0xf0) == 0xc0 || (value & 0xf0) == 0xd0 ? 1 : 2;
            } else if (!sysex && status != 0) {
                if (count == 0) { a = value; stamp = timestamp; }
                if (++count == needed) {
                    sink.send(status, a, needed == 1 ? 0 : value, stamp);
                    count = 0;
                }
            }
        }
    }
}
