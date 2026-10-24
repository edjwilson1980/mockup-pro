// What can be ordered: garments, their colors, print spots and sizes. Everything
// comes from the kit's files (garments.json, the *-colors.json files,
// print-sizes.json), the same ones the gang sheet export uses.

import colors from "./mockup/gildan-5000-colors.json";
import hoodieColors from "./mockup/gildan-18500-colors.json";
import garments from "./mockup/garments.json";
import { GARMENT_LIST, garmentHasSpot, getGarment, getSpot, printSizeInches, type Garment } from "./mockup/place";
import printSizes from "./print-sizes.json";
import { SHIRT_SIZES, type Asset, type Design, type PlacedSpot, type SizeCounts } from "./demo/types";

export type GildanColor = (typeof colors)[number];
export type SpotDef = (typeof garments.printSpots)[number];
export type ViewId = "front" | "back" | "side" | "right";

export const DEFAULT_GARMENT = "gildan-5000";
export const GARMENTS: Garment[] = GARMENT_LIST;
export const COLORS: GildanColor[] = colors;
export const SPOTS: SpotDef[] = garments.printSpots;

const COLORS_BY_GARMENT: Record<string, GildanColor[]> = { "gildan-5000": colors, "gildan-18500": hoodieColors };

export function garmentName(garmentId: string = DEFAULT_GARMENT): string {
  return getGarment(garmentId).name;
}

/**
 * Other brands the shop can buy instead, per garment we draw. Only names: the
 * mockup stays on the Gildan photo, and the color picked is the closest Gildan one.
 */
export const BRANDS: Record<string, string[]> = {
  "gildan-5000": [
    "Gildan 64000 Softstyle",
    "Gildan 2000 Ultra Cotton",
    "Bella+Canvas 3001",
    "Next Level 3600",
    "Comfort Colors 1717",
    "Hanes 5250",
    "Port & Company PC54",
    "District DT6000",
    "Jerzees 29M",
    "Fruit of the Loom 3930",
    "Champion CP10",
    "American Apparel 2001",
  ],
  "gildan-18500": [
    "Gildan SF500 Softstyle Fleece",
    "Independent Trading SS4500",
    "Independent Trading IND4000",
    "Champion S700",
    "Hanes P170",
    "Jerzees 996M",
    "Bella+Canvas 3719",
    "Comfort Colors 1567",
    "Port & Company PC78H",
    "Lane Seven LS14001",
    "Russell Athletic 695HBM",
  ],
};

/** "Bella+Canvas 3001 T-shirt", or the garment's own name when no brand was picked. */
export function garmentLabel(d: { garmentId: string; brand?: string | null }): string {
  return d.brand ? `${d.brand} ${getGarment(d.garmentId).short.toLowerCase()}` : garmentName(d.garmentId);
}

/** Colors a garment comes in. */
export function colorsFor(garmentId: string = DEFAULT_GARMENT): GildanColor[] {
  return COLORS_BY_GARMENT[garmentId] ?? colors;
}

/** Print spots a garment offers (no sleeve spots without a sleeve photo). */
export function spotsFor(garmentId: string = DEFAULT_GARMENT): SpotDef[] {
  return SPOTS.filter((s) => garmentHasSpot(garmentId, s.id));
}

/** Views a garment has photos for. */
export function viewsFor(garmentId: string = DEFAULT_GARMENT): ViewId[] {
  const v = getGarment(garmentId).views;
  return (["front", "back", "side", "right"] as const).filter((k) => !!v[k === "right" ? "side" : k]);
}
export const PRINT_DPI = printSizes.printDpi;
export const DPI = { block: printSizes.gangSheet.blockBelowDpi, warn: printSizes.gangSheet.warnBelowDpi };

/** A color by name on a garment; falls back to the tee's list, then the first color. */
export function colorByName(name: string, garmentId: string = DEFAULT_GARMENT): GildanColor {
  return colorsFor(garmentId).find((c) => c.name === name) ?? colors.find((c) => c.name === name) ?? colors[0];
}

/** A print spot, with the garment's overrides (e.g. hoodie size boxes) when given. */
export function spotDef(id: string, garmentId?: string): SpotDef {
  return getSpot(id, garmentId);
}

export function isPersonalized(spotId: string): boolean {
  return spotId === "names-numbers";
}

/** Size labels offered for a spot (from print-sizes.json). */
export function sizeLabels(spotId: string, garmentId?: string): string[] {
  const placement = printSizes.placements.find((p) => p.id === spotDef(spotId, garmentId).sizePlacement);
  return placement?.sizes.map((s) => s.label) ?? [];
}

/**
 * Default size for a new spot. Sleeves use 3.5 in: print-sizes.json recommends
 * "10.5 in", which isn't a sleeve size (open question 3 in the spec).
 */
