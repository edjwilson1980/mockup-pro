// Mockup Pro → South Side DTF gang sheet builder.
//
// Turns an approved order's transfers into a `.ssp.json` project file that the
// South Side DTF shop builder (`/shop` → Reopen Project → upload or paste)
// opens with every design, size and quantity already filled in.
//
// The format is the builder's own (`lib/project/types.ts` in southside-dtf,
// format "ssp-gangsheet-project", schema 2). What the builder actually reads on
// load, and so what this file must get right:
// - `format` must be exactly "ssp-gangsheet-project" (the only hard check).
// - Artwork comes only from `images[].dataUrl`. `driveFileId` is never fetched.
// - `pixelWidth` / `pixelHeight` must be the art's real pixel size, or the art
//   is stretched to fill its size box.
// - `placement` must be one of the builder's placements, or it becomes Custom.
// - `size` must be a label from that placement's list, character for character
//   (" · " and "×"), or the size menu shows it wrong. Labels come from
//   print-sizes.json, the same list the builder uses.
// - Custom sizes use `customWidth` / `customHeight` as strings, in inches.
// - Positions are not stored: the builder packs the sheet itself on open.
// See docs/mockup-pro/SSP_EXPORT.md for the full contract.

import printSizes from "./print-sizes.json" with { type: "json" };

export const SSP_FORMAT = "ssp-gangsheet-project";
export const SSP_SCHEMA_VERSION = 2;

/** Builder placements, in the builder's order. "Custom" takes any W × H. */
export const SSP_PLACEMENTS: readonly string[] = printSizes.placements.map((p) => p.id);

const LABELS = new Map<string, Set<string>>(printSizes.placements.map((p) => [p.id, new Set(p.sizes.map((s) => s.label))]));

/** Longest edge the builder accepts on upload. */
const MAX_EDGE_PX = 8000;
/** Custom size limits: printable film width, and the tallest transfer the builder packs (inches). */
const PRINTABLE_WIDTH_IN = printSizes.customPlacement.maxWidthIn;
const MAX_CUSTOM_HEIGHT_IN = printSizes.customPlacement.maxHeightIn;

export type Transfer = {
  /** Shown in the builder's design list, e.g. "Lions logo · front" or "SMITH 23". */
  name: string;
  /** "print-art" only. Mockups (art shown on a shirt) never go on a sheet. */
  kind: "print-art" | "mockup";
  /** A builder placement (see SSP_PLACEMENTS). */
  placement: string;
  /** Exact label from print-sizes.json for that placement. Not used for Custom. */
  sizeLabel?: string;
  /** Custom only: the size box in inches. */
  customWidthIn?: number;
  customHeightIn?: number;
  quantity: number;
  /** Trimmed, transparent PNG. */
  png: { dataUrl: string; pixelWidth: number; pixelHeight: number };
  /** False lets the builder turn it 90° to save film. Names/numbers should stay upright. */
  keepUpright?: boolean;
};

export type ExportInput = {
  /** Mockup Pro order number, kept in `orderRefs` and the project name. */
  orderNumber: string;
  customer: { name: string; email?: string | null; phone?: string | null };
  transfers: Transfer[];
  /** Pre-cut / Square Cut on the whole sheet. */
  cut?: boolean;
  /** Reuse to update a file sent before; omit for a new project. */
  projectId?: string;
  revision?: number;
  createdAt?: string;
  /** Mockup Pro version, for support. */
  appVersion?: string;
  now?: Date;
};

export type SspImage = {
  id: number;
  name: string;
  placement: string;
  size: string;
  customWidth: string;
  customHeight: string;
  quantity: number;
  keepUpright: boolean;
  pixelWidth: number;
  pixelHeight: number;
  dataUrl: string;
};

export type SspProject = {
  format: typeof SSP_FORMAT;
  schemaVersion: number;
  projectId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  source: "shop-builder";
  revision: number;
  customer: { name: string; email: string | null; phone: string | null };
  product: { printType: "dtf"; rollWidthIn: number; widthIn: number };
  cut: { enabled: boolean };
  images: SspImage[];
  orderRefs: { system: "mockup-pro"; orderNumber: string }[];
  snapshot: null;
  codeVersion: { builder: string; mockupPro?: string };
};

export class SspExportError extends Error {}

/** Size box in inches: the label's "W × H" (or "W" for square), or the custom box. */
export function boxInches(t: Pick<Transfer, "placement" | "sizeLabel" | "customWidthIn" | "customHeightIn">): { w: number; h: number } {
  if (t.placement === "Custom") return { w: t.customWidthIn ?? 0, h: t.customHeightIn ?? 0 };
  const label = t.sizeLabel ?? "";
  const dims = label.slice(label.lastIndexOf(" · ") + 1).match(/[\d.]+/g)?.map(Number) ?? [];
  return { w: dims[0] ?? 0, h: dims[1] ?? dims[0] ?? 0 };
}

