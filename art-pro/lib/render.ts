import { canvasToBlob, loadImage, withDpi } from './image'
import { halftoneData, type HalftoneOptions } from './halftone'
import { knockout, type Knockout } from './knockout'
import { localUrl } from './jobs'

export type RenderOpts = {
  /** Print width in inches; omit to keep the source pixels (Artwork preview). */
  widthIn?: number
  /** Optional max height in inches (fits inside the box). */
  maxHeightIn?: number
  /** Resolution the result prints at. */
  dpi: number
  knockout: Knockout
  halftone: HalftoneOptions | null
  /** Force fully solid / fully clear pixels (always on for print). */
  hardAlpha: boolean
}

export type Rendered = { url: string; blob: Blob; px: [number, number]; widthIn: number; heightIn: number; srcDpi: number }

const cache = new Map<string, Promise<Rendered>>()

/** Source art → sized, background removed, halftoned (or alpha-cleaned) PNG at the given DPI. Cached. */
export function renderArt(src: string, srcPx: [number, number], o: RenderOpts): Promise<Rendered> {
  const key = JSON.stringify([src, o])
  let p = cache.get(key)
  if (!p) {
    p = doRender(src, srcPx, o)
    p.catch(() => cache.delete(key))
    cache.set(key, p)
    if (cache.size > 60) cache.delete(cache.keys().next().value as string)
  }
  return p
}

async function doRender(src: string, srcPx: [number, number], o: RenderOpts): Promise<Rendered> {
  const img = await loadImage(await localUrl(src))
  const [sw, sh] = [img.naturalWidth || srcPx[0], img.naturalHeight || srcPx[1]]
  let widthIn = o.widthIn ?? sw / o.dpi
  if (o.maxHeightIn && (widthIn * sh) / sw > o.maxHeightIn) widthIn = (o.maxHeightIn * sw) / sh
  const w = Math.max(1, Math.round(widthIn * o.dpi))
  const h = Math.max(1, Math.round((w * sh) / sw))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h)
  knockout(data, o.knockout)
  if (o.halftone) halftoneData(data, o.halftone, o.dpi)
  else if (o.hardAlpha) {
    const d = data.data
    for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= 128 ? 255 : 0
  }
  const d = data.data
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] === 0) d[i] = d[i + 1] = d[i + 2] = 0
  ctx.putImageData(data, 0, 0)
  const blob = await withDpi(await canvasToBlob(c), o.dpi)
  return { url: URL.createObjectURL(blob), blob, px: [w, h], widthIn: w / o.dpi, heightIn: h / o.dpi, srcDpi: Math.round(sw / widthIn) }
}

/** Width in inches this art stays sharp (150 DPI). */
export const sharpWidth = (px: [number, number]) => Math.round((px[0] / 150) * 10) / 10
