import { SHEET_WIDTH_IN } from './sheet-size'
import { LABEL_HEIGHT_IN, LABEL_MARGIN_IN, LABEL_PT, registrationMarkBounds, startMarkArrowPoints, type ArrowPoint } from './cut-layout'
import { crc32, loadImage } from './image'
import type { Sheet } from './pack'

type PaintOpts = { label?: string; precut: boolean; preview?: boolean }

function fillPolygon(ctx: CanvasRenderingContext2D, pts: ArrowPoint[], k: number) {
  ctx.beginPath()
  pts.forEach((p, i) => (i ? ctx.lineTo(p.xIn * k, p.yIn * k) : ctx.moveTo(p.xIn * k, p.yIn * k)))
  ctx.closePath()
  ctx.fill()
}

async function loadAll(sheet: Sheet) {
  const cache = new Map<string, HTMLImageElement>()
  for (const p of sheet.pieces) if (!cache.has(p.src)) cache.set(p.src, await loadImage(p.src))
  return cache
}

/** Paints the whole sheet in sheet pixel coordinates; the caller's transform picks the strip. */
function paint(
  ctx: CanvasRenderingContext2D,
  sheet: Sheet,
  k: number,
  opts: PaintOpts,
  images: Map<string, HTMLImageElement>,
  band?: [number, number],
) {
  const width = Math.round(SHEET_WIDTH_IN * k)
  const height = Math.round(sheet.lengthIn * k)

  if (opts.label) {
    const fontPx = Math.max(1, (LABEL_PT * k) / 72)
    ctx.font = `700 ${fontPx}px Arial, Helvetica, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = opts.preview ? '#9AA3B2' : '#111111'
    const labelY = (LABEL_MARGIN_IN + LABEL_HEIGHT_IN / 2) * k
    ctx.fillText(opts.label, width / 2, labelY, width * 0.9)
    ctx.fillText(opts.label, width / 2, height - labelY, width * 0.9)
  }

  for (const p of sheet.pieces) {
    const img = images.get(p.src)
    if (!img) continue
    const x = p.xIn * k
    const y = p.yIn * k
    const w = p.widthIn * k
    const h = p.heightIn * k
    if (band && (y + h < band[0] - 2 || y > band[1] + 2)) continue
    const boxW = p.rotated ? h : w
    const boxH = p.rotated ? w : h
    const s = Math.min(boxW / img.naturalWidth, boxH / img.naturalHeight)
    const dw = img.naturalWidth * s
    const dh = img.naturalHeight * s
    const ox = (boxW - dw) / 2
    const oy = (boxH - dh) / 2
    if (p.rotated) {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(Math.PI / 2)
      ctx.drawImage(img, ox, -w + oy, dw, dh)
      ctx.restore()
    } else {
      ctx.drawImage(img, x + ox, y + oy, dw, dh)
    }
  }

  if (opts.precut) {
    const marks = registrationMarkBounds(sheet.lengthIn)
    ctx.fillStyle = opts.preview ? '#ECEEF2' : '#000000'
    for (const m of marks) {
      ctx.beginPath()
      ctx.arc((m.xIn + m.widthIn / 2) * k, (m.yIn + m.heightIn / 2) * k, Math.max(1, (m.widthIn * k) / 2), 0, Math.PI * 2)
      ctx.fill()
    }
    const first = marks.find((m) => m.first)
    if (first) {
      const pts = startMarkArrowPoints(first)
      const cx = pts.reduce((a, p) => a + p.xIn, 0) / 3
      const cy = pts.reduce((a, p) => a + p.yIn, 0) / 3
      ctx.fillStyle = '#ffffff'
      fillPolygon(ctx, pts.map((p) => ({ xIn: cx + (p.xIn - cx) * 1.9, yIn: cy + (p.yIn - cy) * 1.9 })), k)
      ctx.fillStyle = '#000000'
      fillPolygon(ctx, pts, k)
    }
  }
}

/** On-screen preview of a whole sheet. */
export async function drawSheet(canvas: HTMLCanvasElement, sheet: Sheet, opts: PaintOpts & { pxPerIn: number }) {
  const k = opts.pxPerIn
  canvas.width = Math.max(1, Math.round(SHEET_WIDTH_IN * k))
  canvas.height = Math.max(1, Math.round(sheet.lengthIn * k))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not draw the sheet.')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  paint(ctx, sheet, k, opts, await loadAll(sheet))
  return canvas
}

function chunk(type: string, data: Uint8Array) {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

const STRIP_ROWS = 1024

/**
 * Full-resolution PNG at `dpi`, written strip by strip.
 *
 * A browser canvas tops out around 32,767 px tall (~109 in at 300 DPI), so a
 * 200 in sheet cannot be drawn in one piece. Each 1024-row strip is painted,
 * read back and streamed through the browser's deflate into IDAT chunks, so
 * any sheet length comes out at full 300 DPI with pHYs set for the RIP.
 */
export async function sheetPng(
  sheet: Sheet,
  opts: { label: string; precut: boolean; dpi: number; onProgress?: (fraction: number) => void },
) {
  const k = opts.dpi
  const width = Math.max(1, Math.round(SHEET_WIDTH_IN * k))
  const height = Math.max(1, Math.round(sheet.lengthIn * k))
  const images = await loadAll(sheet)

  const ihdr = new Uint8Array(13)
  const hv = new DataView(ihdr.buffer)
  hv.setUint32(0, width)
  hv.setUint32(4, height)
  ihdr.set([8, 6, 0, 0, 0], 8) // 8-bit RGBA, no interlace
  const phys = new Uint8Array(9)
  const pv = new DataView(phys.buffer)
  const ppm = Math.round(opts.dpi / 0.0254)
  pv.setUint32(0, ppm)
  pv.setUint32(4, ppm)
  phys[8] = 1

  const parts: BlobPart[] = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('pHYs', phys)]

  const cs = new CompressionStream('deflate') // zlib stream, what IDAT expects
  const writer = cs.writable.getWriter()
  const reading = (async () => {
    const reader = cs.readable.getReader()
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      if (value && value.length) parts.push(chunk('IDAT', value))
    }
  })()

  const strip = document.createElement('canvas')
  strip.width = width
  const ctx = strip.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Could not draw the sheet.')
  const rowBytes = width * 4

  for (let y0 = 0; y0 < height; y0 += STRIP_ROWS) {
    const rows = Math.min(STRIP_ROWS, height - y0)
    if (strip.height !== rows) strip.height = rows
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, width, rows)
    ctx.setTransform(1, 0, 0, 1, 0, -y0)
    paint(ctx, sheet, k, opts, images, [y0, y0 + rows])
    const px = ctx.getImageData(0, 0, width, rows).data
    const filtered = new Uint8Array(rows * (rowBytes + 1))
    for (let r = 0; r < rows; r++) {
      filtered[r * (rowBytes + 1)] = 0 // filter: none
      filtered.set(px.subarray(r * rowBytes, (r + 1) * rowBytes), r * (rowBytes + 1) + 1)
    }
    await writer.write(filtered)
    opts.onProgress?.(Math.min(1, (y0 + rows) / height))
  }
  await writer.close()
  await reading
  parts.push(chunk('IEND', new Uint8Array(0)))
  strip.width = strip.height = 1
  return new Blob(parts, { type: 'image/png' })
}

/**
 * Full-resolution CMYK TIFF (GRACoL 2013, transparent background) at `dpi`, painted strip by
 * strip like sheetPng, so any sheet length works at full 300 DPI.
 */
export async function sheetTiff(
  sheet: Sheet,
  opts: { label: string; precut: boolean; dpi: number; onProgress?: (fraction: number) => void },
) {
  const { cmykTiff } = await import('./tiff')
  const k = opts.dpi
  const width = Math.max(1, Math.round(SHEET_WIDTH_IN * k))
  const height = Math.max(1, Math.round(sheet.lengthIn * k))
  const images = await loadAll(sheet)
  const strip = document.createElement('canvas')
  strip.width = width
  const ctx = strip.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Could not draw the sheet.')
  const blob = await cmykTiff({
    width, height, dpi: opts.dpi, alpha: true, rowsPerStrip: 512, onProgress: opts.onProgress,
    rows: async (y0, rows) => {
      if (strip.height !== rows) strip.height = rows
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, width, rows)
      ctx.setTransform(1, 0, 0, 1, 0, -y0)
      paint(ctx, sheet, k, opts, images, [y0, y0 + rows])
      return ctx.getImageData(0, 0, width, rows).data
    },
  })
  strip.width = strip.height = 1
  return blob
}
