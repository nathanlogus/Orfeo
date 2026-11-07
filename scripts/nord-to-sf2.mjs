// Experimental, local-only converter. OpenNord stays in a separate checkout;
// no Nord recordings or third-party decoder code are bundled with Pliage.
import { build } from 'esbuild'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve, join, basename } from 'node:path'
import { pathToFileURL } from 'node:url'

const chunk = (tag, data) => {
  const header = Buffer.alloc(8); header.write(tag); header.writeUInt32LE(data.length, 4)
  return Buffer.concat([header, data, ...(data.length % 2 ? [Buffer.alloc(1)] : [])])
}
const list = (tag, parts) => chunk('LIST', Buffer.concat([Buffer.from(tag), ...parts]))
const text = s => Buffer.from(s + '\0', 'ascii')
const name = s => { const b = Buffer.alloc(20); b.write(s.slice(0, 19), 'ascii'); return b }
const u16 = (...values) => { const b = Buffer.alloc(values.length * 2); values.forEach((v, i) => b.writeUInt16LE(v & 65535, i * 2)); return b }
const gen = (op, value) => u16(op, value)

/** Write one playable preset, with explicit key/velocity zones and stereo pans. */
export function writeSf2(title, regions) {
  if (!regions.length) throw new Error('No playable regions were decoded')
  const pcm = [], headers = [], bags = [], generators = []
  let offset = 0, sampleIndex = 0, generatorIndex = 0
  for (const r of regions) {
    let peak = 1
    for (const channel of r.channels) for (const x of channel) peak = Math.max(peak, Math.abs(x))
    for (let c = 0; c < r.channels.length; c++) {
      const values = r.channels[c], data = Buffer.alloc((values.length + 46) * 2)
      for (let i = 0; i < values.length; i++) data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(values[i] / peak * 32767))), i * 2)
      const looping = r.loop && r.loop.start >= 0 && r.loop.end <= values.length && r.loop.end - r.loop.start > 1
      const h = Buffer.alloc(46); name(`${sampleIndex}`).copy(h)
      h.writeUInt32LE(offset, 20); h.writeUInt32LE(offset + values.length, 24)
      h.writeUInt32LE(offset + (looping ? r.loop.start : 0), 28)
      h.writeUInt32LE(offset + (looping ? r.loop.end : values.length), 32)
      h.writeUInt32LE(Math.round(r.rate), 36); h[40] = r.root; h.writeUInt16LE(1, 44)
      headers.push(h); pcm.push(data); offset += values.length + 46
      bags.push(u16(generatorIndex, 0))
      const g = [gen(43, r.low | r.high << 8), gen(44, r.velLow | r.velHigh << 8),
        gen(17, r.channels.length === 2 ? c === 0 ? -500 : 500 : 0),
        gen(38, -2400), gen(54, looping ? 3 : 0), gen(58, r.root), gen(53, sampleIndex++)]
      generators.push(...g); generatorIndex += g.length
    }
  }
  bags.push(u16(generatorIndex, 0)); generators.push(Buffer.alloc(4)); headers.push(Buffer.alloc(46))
  name('EOS').copy(headers.at(-1)); headers.at(-1).writeUInt32LE(offset, 20)
  const ph = Buffer.alloc(38), pe = Buffer.alloc(38), inst = Buffer.alloc(22), ie = Buffer.alloc(22)
  name(title).copy(ph); name('EOP').copy(pe); pe.writeUInt16LE(1, 24)
  name(title).copy(inst); name('EOI').copy(ie); ie.writeUInt16LE(sampleIndex, 20)
  const version = u16(2, 1)
  const parts = [list('INFO', [chunk('ifil', version), chunk('isng', text('EMU8000')), chunk('INAM', text(title)), chunk('ICMT', text('Experimental local conversion; not a Nord hardware emulation.'))]),
    list('sdta', [chunk('smpl', Buffer.concat(pcm))]),
    list('pdta', [chunk('phdr', Buffer.concat([ph, pe])), chunk('pbag', Buffer.concat([u16(0, 0), u16(1, 0)])),
      chunk('pmod', Buffer.alloc(10)), chunk('pgen', Buffer.concat([gen(41, 0), Buffer.alloc(4)])),
      chunk('inst', Buffer.concat([inst, ie])), chunk('ibag', Buffer.concat(bags)), chunk('imod', Buffer.alloc(10)),
      chunk('igen', Buffer.concat(generators)), chunk('shdr', Buffer.concat(headers))])]
  return chunk('RIFF', Buffer.concat([Buffer.from('sfbk'), ...parts]))
}

