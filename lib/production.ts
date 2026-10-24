// Approved order → gang sheet file (spec Phase 5) and the press station's
// shirt-by-shirt list. Both go garment size first, then roster order.
// planTransfers/pressList are plain logic (the server's Job Board feed uses them);
// buildGangSheet draws images, so it only runs in the browser.

import { namePlate, rasterize } from "./art";
import { inkFor } from "./ink";
import { NAMES_BLOCK, PRINT_DPI, colorByName, isPersonalized, printedInches, spotDef, totalShirts } from "./catalog";
import { SHIRT_SIZES, type Asset, type Customer, type Design, type Order, type RosterRow, type ShirtSize } from "./demo/types";
import { buildSspProject, sspFileName, type SspProject, type Transfer } from "./ssp-export";

const MAX_EDGE_PX = 8000;

export type PlannedTransfer = {
  name: string;
  design: Design;
  spotLabel: string;
  placement: string;
  sizeLabel: string | null;
  widthIn: number;
  heightIn: number;
  quantity: number;
  personalized: boolean;
};

/** Every transfer the order needs, before any pixels are made (for the approval card). */
export function planTransfers(o: Order, assets: Asset[]): PlannedTransfer[] {
  const out: PlannedTransfer[] = [];
  const named: PlannedTransfer[] = [];
  for (const d of o.designs) {
    const qty = totalShirts(d.sizeCounts);
    for (const s of d.spots) {
      const def = spotDef(s.spotId, d.garmentId);
      if (isPersonalized(s.spotId)) {
        for (const size of SHIRT_SIZES) {
          for (const r of d.roster.filter((x) => x.size === size)) {
            named.push({ name: `${size} · ${r.name} ${r.number}`, design: d, spotLabel: def.label, placement: "Custom", sizeLabel: null, widthIn: NAMES_BLOCK.widthIn, heightIn: NAMES_BLOCK.heightIn, quantity: 1, personalized: true });
          }
        }
        continue;
      }
      const asset = assets.find((a) => a.id === s.assetId);
      const size = printedInches(s, asset ?? null, d.garmentId);
      if (!asset || !size) continue;
      out.push({ name: `${d.name} · ${def.label}`, design: d, spotLabel: def.label, placement: s.sizeLabel ? def.sizePlacement : "Custom", sizeLabel: s.sizeLabel, widthIn: size.widthIn, heightIn: size.heightIn, quantity: qty, personalized: false });
    }
  }
  return [...out, ...named];
}

/** One gang sheet transfer before its PNG exists: what to draw, how big, how many. */
export type TransferSpec = Omit<Transfer, "png"> & {
  pixelWidth: number;
  pixelHeight: number;
  draw: { kind: "art"; src: string } | { kind: "names"; name: string; number: string; ink: string };
};

/**
 * Everything that goes on the gang sheet for an approved order (spec Phase 5).
 * Shared by the browser (buildGangSheet) and the server (lib/server/production.ts),
 * so both make exactly the same transfers.
 */
export function gangSheetSpecs(o: Order, assets: Asset[]): TransferSpec[] {
  if (o.status !== "approved" && o.status !== "printing" && o.status !== "ready") throw new Error("The customer hasn't approved this order yet.");
  const specs: TransferSpec[] = [];
  for (const d of o.designs) {
    const qty = totalShirts(d.sizeCounts);
    for (const s of d.spots) {
      const def = spotDef(s.spotId, d.garmentId);
      if (isPersonalized(s.spotId)) continue;
      const asset = assets.find((a) => a.id === s.assetId);
      const size = printedInches(s, asset ?? null, d.garmentId);
      if (!asset || !size) continue;
      const scale = Math.min(PRINT_DPI, MAX_EDGE_PX / Math.max(size.widthIn, size.heightIn));
      // A custom size (no label) goes on the gang sheet as a Custom transfer.
      const custom = def.sizePlacement === "Custom" || !s.sizeLabel;
      specs.push({
        name: `${d.name} · ${def.label}`,
        kind: "print-art",
        placement: custom ? "Custom" : def.sizePlacement,
        ...(custom ? { customWidthIn: round2(size.widthIn), customHeightIn: round2(size.heightIn) } : { sizeLabel: s.sizeLabel ?? undefined }),
        quantity: qty,
        pixelWidth: Math.max(1, Math.round(size.widthIn * scale)),
        pixelHeight: Math.max(1, Math.round(size.heightIn * scale)),
        draw: { kind: "art", src: asset.src },
      });
    }
  }
  // Names + numbers: one transfer per roster row, by garment size then roster order.
  for (const d of o.designs) {
    if (!d.spots.some((s) => isPersonalized(s.spotId))) continue;
    const ink = inkFor(colorByName(d.color, d.garmentId).hex);
    for (const size of SHIRT_SIZES) {
      for (const r of d.roster.filter((x) => x.size === size)) {
        specs.push({
          name: `${size} · ${r.name} ${r.number}`,
          kind: "print-art",
          placement: "Custom",
          customWidthIn: NAMES_BLOCK.widthIn,
          customHeightIn: round2(NAMES_BLOCK.heightIn),
          quantity: 1,
          keepUpright: true,
          pixelWidth: Math.round(NAMES_BLOCK.widthIn * PRINT_DPI),
          pixelHeight: Math.round(NAMES_BLOCK.heightIn * PRINT_DPI),
          draw: { kind: "names", name: r.name, number: r.number, ink },
        });
      }
    }
  }
  return specs;
}

/** The project file the South Side DTF builder opens, from finished transfers. */
export function projectFor(o: Order, customer: Customer, transfers: Transfer[]): { project: SspProject; fileName: string; json: string } {
  const project = buildSspProject({
    orderNumber: o.orderNo,
    customer: { name: customer.org ? `${customer.org} (${customer.name})` : customer.name, email: customer.email, phone: customer.phone },
    transfers,
    // Mockup Pro DTF transfers are always pre-cut: the builder adds registration marks and a cut file.
    cut: true,
    appVersion: "0.1.0-demo",
  });
  return { project, fileName: sspFileName(project), json: JSON.stringify(project) };
}

/** Browser: makes the print-size PNGs and the South Side DTF project file (Download project file). */
export async function buildGangSheet(o: Order, customer: Customer, assets: Asset[]): Promise<{ project: SspProject; fileName: string; json: string }> {
  const transfers: Transfer[] = [];
  for (const { draw, pixelWidth: w, pixelHeight: h, ...t } of gangSheetSpecs(o, assets)) {
    const dataUrl = draw.kind === "art" ? await rasterize(draw.src, w, h) : namePlate(draw.name, draw.number, draw.ink, PRINT_DPI);
    transfers.push({ ...t, png: { dataUrl, pixelWidth: w, pixelHeight: h } });
  }
  return projectFor(o, customer, transfers);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export type PressShirt = { design: Design; designIndex: number; size: ShirtSize; row: RosterRow | null; nOfSize: number; sizeTotal: number };

/** One entry per shirt, in pressing order. */
export function pressList(o: Order): PressShirt[] {
  const out: PressShirt[] = [];
  o.designs.forEach((d, designIndex) => {
    const named = d.spots.some((s) => isPersonalized(s.spotId));
    for (const size of SHIRT_SIZES) {
      const rows = named ? d.roster.filter((r) => r.size === size) : Array.from({ length: d.sizeCounts[size] }, () => null);
      rows.forEach((row, i) => out.push({ design: d, designIndex, size, row, nOfSize: i + 1, sizeTotal: rows.length }));
    }
  });
  return out;
}
