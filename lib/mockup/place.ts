/**
 * Mockup Pro — where artwork goes on the shirt, and pressing it into the fabric.
 *
 * Sizes come from lib/print-sizes.json (the same file the gang sheet uses), so the
 * mockup and the printed transfer are always the same size.
 */
import garments from '@/lib/mockup/garments.json'
import printSizes from '@/lib/print-sizes.json'
import type { Raster } from '@/lib/mockup/recolor'

/** 'side' is the left sleeve photo; 'right' is the same photo mirrored. */
export type ViewId = 'front' | 'back' | 'side' | 'right'
export type Rect = { x: number; y: number; width: number; height: number }

export type SpotRequest = {
  garmentId: string
  spotId: string
  /** Exact label from print-sizes.json, e.g. "Medium · 10.5 × 12 in". */
  sizeLabel?: string
  /** Used when there is no size label (Custom spots, sleeve widths). */
  widthIn?: number
  heightIn?: number
  /** Artwork pixel size, to keep its proportions. */
  artWidthPx: number
  artHeightPx: number
  /** Free placement for the "Somewhere else" spot, inches from the collar point. */
  freeXIn?: number
  freeYIn?: number
  /** Manual placement: inches moved from the spot's standard position (right / down). */
  moveXIn?: number
  moveYIn?: number
}

type CollarView = { foldmap: string; white?: string; collarBottomY: number; centerX: number }
type SideView = { foldmap: string; white?: string; sleeveCenterX: number; sleeveTopY: number }
type SpotOverride = { sizePlacement?: string; belowCollarIn?: number; offsetXIn?: number }

export type Garment = {
  id: string
  name: string
  short: string
  colorsFile: string
  imageWidthPx: number
  imageHeightPx: number
  pxPerInch: number
  views: { front?: CollarView; back?: CollarView; side?: SideView }
  /** Spot ids this garment offers; all spots when missing. */
  spots?: string[]
  /** Per-spot changes, e.g. a hoodie's full front uses the Hoodie Front sizes. */
  spotOverrides?: Record<string, SpotOverride>
}
type Spot = (typeof garments.printSpots)[number]

export const GARMENT_LIST = garments.garments as Garment[]

export function getGarment(id: string): Garment {
  const g = GARMENT_LIST.find((item) => item.id === id)
  if (!g) throw new Error(`Unknown garment: ${id}`)
  return g
}

/** A print spot as it is on this garment (overrides applied). */
export function getSpot(id: string, garmentId?: string): Spot {
  const s = garments.printSpots.find((item) => item.id === id)
  if (!s) throw new Error(`Unknown print spot: ${id}`)
  const o = garmentId ? getGarment(garmentId).spotOverrides?.[id] : undefined
  return o ? { ...s, ...o } : s
}

/** The photo a view is drawn from (the right sleeve mirrors the side photo). */
export function viewPhoto(g: Garment, view: ViewId): CollarView | SideView | undefined {
  return view === 'right' ? g.views.side : g.views[view]
}

/** Whether a garment offers a spot (and has the photo for its view). */
export function garmentHasSpot(garmentId: string, spotId: string): boolean {
  const g = getGarment(garmentId)
  const s = getSpot(spotId)
  return (!g.spots || g.spots.includes(spotId)) && !!viewPhoto(g, s.view as ViewId)
}

/** Max box (inches) for a size label, exactly how the gang sheet reads it. */
export function boxForSizeLabel(placementId: string, label: string): { widthIn: number; heightIn: number } {
  const placement = printSizes.placements.find((p) => p.id === placementId)
  const size = placement?.sizes.find((s) => s.label === label)
  if (size) return { widthIn: size.maxWidthIn, heightIn: size.maxHeightIn }
  const nums = [...label.matchAll(/[0-9]+(?:\.[0-9]+)?/g)].map((m) => Number(m[0]))
  if (nums.length >= 2) return { widthIn: nums[0], heightIn: nums[1] }
  if (nums.length === 1) return { widthIn: nums[0], heightIn: nums[0] }
  throw new Error(`Can't read a size from "${label}"`)
}

