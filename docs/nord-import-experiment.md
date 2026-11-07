# Local Nord import experiment

`scripts/nord-to-sf2.mjs` converts a locally supplied `.nsmp`, `.nsmp3`,
`.nsmp4` or `.npno` into a single-preset SF2 (bank 0, program 0). It uses a
separate [OpenNord](https://github.com/simonflore/opennord) checkout for decoding;
its AGPL decoder code and Nord recordings are not bundled in Pliage.

```powershell
git clone https://github.com/simonflore/opennord.git C:/Temp/opennord
node scripts/nord-to-sf2.mjs C:/Temp/opennord C:/Sounds/instrument.npno C:/Sounds/instrument.sf2
```

Run from Pliage after `npm install`. Output must not already exist. Import the
result using Pliage's existing SoundFont import. Direct Nord-file import in the
app is not implemented yet.

The first conversion used OpenNord commit
`19b5f59d4511f5a66ebaae86e0c8cfa29f5a68a3` and EP9 Stockholm Medium 6.0:
487 regions, 143,500,796 bytes. Conversion completed; listening and native
playback validation are still pending.

Key ranges, velocity layers, sample rates, stereo channels and valid sustain
loops are exported. Envelopes and velocity response are approximate. Nord
resonance, release samples, round robin, loop decay and hardware FX are not
reproduced. This is not a Nord hardware emulation.

Use recordings you have permission to use. Conversion does not grant a license
to redistribute the audio; no Nord factory sounds belong in this repository.
