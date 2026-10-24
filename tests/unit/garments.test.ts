import { describe, expect, it } from "vitest";
import { BRANDS, colorByName, colorsFor, garmentLabel, printedInches, sizeLabels, spotsFor, viewsFor } from "@/lib/catalog";
import { seedState } from "@/lib/demo/seed";
import type { Order } from "@/lib/demo/types";
import { spotRect } from "@/lib/mockup/place";
import { planTransfers } from "@/lib/production";
import { spotBoxes } from "@/lib/spot-boxes";
import printSizes from "@/lib/print-sizes.json";

const s = seedState(Date.parse("2026-10-13T15:00:00Z"));
const order = s.orders.find((o) => o.orderNo === "MP-1042")!;
const HOODIE = "gildan-18500";

describe("Gildan 18500 hoodie", () => {
  it("has the hoodie colors and front/back only", () => {
    expect(colorsFor(HOODIE)).toHaveLength(47);
    expect(colorByName("Heather Dark Navy", HOODIE).heather).toBe(true);
    expect(colorByName("Navy", HOODIE).hex).toBe(colorByName("Navy").hex);
    expect(viewsFor(HOODIE)).toEqual(["front", "back"]);
    expect(spotsFor(HOODIE).map((x) => x.id)).not.toContain("left-sleeve");
  });

  it("uses the Hoodie Front and Hoodie Back size boxes", () => {
    const front = printSizes.placements.find((p) => p.id === "Hoodie Front")!.sizes.map((x) => x.label);
    expect(sizeLabels("full-front", HOODIE)).toEqual(front);
    expect(sizeLabels("full-back", HOODIE)[0]).toMatch(/^Small · 10.5 × 12 in$/);
    // The tee is unchanged.
    expect(sizeLabels("full-front")).toContain("Medium · 10.5 × 12 in");
  });

  it("places a full-front print on the chest, above the pocket", () => {
    const r = spotRect({ garmentId: HOODIE, spotId: "full-front", sizeLabel: "Medium · 10.5 × 11 in", artWidthPx: 1000, artHeightPx: 1000 });
    expect(r.widthIn).toBeCloseTo(10.5);
    expect(r.y).toBeGreaterThan(240); // below the neckline
    expect(r.y + r.height).toBeLessThan(760); // pocket top
  });

  it("plans the gang sheet with hoodie placements", () => {
    const hoodie: Order = structuredClone(order);
    const d = hoodie.designs[0];
    d.garmentId = HOODIE;
    d.spots = d.spots.filter((x) => x.spotId === "full-front");
    d.spots[0].sizeLabel = "Medium · 10.5 × 11 in";
    const t = planTransfers(hoodie, s.assets).find((p) => p.design.id === d.id)!;
    expect(t.placement).toBe("Hoodie Front");
    expect(printedInches(d.spots[0], s.assets.find((a) => a.id === d.spots[0].assetId)!, HOODIE)?.widthIn).toBeCloseTo(10.5);
    // Press station measures from the hoodie's own neck point and scale.
    const box = spotBoxes(d.spots, "front", s.assets, HOODIE)[0];
    expect(box.belowCollarIn).toBeCloseTo(2.5);
  });

  it("labels the brand to buy, keeping the Gildan mockup", () => {
    expect(garmentLabel({ garmentId: "gildan-5000" })).toBe("Gildan 5000 Heavy Cotton Tee");
    expect(garmentLabel({ garmentId: "gildan-5000", brand: "Bella+Canvas 3001" })).toBe("Bella+Canvas 3001 t-shirt");
    expect(garmentLabel({ garmentId: HOODIE, brand: "Champion S700" })).toBe("Champion S700 hoodie");
    expect(BRANDS[HOODIE]).toContain("Independent Trading SS4500");
  });

  it("still treats a saved tee design as a tee", () => {
    const tee = order.designs[0];
    expect(tee.garmentId).toBe("gildan-5000");
    expect(spotBoxes(tee.spots, "front", s.assets)[0].belowCollarIn).toBeCloseTo(3);
  });
});