/** Fit artwork inside a max box, keeping proportions (same rule as lib/compose-sheet.ts). */
export function fitInBox(boxW: number, boxH: number, artW: number, artH: number) {
  const aspect = artH / artW
  if (boxW * aspect <= boxH + 1e-6) return { widthIn: boxW, heightIn: boxW * aspect }
  return { widthIn: boxH / aspect, heightIn: boxH }
}

/** Printed size in inches for a spot request. */
export function printSizeInches(req: SpotRequest) {
  const spot = getSpot(req.spotId, req.garmentId)
  let box: { widthIn: number; heightIn: number }
  if (req.sizeLabel) box = boxForSizeLabel(spot.sizePlacement, req.sizeLabel)
  else {
    const w = req.widthIn ?? ('defaultWidthIn' in spot ? (spot.defaultWidthIn as number) : 3)
    box = { widthIn: w, heightIn: req.heightIn ?? w * 4 }
  }
  return fitInBox(box.widthIn, box.heightIn, req.artWidthPx, req.artHeightPx)
}

/** Where the art lands on the master photo, in master-image pixels. */
export function spotRect(req: SpotRequest): Rect & { view: ViewId; widthIn: number; heightIn: number } {
  const r = standardRect(req)
  const ppi = getGarment(req.garmentId).pxPerInch
  return { ...r, x: r.x + (req.moveXIn ?? 0) * ppi, y: r.y + (req.moveYIn ?? 0) * ppi }
}

function standardRect(req: SpotRequest): Rect & { view: ViewId; widthIn: number; heightIn: number } {
  const g = getGarment(req.garmentId)
  const spot = getSpot(req.spotId, req.garmentId)
  const ppi = g.pxPerInch
  const size = printSizeInches(req)
  const w = size.widthIn * ppi
  const h = size.heightIn * ppi
  const view = spot.view as ViewId

  if (spot.anchor === 'sleeve') {
    const side = g.views.side
    if (!side) throw new Error(`${g.name} has no sleeve view`)
    const cx = view === 'right' ? g.imageWidthPx - side.sleeveCenterX : side.sleeveCenterX
    return { view, x: cx - w / 2, y: side.sleeveTopY, width: w, height: h, ...size }
  }
  const v = view === 'back' ? g.views.back : g.views.front
  if (!v) throw new Error(`${g.name} has no ${view} view`)
  if (spot.anchor === 'free') {
    const cx = v.centerX + (req.freeXIn ?? 0) * ppi
    const top = v.collarBottomY + (req.freeYIn ?? 3) * ppi
    return { view, x: cx - w / 2, y: top, width: w, height: h, ...size }
  }
  const cx = v.centerX + spot.offsetXIn * ppi
  const top = v.collarBottomY + spot.belowCollarIn * ppi
  return { view, x: cx - w / 2, y: top, width: w, height: h, ...size }
}

/**
 * Press already-scaled artwork onto a recolored shirt, in place.
 * art must be exactly rect.width × rect.height pixels (scale it with canvas first).
 * shade comes from fabricShade() for the same view.
 */
export function pressArt(shirt: Raster, art: Raster, x: number, y: number, shade: Float32Array) {
  const x0 = Math.round(x)
  const y0 = Math.round(y)
  for (let ay = 0; ay < art.height; ay++) {
    const sy = y0 + ay
    if (sy < 0 || sy >= shirt.height) continue
    for (let ax = 0; ax < art.width; ax++) {
      const sx = x0 + ax
      if (sx < 0 || sx >= shirt.width) continue
      const ap = (ay * art.width + ax) * 4
      const aa = art.data[ap + 3] / 255
      if (aa === 0) continue
      const si = sy * shirt.width + sx
      const sp = si * 4
      // only print where there is shirt
      const cover = shirt.data[sp + 3] / 255
      if (cover === 0) continue
      const k = aa * cover
      const f = 1 - k * (1 - shade[si])
      for (let c = 0; c < 3; c++) {
        const mixed = shirt.data[sp + c] * (1 - k) + art.data[ap + c] * k
        shirt.data[sp + c] = mixed * f
      }
    }
  }
}
