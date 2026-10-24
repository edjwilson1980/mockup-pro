// Where each print spot lands on the 1000 × 1250 master photo, for drawing
// print areas and the press station's measurements over a mockup.

import { garmentHasSpot, getGarment, spotRect } from "./mockup/place";
import { DEFAULT_GARMENT, NAMES_BLOCK, isPersonalized, spotDef, type ViewId } from "./catalog";
import type { Asset, PlacedSpot } from "./demo/types";

export type SpotBox = { id: string; label: string; x: number; y: number; width: number; height: number; widthIn: number; heightIn: number; belowCollarIn: number | null };

/** Every garment photo shares the 1000 × 1250 frame; inches differ per garment. */
export const MASTER = { width: 1000, height: 1250 };

export function pxPerInch(garmentId: string = DEFAULT_GARMENT): number {
  return getGarment(garmentId).pxPerInch;
}

export function spotBoxes(spots: PlacedSpot[], view: ViewId, assets: Asset[], garmentId: string = DEFAULT_GARMENT): SpotBox[] {
  const out: SpotBox[] = [];
  const g = getGarment(garmentId);
  for (const s of spots) {
    const def = spotDef(s.spotId, garmentId);
    if (def.view !== view || !garmentHasSpot(garmentId, s.spotId)) continue;
    const named = isPersonalized(s.spotId);
    const asset = assets.find((a) => a.id === s.assetId);
    if (!named && !asset) continue;
    const r = spotRect({
      garmentId,
      spotId: s.spotId,
      sizeLabel: named ? undefined : (s.sizeLabel ?? undefined),
      widthIn: named ? NAMES_BLOCK.widthIn : s.widthIn,
      heightIn: named ? NAMES_BLOCK.heightIn : s.sizeLabel ? undefined : s.heightIn,
      freeXIn: s.freeXIn,
      freeYIn: s.freeYIn,
      moveXIn: s.moveXIn,
      moveYIn: s.moveYIn,
      artWidthPx: named ? NAMES_BLOCK.widthIn : asset!.widthPx,
      artHeightPx: named ? NAMES_BLOCK.heightIn : asset!.heightPx,
    });
    const collar = view === "side" || view === "right" ? null : (g.views[view]?.collarBottomY ?? null);
    out.push({
      id: s.id,
      label: def.label,
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      widthIn: r.widthIn,
      heightIn: r.heightIn,
      belowCollarIn: collar === null ? null : (r.y - collar) / g.pxPerInch,
    });
  }
  return out;
}

/** Collar point for a view (front/back), in master pixels. */
export function collarPoint(view: ViewId, garmentId: string = DEFAULT_GARMENT): { x: number; y: number } | null {
  if (view === "side" || view === "right") return null;
  const v = getGarment(garmentId).views[view];
  return v ? { x: v.centerX, y: v.collarBottomY } : null;
}
