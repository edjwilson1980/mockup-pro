// Builds a fold map (see lib/mockup/recolor.ts) from one garment photo, so any
// color can be drawn from it. Works from a dark photo too: the cloth's lightness
// changes are stretched by --gain into the same range as the white tee master.
//
//   node scripts/make-foldmap.mjs <photo> <out.png> [--scale 1] [--dx 0] [--dy 0]
//     [--gain 1] [--tag x0,y0,x1,y1] [--preview dir]
//
// The photo is scaled by --scale and placed on the 1000 × 1250 master canvas,
// centered, then moved by --dx/--dy. --tag flattens a neck label (photo pixels).
// It prints the garment's width per row so pxPerInch can be set in garments.json.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { loadLib } from './load-lib.mjs'

const recolor = await loadLib('lib/mockup/recolor.ts')
const [photo, out, ...rest] = process.argv.slice(2)
const opt = { scale: 1, dx: 0, dy: 0, gain: 1, tag: null, preview: null }
for (let i = 0; i < rest.length; i += 2) {
  const k = rest[i].replace(/^--/, '')
  opt[k] = k === 'tag' ? rest[i + 1].split(',').map(Number) : k === 'preview' ? rest[i + 1] : Number(rest[i + 1])
}
if (!photo || !out) throw new Error('Usage: make-foldmap.mjs <photo> <out.png> [options]')

const W = 1000
const H = 1250

// 1. Photo → RGBA, with the white background cut away if it has no alpha.
const src = await sharp(photo).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const { width: pw, height: ph } = src.info
const px = new Uint8ClampedArray(src.data)
const meta = await sharp(photo).metadata()
if (!meta.hasAlpha) {
  // Flood fill near-white from the edges; that's background.
  const bg = new Uint8Array(pw * ph)
  const isWhite = (i) => Math.min(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]) > 232
  const stack = []
  for (let x = 0; x < pw; x++) stack.push(x, (ph - 1) * pw + x)
  for (let y = 0; y < ph; y++) stack.push(y * pw, y * pw + pw - 1)
  while (stack.length) {
    const i = stack.pop()
    if (bg[i] || !isWhite(i)) continue
    bg[i] = 1
    const x = i % pw
    const y = (i / pw) | 0
    if (x > 0) stack.push(i - 1)
    if (x < pw - 1) stack.push(i + 1)
    if (y > 0) stack.push(i - pw)
    if (y < ph - 1) stack.push(i + pw)
  }
  // Trim 2 px off the edge: JPEG edge pixels are half white and would glow.
  for (let pass = 0; pass < 2; pass++) {
    const grow = bg.slice()
    for (let i = 0; i < pw * ph; i++) {
      if (bg[i]) continue
      const x = i % pw
      if ((x > 0 && bg[i - 1]) || (x < pw - 1 && bg[i + 1]) || (i >= pw && bg[i - pw]) || (i < pw * (ph - 1) && bg[i + pw])) grow[i] = 1
    }
    bg.set(grow)
  }
  for (let i = 0; i < pw * ph; i++) px[i * 4 + 3] = bg[i] ? 0 : 255
}

// 2. Place on the master canvas.
const sw = Math.round(pw * opt.scale)
const sh = Math.round(ph * opt.scale)
const placed = await sharp(Buffer.from(px.buffer), { raw: { width: pw, height: ph, channels: 4 } })
  .resize(sw, sh)
  .toBuffer()
const left = Math.round((W - sw) / 2 + opt.dx)
const top = Math.round((H - sh) / 2 + opt.dy)
// Place on an oversized canvas, then crop, so a scaled-up photo can hang off the edges.
const PAD = Math.max(sw, sh)
const big = await sharp({ create: { width: W + 2 * PAD, height: H + 2 * PAD, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: placed, raw: { width: sw, height: sh, channels: 4 }, left: left + PAD, top: top + PAD }])
  .png()
  .toBuffer()