export function defaultSizeLabel(spotId: string, garmentId?: string): string | null {
  if (isPersonalized(spotId)) return null;
  const s = spotDef(spotId, garmentId);
  if (s.sizePlacement === "Sleeve") return "3.5 in";
  if (spotId === "back-neck") return "3 in";
  const placement = printSizes.placements.find((p) => p.id === s.sizePlacement);
  const labels = placement?.sizes.map((x) => x.label) ?? [];
  return placement && labels.includes(placement.recommended) ? placement.recommended : (labels[0] ?? null);
}

/** Largest standard width for a spot, in inches. Custom sizes above this get a warning. */
export function maxStandardWidthIn(spotId: string, garmentId?: string): number {
  const placement = printSizes.placements.find((p) => p.id === spotDef(spotId, garmentId).sizePlacement);
  return Math.max(0, ...(placement?.sizes.map((s) => s.maxWidthIn) ?? []));
}

/** Biggest custom width offered on a shirt (the gang sheet itself allows up to 22.3 in). */
export const CUSTOM_MAX_IN = 16;
/** Biggest custom height offered on a shirt. */
export const CUSTOM_MAX_H_IN = 22;

/** Largest standard height for a spot, in inches. */
export function maxStandardHeightIn(spotId: string, garmentId?: string): number {
  const placement = printSizes.placements.find((p) => p.id === spotDef(spotId, garmentId).sizePlacement);
  return Math.max(0, ...(placement?.sizes.map((s) => s.maxHeightIn ?? s.maxWidthIn) ?? []));
}

/** Names + numbers block on the back (garments.json → names-numbers). */
export const NAMES_BLOCK = (() => {
  const s = spotDef("names-numbers") as SpotDef & { nameHeightIn: number; numberHeightIn: number; gapIn: number };
  const widthIn = 12;
  return { widthIn, nameIn: s.nameHeightIn, numberIn: s.numberHeightIn, gapIn: s.gapIn, heightIn: s.nameHeightIn + s.gapIn + s.numberHeightIn };
})();

/** Printed size of a spot in inches, fitted to the art like the gang sheet does. */
export function printedInches(
  spot: PlacedSpot,
  asset: Pick<Asset, "widthPx" | "heightPx"> | null,
  garmentId: string = DEFAULT_GARMENT,
): { widthIn: number; heightIn: number } | null {
  if (isPersonalized(spot.spotId)) return { widthIn: NAMES_BLOCK.widthIn, heightIn: NAMES_BLOCK.heightIn };
  if (!asset) return null;
  return printSizeInches({
    garmentId,
    spotId: spot.spotId,
    sizeLabel: spot.sizeLabel ?? undefined,
    widthIn: spot.widthIn,
    heightIn: spot.sizeLabel ? undefined : spot.heightIn,
    artWidthPx: asset.widthPx,
    artHeightPx: asset.heightPx,
  });
}

/** DPI the art prints at, and whether that's fine, soft or too low (gang sheet rules). */
export function dpiAt(asset: Pick<Asset, "widthPx">, widthIn: number): { dpi: number; tone: "ok" | "warn" | "block" } {
  const dpi = Math.round(asset.widthPx / widthIn);
  return { dpi, tone: dpi < DPI.block ? "block" : dpi < DPI.warn ? "warn" : "ok" };
}

export function fmtIn(n: number): string {
  return `${Math.round(n * 100) / 100}`;
}

export function totalShirts(c: SizeCounts): number {
  return SHIRT_SIZES.reduce((s, k) => s + c[k], 0);
}

/** "Full front · Lions wordmark · 10.5″" */
export function spotSummary(spot: PlacedSpot, design: Design, assets: Asset[]): string {
  const def = spotDef(spot.spotId);
  if (isPersonalized(spot.spotId)) return `${def.label} · ${design.roster.length} names`;
  const asset = assets.find((a) => a.id === spot.assetId) ?? null;
  const size = printedInches(spot, asset, design.garmentId);
  return [def.label, asset?.name ?? "no art yet", size ? `${fmtIn(size.widthIn)}″` : null].filter(Boolean).join(" · ");
}

export function orderSummary(designs: Design[]) {
  const shirts = designs.reduce((s, d) => s + totalShirts(d.sizeCounts), 0);
  const spots = designs.reduce((s, d) => s + d.spots.length, 0);
  const names = designs.reduce((s, d) => s + (d.spots.some((x) => isPersonalized(x.spotId)) ? d.roster.length : 0), 0);
  return { shirts, designs: designs.length, spots, names };
}

export function summaryText(designs: Design[]): string {
  const s = orderSummary(designs);
  const parts = [`${s.shirts} shirts`, `${s.designs} ${s.designs === 1 ? "design" : "designs"}`, `${s.spots} print ${s.spots === 1 ? "spot" : "spots"}`];
  if (s.names) parts.push(`${s.names} names`);
  return parts.join(" · ");
}
