# Mixer instrument and FX panel

The mixer now has a collapsible instrument and master FX panel inspired by a
hardware keyboard layout. Its controls share state with the master strip:
keyboard program, master level, chorus, reverb, tone and compressor strength.
The selected sound set supplies the keyboard programs; their names are GM slot
names, and a custom sound set can replace those sounds.

Android Native implements stereo chorus, a damped parallel-comb room reverb,
a treble tone control and a stereo-linked feed-forward compressor with five
strength presets. These are Pliage effects, not Nord effect emulations.
All delay storage is allocated before the AAudio stream starts. The callback
uses no allocation, locks, lookahead or additional buffering of the dry signal.
The existing final safety limiter remains after the effects.

Native Android effects process the combined song, keyboard and metronome.
Per-track FX sends are disabled there; Studio and desktop Native retain their
existing per-track controls. SF3 and aftertouch remain unsupported on Android
Native. Native offline export remains unavailable on Android.

Validation: allocation-free host DSP test at 44.1, 48 and 96 kHz, dry impulse
with unchanged attack position, nonzero effect tails and finite sustained
output; TypeScript check, full application test suite, Android web build and
debug APK build. Tablet latency and subjective FX listening still need checking
after installing the new APK. The Nord sound audition currently uses the
previous installed build so that testing is uninterrupted.

```powershell
g++ -O2 -std=c++17 -I android/app/src/main/cpp android/app/src/test/cpp/effects_test.cpp -o effects-test.exe
./effects-test.exe
```
