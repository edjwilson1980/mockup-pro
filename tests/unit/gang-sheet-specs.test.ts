import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { seedState } from "@/lib/demo/seed";
import type { Order } from "@/lib/demo/types";
import { gangSheetSpecs, planTransfers, projectFor } from "@/lib/production";

const s = seedState(Date.parse("2026-10-13T15:00:00Z"));
const order: Order = { ...s.orders.find((o) => o.orderNo === "MP-1042")!, status: "approved" };

describe("gang sheet transfers (shared by browser and server)", () => {
  it("refuses orders the customer hasn't approved", () => {
    expect(() => gangSheetSpecs({ ...order, status: "proof_sent" }, s.assets)).toThrow(/approved/);
  });

  it("matches the shop's transfer plan: same pieces, quantities and placements", () => {
    const specs = gangSheetSpecs(order, s.assets);
    const plan = planTransfers(order, s.assets);
    expect(specs.reduce((n, x) => n + x.quantity, 0)).toBe(plan.reduce((n, p) => n + p.quantity, 0));
    const art = specs.filter((x) => x.draw.kind === "art");
    expect(art.map((x) => x.placement)).toEqual(plan.filter((p) => !p.personalized).map((p) => p.placement));
  });

  it("draws names + numbers one per roster row, kept upright, at print size", () => {
    const names = gangSheetSpecs(order, s.assets).filter((x) => x.draw.kind === "names");
    expect(names).toHaveLength(12);
    expect(names.every((x) => x.keepUpright && x.placement === "Custom" && x.quantity === 1)).toBe(true);
    expect(names[0].pixelWidth).toBe(3600);
  });

  it("sends every gang sheet with cut switched on", async () => {
    const customer = s.customers.find((c) => c.id === order.customerId)!;
    const spec = gangSheetSpecs(order, s.assets)[0];
    const png = await sharp({ create: { width: spec.pixelWidth, height: spec.pixelHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
    const transfer = { name: spec.name, kind: spec.kind, placement: spec.placement, sizeLabel: spec.sizeLabel, quantity: spec.quantity, png: { dataUrl: `data:image/png;base64,${png.toString("base64")}`, pixelWidth: spec.pixelWidth, pixelHeight: spec.pixelHeight } };
    expect(projectFor(order, customer, [transfer]).project.cut).toEqual({ enabled: true });
  });
});
