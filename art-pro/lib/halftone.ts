import { DPI } from './sheet-size'
import { canvasToBlob, loadImage, withDpi } from './image'

/**
 * dark  — dark garments: blacks/darks drop into the shirt, mid-tones become dots (the "halftone knockout").
 * light — white/light garments: whites/lights drop out, mid-tones become dots.
 * fade  — keeps every color; only soft edges, glows, shadows and see-through areas turn into dots.
 */
export type HalftoneMode = 'dark' | 'light' | 'fade'
export type HalftoneOptions = { mode: HalftoneMode; lpi: number; angle: number }
export const HALFTONE_DEFAULT: HalftoneOptions = { mode: 'dark', lpi: 45, angle: 22.5 }

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** Round-dot halftone at print resolution. Output is fully solid or fully clear (DTF friendly). */
export async function halftone(src: string, o: HalftoneOptions): Promise<{ url: string; blob: Blob }> {
  const img = await loadImage(src)
  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0)
  const data = ctx.getImageData(0, 0, c.width, c.height)
  halftoneData(data, o, DPI)
  ctx.putImageData(data, 0, 0)
  const blob = await withDpi(await canvasToBlob(c), DPI)
  return { url: URL.createObjectURL(blob), blob }
}

/** In-place halftone. `dpi` is the resolution the pixels will print at, so dots come out at the right LPI. */
export function halftoneData(data: ImageData, o: HalftoneOptions, dpi: number) {
  const w = data.width, h = data.height
  const d = data.data
  const cell = Math.max(2, dpi / Math.max(10, Math.min(120, o.lpi)))
  const a = (o.angle * Math.PI) / 180
  const cos = Math.cos(a), sin = Math.sin(a)
  // Cell grid bounds in rotated (u, v) space.
  const corners = [[0, 0], [w, 0], [0, h], [w, h]].map(([x, y]) => [x * cos + y * sin, -x * sin + y * cos])
  const u0 = Math.floor(Math.min(...corners.map((p) => p[0])) / cell) - 1
  const v0 = Math.floor(Math.min(...corners.map((p) => p[1])) / cell) - 1
  const nu = Math.ceil(Math.max(...corners.map((p) => p[0])) / cell) - u0 + 2
  const nv = Math.ceil(Math.max(...corners.map((p) => p[1])) / cell) - v0 + 2
  const sum = new Float32Array(nu * nv), cnt = new Uint32Array(nu * nv)
  const cr = new Float32Array(nu * nv), cg = new Float32Array(nu * nv), cb = new Float32Array(nu * nv)
  const cov = new Uint8Array(w * h)
  const cellOf = new Int32Array(w * h)

  for (let y = 0, p = 0; y < h; y++) {
    for (let x = 0; x < w; x++, p++) {
      const i = p * 4
      const al = d[i + 3] / 255
      const L = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255
      const k = o.mode === 'dark' ? al * clamp((L - 0.06) / 0.5) : o.mode === 'light' ? al * clamp((0.94 - L) / 0.5) : al
      cov[p] = Math.round(k * 255)
      const u = x * cos + y * sin, v = -x * sin + y * cos
      const ci = (Math.floor(u / cell) - u0) * nv + (Math.floor(v / cell) - v0)
      cellOf[p] = ci
      sum[ci] += k
      cnt[ci]++
      cr[ci] += d[i] * k
      cg[ci] += d[i + 1] * k
      cb[ci] += d[i + 2] * k
    }
  }

  for (let y = 0, p = 0; y < h; y++) {
    for (let x = 0; x < w; x++, p++) {
      const i = p * 4
      const ci = cellOf[p]
      const s = sum[ci]
      const avg = cnt[ci] ? s / cnt[ci] : 0
      let inside = false
      if (avg >= 0.92) inside = cov[p] > 127
      else if (avg > 0.01) {
        const u = x * cos + y * sin, v = -x * sin + y * cos
        const cu = (Math.floor(u / cell) + 0.5) * cell, cv = (Math.floor(v / cell) + 0.5) * cell
        const r = cell * Math.sqrt(avg / Math.PI) * 1.02
        inside = (u - cu) * (u - cu) + (v - cv) * (v - cv) <= r * r
      }
      if (!inside) {
        d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0
        continue
      }
      // Keep the art's own color inside the dot; borrow the cell's color where the pixel itself was clear.
      if (d[i + 3] < 128 || cov[p] < 20) {
        d[i] = Math.round(cr[ci] / s)
        d[i + 1] = Math.round(cg[ci] / s)
        d[i + 2] = Math.round(cb[ci] / s)
      }
      d[i + 3] = 255
    }
  }
}