async function main() {
  const [checkout, input, output] = process.argv.slice(2)
  if (!checkout || !input || !output) throw new Error('Usage: node scripts/nord-to-sf2.mjs <OpenNord checkout> <input.nsmp4|input.npno> <output.sf2>')
  // Only public decoder exports; dynamically compiled in memory, never vendored.
  const base = resolve(checkout, 'src/lib/ns4').replaceAll('\\', '/')
  const bundle = await build({ stdin: { resolveDir: base, contents: 'export * from "./nsmp.ts"; export * from "./nsp.ts"; export * from "./nsp-audio.ts";' }, bundle: true, platform: 'node', format: 'esm', write: false })
  const d = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].contents).toString('base64'))
  const bytes = new Uint8Array(await readFile(input)), regions = []
  let title = basename(input).replace(/\.[^.]+$/, '')
  if (/\.npno$/i.test(input)) {
    const file = d.readNsp(bytes), dir = d.readNspDirectory(bytes), zones = d.readNspZones(bytes)
    if (!file.recognized || !dir || !file.checksumValid) throw new Error('Unreadable or damaged Nord piano')
    title = file.name || title
    for (let z = 0; z < zones.length; z++) {
      const ranges = new Map()
      for (let v = 1; v <= 127; v++) {
        const stroke = d.strokeFor(dir, z, v)
        if (!stroke) continue
        const range = ranges.get(stroke.index)
        if (range) range.high = v; else ranges.set(stroke.index, { stroke, low: v, high: v })
      }
      for (const { stroke, low, high } of ranges.values()) {
        regions.push({ channels: d.decodeNspStroke(bytes, dir, stroke), rate: d.NSP_SAMPLE_RATE,
          low: zones[z].lowNote, high: zones[z].highNote, root: zones[z].rootNote + d.NSP_ROOT_OFFSET,
          velLow: low, velHigh: high, loop: stroke.loop ? { start: stroke.loop.start, end: stroke.loop.start + stroke.loop.length } : null })
      }
    }
  } else {
    const file = d.readNsmp(bytes)
    if (!file.recognized || !d.isDecodableNsmp(file) || (!file.legacy && !file.checksumValid)) throw new Error('Unsupported or damaged Nord sample')
    title = file.name || title
    const strokes = new Map(d.decodeNsmp(bytes).map(s => [s.globalID, s]))
    for (const z of d.readNsmpZones(bytes)) {
      const s = strokes.get(z.globalID)
      if (!s) throw new Error(`Missing recording ${z.globalID}`)
      regions.push({ channels: s.channels, rate: s.sampleRate, low: z.keyLow, high: z.keyHigh, root: z.rootKey,
        velLow: Math.max(1, z.velLow), velHigh: z.velTop,
        loop: s.loop?.loops && !z.zoneIsOneShot ? { start: s.loop.loopStart, end: s.loop.loopEnd } : null })
    }
  }
  const sf2 = writeSf2(title, regions)
  await writeFile(output, sf2, { flag: 'wx' })
  console.log(JSON.stringify({ title, regions: regions.length, bytes: sf2.length, output: resolve(output), limitations: 'Approximate envelopes/velocity response; no Nord resonance, release samples, round robin or hardware FX.' }, null, 2))
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(e => { console.error(e.message); process.exitCode = 1 })
