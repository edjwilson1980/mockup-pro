/**
 * CMYK TIFF writer: 8-bit CMYK (+ optional unassociated alpha), Adobe Deflate with
 * horizontal predictor, strip by strip, ICC profile embedded, DPI set. Opens in Photoshop,
 * Illustrator and the RIP with the profile attached.
 */
import { cmykEngine, rgbaToCmyk } from './cmyk'

type Opts = {
  width: number
  height: number
  dpi: number
  alpha: boolean
  /** Returns straight-alpha RGBA for rows y0..y0+rows. */
  rows: (y0: number, rows: number) => Promise<Uint8ClampedArray | Uint8Array>
  rowsPerStrip?: number
  onProgress?: (fraction: number) => void
}

async function deflate(bytes: Uint8Array) {
  const s = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'))
  return new Uint8Array(await new Response(s).arrayBuffer())
}

export async function cmykTiff(o: Opts): Promise<Blob> {
  const { icc } = await cmykEngine()
  const spp = o.alpha ? 5 : 4
  const rps = o.rowsPerStrip || 256
  const rowBytes = o.width * spp
  const parts: BlobPart[] = [new Uint8Array(8)] // header, filled at the end
  const offsets: number[] = []
  const counts: number[] = []
  let pos = 8

  for (let y0 = 0; y0 < o.height; y0 += rps) {
    const rows = Math.min(rps, o.height - y0)
    const cmyk = await rgbaToCmyk(await o.rows(y0, rows), o.alpha)
    // Horizontal differencing (Predictor 2), per row, per sample.
    for (let r = 0; r < rows; r++) {
      const base = r * rowBytes
      for (let i = rowBytes - 1; i >= spp; i--) cmyk[base + i] = (cmyk[base + i] - cmyk[base + i - spp]) & 0xff
    }
    const z = await deflate(cmyk)
    offsets.push(pos)
    counts.push(z.length)
    parts.push(z)
    pos += z.length
    if (pos & 1) { parts.push(new Uint8Array(1)); pos++ }
    o.onProgress?.(Math.min(1, (y0 + rows) / o.height))
  }

  // Out-of-line values.
  const extra: { bytes: Uint8Array; at: number }[] = []
  const place = (bytes: Uint8Array) => {
    const at = pos
    extra.push({ bytes, at })
    pos += bytes.length + (bytes.length & 1)
    return at
  }
  const u16 = (vals: number[]) => { const b = new Uint8Array(vals.length * 2); const v = new DataView(b.buffer); vals.forEach((x, i) => v.setUint16(i * 2, x, true)); return b }
  const u32 = (vals: number[]) => { const b = new Uint8Array(vals.length * 4); const v = new DataView(b.buffer); vals.forEach((x, i) => v.setUint32(i * 4, x, true)); return b }
  const ascii = (s: string) => new TextEncoder().encode(s + '\0')
  const rational = u32([Math.round(o.dpi), 1])

  type Tag = [number, number, number, number | Uint8Array] // tag, type, count, inline value or bytes
  const SHORT = 3, LONG = 4, RATIONAL = 5, ASCII = 2, UNDEF = 7
  const software = ascii('Art Pro · South Side Printing')
  const tags: Tag[] = [
    [256, LONG, 1, o.width],
    [257, LONG, 1, o.height],
    [258, SHORT, spp, u16(Array(spp).fill(8))],
    [259, SHORT, 1, 8],
    [262, SHORT, 1, 5],
    [273, LONG, offsets.length, offsets.length === 1 ? offsets[0] : u32(offsets)],
    [277, SHORT, 1, spp],
    [278, LONG, 1, rps],
    [279, LONG, counts.length, counts.length === 1 ? counts[0] : u32(counts)],
    [282, RATIONAL, 1, rational],
    [283, RATIONAL, 1, rational],
    [284, SHORT, 1, 1],
    [296, SHORT, 1, 2],
    [305, ASCII, software.length, software],
    [317, SHORT, 1, 2],
    [332, SHORT, 1, 1],
    ...(o.alpha ? ([[338, SHORT, 1, 2]] as Tag[]) : []),
    [34675, UNDEF, icc.length, icc],
  ]
  const resolved = tags.map(([tag, type, count, val]) => {
    if (typeof val === 'number') return { tag, type, count, inline: val as number, off: -1 }
    if (val.length <= 4) { const b = new Uint8Array(4); b.set(val); return { tag, type, count, inline: new DataView(b.buffer).getUint32(0, true), off: -1 } }
    return { tag, type, count, inline: 0, off: place(val) }
  })

  const ifdAt = pos
  const ifd = new Uint8Array(2 + resolved.length * 12 + 4)
  const iv = new DataView(ifd.buffer)
  iv.setUint16(0, resolved.length, true)
  resolved.forEach((t, i) => {
    const b = 2 + i * 12
    iv.setUint16(b, t.tag, true)
    iv.setUint16(b + 2, t.type, true)
    iv.setUint32(b + 4, t.count, true)
    if (t.off >= 0) iv.setUint32(b + 8, t.off, true)
    else if (t.type === SHORT && t.count === 1) iv.setUint16(b + 8, t.inline, true)
    else iv.setUint32(b + 8, t.inline, true)
  })
  for (const e of extra) {
    parts.push(e.bytes)
    if (e.bytes.length & 1) parts.push(new Uint8Array(1))
  }
  parts.push(ifd)

  const head = parts[0] as Uint8Array
  const hv = new DataView(head.buffer)
  head[0] = 0x49; head[1] = 0x49 // "II"
  hv.setUint16(2, 42, true)
  hv.setUint32(4, ifdAt, true)
  return new Blob(parts, { type: 'image/tiff' })
}

/** CMYK TIFF from an image URL drawn at its own size (or onto a solid background). */
export async function cmykTiffFromUrl(url: string, dpi: number, opts: { background?: string; onProgress?: (f: number) => void } = {}) {
  const img = new Image()
  img.src = url
  await img.decode()
  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  if (opts.background) { ctx.fillStyle = opts.background; ctx.fillRect(0, 0, c.width, c.height) }
  ctx.drawImage(img, 0, 0)
  return cmykTiffFromCanvas(c, dpi, !opts.background, opts.onProgress)
}

export function cmykTiffFromCanvas(c: HTMLCanvasElement, dpi: number, alpha: boolean, onProgress?: (f: number) => void) {
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  return cmykTiff({ width: c.width, height: c.height, dpi, alpha, onProgress, rows: async (y0, rows) => ctx.getImageData(0, y0, c.width, rows).data })
}

export const tifName = (name: string) => name.replace(/\.(png|jpe?g|webp)$/i, '') + '.tif'
