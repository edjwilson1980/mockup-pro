import { describe, expect, it } from "vitest";
import { printedInches } from "@/lib/catalog";
import { seedState } from "@/lib/demo/seed";
import type { Order } from "@/lib/demo/types";
import { spotRect } from "@/lib/mockup/place";
import { planTransfers } from "@/lib/production";
import { boxInches } from "@/lib/ssp-export";

const s = seedState(Date.parse("2026-10-13T15:00:00Z"));
const order = s.orders.find((o) => o.orderNo === "MP-1042")!;
const front = order.designs[0].spots[0];
const art = s.assets.find((a) => a.id === front.assetId)!;

describe("manual placement", () => {
  it("moves the art by the inches dragged, keeping its size", () => {
    const req = { garmentId: "gildan-5000", spotId: front.spotId, sizeLabel: front.sizeLabel!, artWidthPx: art.widthPx, artHeightPx: art.heightPx };
    const base = spotRect(req);
    const moved = spotRect({ ...req, moveXIn: 1.5, moveYIn: -0.5 });
    const ppi = base.width / base.widthIn;
    expect(moved.x - base.x).toBeCloseTo(1.5 * ppi);
    expect(moved.y - base.y).toBeCloseTo(-0.5 * ppi);
    expect(moved.width).toBe(base.width);
  });
});

describe("custom size", () => {
  const custom: Order = structuredClone(order);
  const spot = custom.designs[0].spots[0];
  spot.sizeLabel = null;
  spot.widthIn = 14;

  it("prints at the typed width, past the standard sizes", () => {
    expect(printedInches(spot, art)?.widthIn).toBe(14);
  });

  it("goes on the gang sheet as a Custom transfer", () => {
    const t = planTransfers(custom, s.assets).find((p) => p.design.id === custom.designs[0].id && !p.personalized)!;
    expect(t.placement).toBe("Custom");
    expect(t.sizeLabel).toBeNull();
    expect(boxInches({ placement: "Custom", customWidthIn: t.widthIn, customHeightIn: t.heightIn }).w).toBe(14);
  });
});

describe("custom width and height", () => {
  const tall: Order = structuredClone(order);
  const spot = tall.designs[0].spots[0];
  spot.sizeLabel = null;
  spot.widthIn = 12;
  spot.heightIn = 18;
  const art12x18 = { widthPx: 3600, heightPx: 5400 };

  it("prints a 12 × 18 in tall design at 12 × 18", () => {
    expect(printedInches(spot, art12x18)).toEqual({ widthIn: 12, heightIn: 18 });
  });

  it("never stretches art: wide art fits inside the box", () => {
    expect(printedInches(spot, { widthPx: 2000, heightPx: 1000 })).toEqual({ widthIn: 12, heightIn: 6 });
  });
});

describe("right sleeve", () => {
  it("mirrors the left sleeve across the photo", () => {
    const base = { garmentId: "gildan-5000", sizeLabel: "3.5 in", artWidthPx: 1000, artHeightPx: 1000 };
    const left = spotRect({ ...base, spotId: "left-sleeve" });
    const right = spotRect({ ...base, spotId: "right-sleeve" });
    expect(right.view).toBe("right");
    expect(right.y).toBe(left.y);
    expect(right.x + right.width / 2).toBeCloseTo(1000 - (left.x + left.width / 2));
  });
});