const canvas = await sharp(big).extract({ left: PAD, top: PAD, width: W, height: H }).raw().toBuffer()
// Soften JPEG noise before reading the folds; keep the sharp alpha.
const soft = await sharp(canvas, { raw: { width: W, height: H, channels: 4 } }).blur(1.2).raw().toBuffer()
const featherA = await sharp(canvas, { raw: { width: W, height: H, channels: 4 } }).extractChannel(3).blur(0.6).raw().toBuffer()

// 3. Lightness per pixel, and the cloth's typical lightness.
const n = W * H
const L = new Float32Array(n)
const inside = []
for (let i = 0; i < n; i++) {
  const a = canvas[i * 4 + 3]
  if (!a) continue
  // Un-premultiply the blur at the edges so the outline doesn't go dark.
  const sa = soft[i * 4 + 3] || 1
  const k = 255 / sa
  L[i] = recolor.rgbToLab(Math.min(255, soft[i * 4] * k), Math.min(255, soft[i * 4 + 1] * k), Math.min(255, soft[i * 4 + 2] * k))[0]
  if (a > 250) inside.push(L[i])
}
inside.sort((a, b) => a - b)
const q = (p) => inside[Math.floor(inside.length * p)]
const median = q(0.5)
console.log(`cloth L: p1 ${q(0.01).toFixed(1)}  p50 ${median.toFixed(1)}  p99 ${q(0.99).toFixed(1)}`)

// 4. Neck label → the shading just around it, blended across the box.
if (opt.tag) {
  const [x0, y0, x1, y1] = opt.tag.map((v, j) => Math.round(v * opt.scale + (j % 2 ? top : left)))
  const ring = 6
  // Each label pixel gets the lightness interpolated from the box's four edges (just outside it).
  const edge = (x, y) => L[y * W + x]
  const col = (x, y) => {
    const t = (y - y0) / Math.max(1, y1 - y0)
    return edge(x, y0 - ring) * (1 - t) + edge(x, y1 + ring) * t
  }
  const row = (x, y) => {
    const t = (x - x0) / Math.max(1, x1 - x0)
    return edge(x0 - ring, y) * (1 - t) + edge(x1 + ring, y) * t
  }
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      L[y * W + x] = (col(x, y) + row(x, y)) / 2
    }
}

// 5. Fold map: gray = 200 + 5 × fold, alpha = garment.
const outPx = Buffer.alloc(n * 4)
for (let i = 0; i < n; i++) {
  const a = featherA[i]
  if (!a) continue
  const fold = Math.max(-40, Math.min(11, (L[i] - median) * opt.gain))
  const g = Math.round(200 + 5 * fold)
  outPx[i * 4] = outPx[i * 4 + 1] = outPx[i * 4 + 2] = g
  outPx[i * 4 + 3] = a
}
await sharp(outPx, { raw: { width: W, height: H, channels: 4 } }).png({ compressionLevel: 9 }).toFile(out)

// 6. Width per row, for pxPerInch.
const rows = []
for (let y = 0; y < H; y += 25) {
  let runs = []
  let start = -1
  for (let x = 0; x <= W; x++) {
    const on = x < W && canvas[(y * W + x) * 4 + 3] > 128
    if (on && start < 0) start = x
    if (!on && start >= 0) {
      runs.push(`${start}-${x - 1}`)
      start = -1
    }
  }
  if (runs.length) rows.push(`y${y}: ${runs.join(' ')}`)
}
console.log(rows.join('\n'))

// 7. Previews in a few colors.
if (opt.preview) {
  mkdirSync(opt.preview, { recursive: true })
  const map = recolor.decodeFoldMap({ width: W, height: H, data: new Uint8ClampedArray(outPx) })
  const base = out.replace(/^.*[\\/]/, '').replace(/\.png$/, '')
  for (const [name, hex] of Object.entries({ black: '#25282A', white: '#FFFFFF', sport: '#97999B', red: '#D50032', navy: '#263147', gold: '#FFB81C' })) {
    const r = recolor.recolorShirt(map, hex)
    await sharp(Buffer.from(r.data.buffer), { raw: { width: W, height: H, channels: 4 } })
      .flatten({ background: '#C8C9C7' })
      .resize(400)
      .png()
      .toFile(join(opt.preview, `${base}-${name}.png`))
  }
}
