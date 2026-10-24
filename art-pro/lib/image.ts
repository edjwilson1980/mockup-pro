import { DPI } from './sheet-size'

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read that image'))
    img.src = src
  })
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png'): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas too large for this browser'))), type),
  )
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export type PrepOptions = {
  widthIn: number
  heightIn: number
  /** Fit inside the box (keeps aspect). */
  knockout: 'none' | 'black' | 'white'
  tolerance: number // 0–255
  cleanAlpha: boolean
}

/**
 * Make a print-ready transfer: knock out a background color, force alpha to
 * fully solid or fully clear (no semi-transparent haze under DTF white), and
 * size it to inches at 300 DPI, fitting inside the requested box.
 */
export async function preparePrint(src: string, o: PrepOptions) {
  const img = await loadImage(src)
  const scale = Math.min((o.widthIn * DPI) / img.width, (o.heightIn * DPI) / img.height)
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h)
  const d = data.data
  const t = o.tolerance
  for (let i = 0; i < d.length; i += 4) {
    if (o.knockout === 'black' && d[i] <= t && d[i + 1] <= t && d[i + 2] <= t) d[i + 3] = 0
    else if (o.knockout === 'white' && d[i] >= 255 - t && d[i + 1] >= 255 - t && d[i + 2] >= 255 - t) d[i + 3] = 0
    if (o.cleanAlpha) d[i + 3] = d[i + 3] >= 128 ? 255 : 0
    if (d[i + 3] === 0) d[i] = d[i + 1] = d[i + 2] = 0
  }
  ctx.putImageData(data, 0, 0)
  const blob = await withDpi(await canvasToBlob(c), DPI)
  return { url: URL.createObjectURL(blob), blob, widthIn: w / DPI, heightIn: h / DPI, px: [w, h] as [number, number] }
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(bytes: Uint8Array, seed = 0) {
  let c = (seed ^ 0xffffffff) >>> 0
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Writes a pHYs chunk so RIP software opens the PNG at the right DPI. */
export async function withDpi(blob: Blob, dpi: number): Promise<Blob> {
  const src = new Uint8Array(await blob.arrayBuffer())
  const ppm = Math.round(dpi / 0.0254)
  const chunk = new Uint8Array(21)
  const view = new DataView(chunk.buffer)
  view.setUint32(0, 9)
  chunk.set([0x70, 0x48, 0x59, 0x73], 4) // pHYs
  view.setUint32(8, ppm)
  view.setUint32(12, ppm)
  chunk[16] = 1
  view.setUint32(17, crc32(chunk.subarray(4, 17)))
  // PNG signature (8) + IHDR chunk (25) — insert right after IHDR.
  const at = 33
  const out = new Uint8Array(src.length + chunk.length)
  out.set(src.subarray(0, at), 0)
  out.set(chunk, at)
  out.set(src.subarray(at), at + chunk.length)
  return new Blob([out], { type: 'image/png' })
}