function check(t: Transfer, i: number): void {
  const where = `Transfer ${i + 1} (“${t.name}”)`;
  if (t.kind !== "print-art" || /_MOCKUP/i.test(t.name)) throw new SspExportError(`${where} is a mockup. Only print art can go on a gang sheet.`);
  if (!t.name.trim()) throw new SspExportError(`Transfer ${i + 1} needs a name.`);
  if (!SSP_PLACEMENTS.includes(t.placement)) throw new SspExportError(`${where}: “${t.placement}” isn't a gang sheet placement.`);
  if (t.placement === "Custom") {
    const { w, h } = boxInches(t);
    if (!(w > 0 && w <= PRINTABLE_WIDTH_IN)) throw new SspExportError(`${where}: custom width must be over 0 and at most ${PRINTABLE_WIDTH_IN} in.`);
    if (!(h > 0 && h <= MAX_CUSTOM_HEIGHT_IN)) throw new SspExportError(`${where}: custom height must be over 0 and at most ${MAX_CUSTOM_HEIGHT_IN} in.`);
  } else if (!t.sizeLabel || !LABELS.get(t.placement)?.has(t.sizeLabel)) {
    throw new SspExportError(`${where}: “${t.sizeLabel ?? ""}” isn't a ${t.placement} size. Use a label from print-sizes.json.`);
  }
  if (!Number.isInteger(t.quantity) || t.quantity < 1) throw new SspExportError(`${where}: quantity must be a whole number, 1 or more.`);
  if (!t.png.dataUrl.startsWith("data:image/png;base64,")) throw new SspExportError(`${where}: artwork must be a PNG data URL.`);
  const { pixelWidth: w, pixelHeight: h } = t.png;
  if (!(Number.isInteger(w) && Number.isInteger(h) && w > 0 && h > 0)) throw new SspExportError(`${where}: pixel size is missing.`);
  if (Math.max(w, h) > MAX_EDGE_PX) throw new SspExportError(`${where}: artwork is over ${MAX_EDGE_PX} px on its longest edge.`);
  const real = pngSize(t.png.dataUrl);
  if (!real) throw new SspExportError(`${where}: artwork isn't a readable PNG.`);
  if (real.w !== w || real.h !== h) throw new SspExportError(`${where}: says ${w} × ${h} px but the PNG is ${real.w} × ${real.h} px.`);
}

/** Width and height from a PNG data URL's header, or null if it isn't a PNG. */
export function pngSize(dataUrl: string): { w: number; h: number } | null {
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1, dataUrl.indexOf(",") + 1 + 44);
  let bin: string;
  try {
    bin = atob(b64);
  } catch {
    return null;
  }
  const byte = (i: number) => bin.charCodeAt(i);
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bin.length < 24 || sig.some((v, i) => byte(i) !== v) || bin.slice(12, 16) !== "IHDR") return null;
  const u32 = (i: number) => ((byte(i) << 24) | (byte(i + 1) << 16) | (byte(i + 2) << 8) | byte(i + 3)) >>> 0;
  return { w: u32(16), h: u32(20) };
}

/** "prj_" + 6 base36 characters, like the builder makes. */
export function newProjectId(random: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += Math.floor(random() * 36).toString(36);
  return `prj_${s}`;
}

/**
 * Builds the project. Transfers keep the order given: Mockup Pro sorts them by
 * garment size, then roster order (spec Phase 5), so pressing goes in order.
 * Throws SspExportError with a plain sentence when something can't go on a sheet.
 */
export function buildSspProject(input: ExportInput): SspProject {
  if (!input.transfers.length) throw new SspExportError("Nothing to put on the gang sheet.");
  input.transfers.forEach(check);
  const now = (input.now ?? new Date()).toISOString();
  const base = Date.parse(now);
  const customerName = input.customer.name.trim();
  return {
    format: SSP_FORMAT,
    schemaVersion: SSP_SCHEMA_VERSION,
    projectId: input.projectId ?? newProjectId(),
    name: `${customerName} · ${input.orderNumber}`,
    createdAt: input.createdAt ?? now,
    updatedAt: now,
    source: "shop-builder",
    revision: input.revision ?? 1,
    customer: { name: customerName, email: input.customer.email ?? null, phone: input.customer.phone ?? null },
    product: { printType: "dtf", rollWidthIn: PRINTABLE_WIDTH_IN, widthIn: PRINTABLE_WIDTH_IN },
    cut: { enabled: Boolean(input.cut) },
    images: input.transfers.map((t, n) => {
      const custom = t.placement === "Custom";
      const box = boxInches(t);
      return {
        id: base + n,
        name: t.name.trim(),
        placement: t.placement,
        size: custom ? `${box.w} × ${box.h} in` : t.sizeLabel!,
        customWidth: custom ? String(box.w) : "",
        customHeight: custom ? String(box.h) : "",
        quantity: t.quantity,
        keepUpright: t.keepUpright ?? false,
        pixelWidth: t.png.pixelWidth,
        pixelHeight: t.png.pixelHeight,
        dataUrl: t.png.dataUrl,
      };
    }),
    orderRefs: [{ system: "mockup-pro", orderNumber: input.orderNumber }],
    snapshot: null,
    codeVersion: { builder: "2.3.0", ...(input.appVersion ? { mockupPro: input.appVersion } : {}) },
  };
}

/** File name for a download, e.g. "Lincoln Park Lions MP1042.ssp.json". */
export function sspFileName(p: Pick<SspProject, "customer" | "orderRefs">): string {
  const base = `${p.customer.name} ${p.orderRefs[0]?.orderNumber ?? ""}`.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  return `${base || "gang-sheet"}.ssp.json`;
}
