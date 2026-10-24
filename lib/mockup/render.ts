/**
 * Mockup Pro — browser rendering. Builds a finished mockup PNG:
 * blank Gildan shirt in the chosen color + every print spot's artwork at its true size.
 *
 *   const png = await renderMockup({
 *     garmentId: 'gildan-5000', view: 'front', colorHex: '#25282A',
 *     spots: [{ spotId: 'full-front', artUrl, sizeLabel: 'Medium · 10.5 × 12 in' }],
 *   })
 *
 * The returned PNG is tagged as a mockup (lib/art-kind.ts) so the gang sheet refuses it.
 */
import { decodeFoldMap, fabricShade, recolorShirt, type FoldMap, type Raster } from '@/lib/mockup/recolor'
import { getGarment, pressArt, spotRect, viewPhoto, type ViewId } from '@/lib/mockup/place'
import { tagPngAsMockup } from '@/lib/art-kind'

export type MockupSpot = {
  spotId: string
  artUrl: string
  sizeLabel?: string
  widthIn?: number
  heightIn?: number
  freeXIn?: number
  freeYIn?: number
  moveXIn?: number
  moveYIn?: number
}

export type MockupRequest = {
  garmentId: string
  view: ViewId
  colorHex: string
  spots: MockupSpot[]
  /** Crop to the shirt (default true). */
  trim?: boolean
}

const foldCache = new Map<string, Promise<{ map: FoldMap; shade: Float32Array }>>()

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Could not load ${src}`))
    img.src = src
  })
}

async function readRaster(src: string, width?: number, height?: number): Promise<Raster> {
  const img = await loadImage(src)
  const w = Math.max(1, Math.round(width ?? img.naturalWidth))
  const h = Math.max(1, Math.round(height ?? img.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas is not available.')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)
  const d = ctx.getImageData(0, 0, w, h)
  return { width: w, height: h, data: d.data }
}

function loadFold(garmentId: string, view: ViewId) {
  const key = `${garmentId}:${view}`
  if (!foldCache.has(key)) {
    const v = viewPhoto(getGarment(garmentId), view)
    if (!v) throw new Error(`No ${view} photo for ${garmentId}`)
    const url = v.foldmap
    foldCache.set(
      key,
      readRaster(url).then((r) => {
        const map = decodeFoldMap(r)
        if (view === 'right') mirror(map)
        return { map, shade: fabricShade(map) }
      }),
    )
  }
  return foldCache.get(key)!
}

/** Flip a fold map left-to-right, in place (right sleeve from the left-side photo). */
function mirror(map: FoldMap) {
  const { width, height, fold, alpha } = map
  for (let y = 0; y < height; y++) {
    for (let x = 0, r = width - 1; x < r; x++, r--) {
      const a = y * width + x
      const b = y * width + r
      ;[fold[a], fold[b]] = [fold[b], fold[a]]
      ;[alpha[a], alpha[b]] = [alpha[b], alpha[a]]
    }
  }
}

/** Draw the mockup into a canvas (useful for live previews). */
export async function renderMockupCanvas(req: MockupRequest): Promise<HTMLCanvasElement> {
  const { map, shade } = await loadFold(req.garmentId, req.view)
  const shirt = recolorShirt(map, req.colorHex)

  for (const spot of req.spots) {
    const probe = await loadImage(spot.artUrl)
    const rect = spotRect({
      garmentId: req.garmentId,
      spotId: spot.spotId,
      sizeLabel: spot.sizeLabel,
      widthIn: spot.widthIn,
      heightIn: spot.heightIn,
      freeXIn: spot.freeXIn,
      freeYIn: spot.freeYIn,
      moveXIn: spot.moveXIn,
      moveYIn: spot.moveYIn,
      artWidthPx: probe.naturalWidth,
      artHeightPx: probe.naturalHeight,
    })
    if (rect.view !== req.view) continue
    const art = await readRaster(spot.artUrl, rect.width, rect.height)
    pressArt(shirt, art, rect.x, rect.y, shade)
  }

  const canvas = document.createElement('canvas')
  canvas.width = shirt.width
  canvas.height = shirt.height
  const ctx = canvas.getContext('2d')!
  // recolorShirt allocates a plain ArrayBuffer; the cast satisfies TypeScript 5.9's ImageData types.
  ctx.putImageData(new ImageData(shirt.data as Uint8ClampedArray<ArrayBuffer>, shirt.width, shirt.height), 0, 0)
  if (req.trim === false) return canvas
  return trimCanvas(canvas, map)
}

function trimCanvas(canvas: HTMLCanvasElement, map: FoldMap) {
  let minX = map.width, minY = map.height, maxX = 0, maxY = 0
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (map.alpha[y * map.width + x] > 3) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  const out = document.createElement('canvas')
  out.width = maxX - minX + 1
  out.height = maxY - minY + 1
  out.getContext('2d')!.drawImage(canvas, -minX, -minY)
  return out
}

/** Finished mockup as a PNG Blob, tagged so it can never be printed. */
export async function renderMockup(req: MockupRequest): Promise<Blob> {
  const canvas = await renderMockupCanvas(req)
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not export the mockup.'))), 'image/png'),
  )
  return tagPngAsMockup(blob)
}
