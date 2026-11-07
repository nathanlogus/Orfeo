package com.squarebow.pliage;

final class NativeVelocity {
    static int shape(int raw, String curve, int fixed, int maximum) {
        double exponent = curve.equals("soft") ? .6 : curve.equals("hard") ? 1.6 : 1;
        int shaped = curve.equals("fixed") ? fixed : (int) Math.round(Math.pow(Math.max(1, Math.min(127, raw)) / 127.0, exponent) * 127);
        return Math.max(1, Math.min(maximum, shaped));
    }
}
