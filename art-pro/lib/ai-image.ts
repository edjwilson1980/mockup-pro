import { loadImage } from './image'
import { at } from './base'

/** `upscaleVia`: 'replicate' is a true pixel upscaler; 'openai' re-creates the art (so it isn't stacked on a redraw). */
export type AiTools = { create: boolean; upscale: boolean; upscaleVia?: 'replicate' | 'openai' | null }
export type AiImageResult = { url: string; w: number; h: number }

/** Shrinks an image for upload (Vercel caps request bodies at 4.5 MB). */
export async function toDataUrl(src: string, maxSide: number) {
  const img = await loadImage(src)
  const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.max(1, Math.round(img.naturalWidth * s)), h = Math.max(1, Math.round(img.naturalHeight * s))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, w, h)
  const a = ctx.getImageData(0, 0, w, h).data
  let hasAlpha = false
  for (let i = 3; i < a.length; i += 4) if (a[i] < 250) { hasAlpha = true; break }
  let dataUrl = c.toDataURL('image/png')
  if (dataUrl.length > 3_500_000) dataUrl = c.toDataURL('image/webp', 0.92)
  return { dataUrl, w, h, hasAlpha }
}

async function resultToBlob(r: { image?: string; url?: string }): Promise<Blob> {
  if (r.image) return (await fetch(r.image)).blob()
  if (!r.url) throw new Error('No image came back')
  try {
    const direct = await fetch(r.url, { mode: 'cors' })
    if (direct.ok) return await direct.blob()
  } catch {
    /* fall through to the proxy */
  }
  const viaProxy = await fetch(at('/api/image?proxy=') + encodeURIComponent(r.url))
  if (!viaProxy.ok) throw new Error('Could not download the result')
  return viaProxy.blob()
}

async function post(body: Record<string, unknown>) {
  const r = await fetch(at('/api/image'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const j = (await r.json().catch(() => ({}))) as { image?: string; url?: string; error?: string; enlarge?: boolean }
  if (!r.ok || j.error) throw new Error(j.error || `Image service error ${r.status}`)
  return j
}

async function finish(blob: Blob, alphaFrom?: string): Promise<AiImageResult> {
  let url = URL.createObjectURL(blob)
  if (alphaFrom) url = await restoreAlpha(url, alphaFrom)
  const img = await loadImage(url)
  return { url, w: img.naturalWidth, h: img.naturalHeight }
}

/** Puts the original's transparency back on an upscaled copy (upscalers often flatten alpha). */
async function restoreAlpha(resultUrl: string, originalSrc: string) {
  const [res, orig] = await Promise.all([loadImage(resultUrl), loadImage(originalSrc)])
  const w = res.naturalWidth, h = res.naturalHeight
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(orig, 0, 0, w, h)
  const mask = ctx.getImageData(0, 0, w, h).data
  ctx.clearRect(0, 0, w, h)
  ctx.drawImage(res, 0, 0)
  const out = ctx.getImageData(0, 0, w, h)
  for (let i = 3; i < out.data.length; i += 4) out.data[i] = Math.min(out.data[i], mask[i])
  ctx.putImageData(out, 0, 0)
  return new Promise<string>((ok, bad) => c.toBlob((b) => (b ? ok(URL.createObjectURL(b)) : bad(new Error('Canvas failed'))), 'image/png'))
}

/** Enlarges an image to at least `minLong` px on its long side (or exactly w×h), in smooth 2× steps. Used for clean, redrawn art. */
async function enlarge(url: string, target: { w: number; h: number } | { minLong: number }): Promise<string> {
  const img = await loadImage(url)
  const iw = img.naturalWidth, ih = img.naturalHeight
  let tw: number, th: number
  if ('w' in target) { tw = target.w; th = target.h } else {
    const k = Math.max(1, target.minLong / Math.max(iw, ih))
    tw = Math.round(iw * k); th = Math.round(ih * k)
  }
  if (tw <= iw && th <= ih) return url
  let cur: CanvasImageSource = img, cw = iw, ch = ih
  while (cw < tw || ch < th) {
    const nw = Math.min(tw, cw * 2), nh = Math.min(th, ch * 2)
    const c = document.createElement('canvas')
    c.width = nw
    c.height = nh
    const ctx = c.getContext('2d')!
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(cur, 0, 0, nw, nh)
    cur = c; cw = nw; ch = nh
  }
  const out = cur as HTMLCanvasElement
  return new Promise<string>((ok, bad) => out.toBlob((b) => (b ? ok(URL.createObjectURL(b)) : bad(new Error('Canvas failed'))), 'image/png'))
}

/** Long side, in pixels, of redrawn art: 12 in at 300 DPI. */
const PRINT_LONG_PX = 3600

export async function aiUpscale(src: string, scale = 4): Promise<AiImageResult> {
  const { dataUrl, hasAlpha, w, h } = await toDataUrl(src, 1400)
  const shape = w > h * 1.2 ? 'landscape' : h > w * 1.2 ? 'portrait' : 'square'
  const j = await post({ op: 'upscale', image: dataUrl, scale, transparent: hasAlpha, shape })
  if (!j.enlarge) return finish(await resultToBlob(j), hasAlpha ? src : undefined)
  // OpenAI recreated it sharp; enlarge it to print size.
  const orig = await loadImage(src)
  const long = Math.min(6000, Math.max(PRINT_LONG_PX, Math.max(orig.naturalWidth, orig.naturalHeight) * Math.min(scale, 4)))
  // OpenAI returns a fixed canvas shape (square, 2:3 or 3:2), so keep its shape rather than stretch it.
  const big = await enlarge(URL.createObjectURL(await resultToBlob(j)), { minLong: long })
  // OpenAI keeps transparency itself (and may shift edges slightly), so the original's alpha isn't re-applied here.
  return finish(await (await fetch(big)).blob())
}

export async function aiCreate(prompt: string, transparent: boolean, shape: string): Promise<AiImageResult> {
  const out = URL.createObjectURL(await resultToBlob(await post({ op: 'create', prompt, transparent, shape })))
  return finish(await (await fetch(await enlarge(out, { minLong: PRINT_LONG_PX }))).blob())
}

export async function aiRedraw(src: string, instructions: string, transparent: boolean): Promise<AiImageResult> {
  const { dataUrl, w, h } = await toDataUrl(src, 1536)
  const shape = w > h * 1.2 ? 'landscape' : h > w * 1.2 ? 'portrait' : 'square'
  const out = URL.createObjectURL(await resultToBlob(await post({ op: 'redraw', image: dataUrl, prompt: instructions, transparent, shape })))
  // The redraw comes back around 1,500 px; enlarge the clean art to full print size.
  return finish(await (await fetch(await enlarge(out, { minLong: PRINT_LONG_PX }))).blob())
}

export async function aiStatus(): Promise<AiTools> {
  try {
    const r = await fetch(at('/api/image'))
    const j = await r.json()
    return { create: !!j.create, upscale: !!j.upscale, upscaleVia: j.upscaleVia ?? null }
  } catch {
    return { create: false, upscale: false }
  }
}
