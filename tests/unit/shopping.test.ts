import { describe, expect, it } from "vitest";
import { seedState } from "@/lib/demo/seed";
import type { Order } from "@/lib/demo/types";
import { allInStock, shoppingCsv, shoppingList } from "@/lib/shopping";
import { listPdf } from "@/lib/shopping-pdf";

const s = seedState(Date.parse("2026-10-13T15:00:00Z"));
const order = s.orders.find((o) => o.orderNo === "MP-1042")!;

describe("shopping list", () => {
  it("adds up blanks by item and color, per size", () => {
    const rows = shoppingList([order]);
    const total = rows.reduce((n, r) => n + r.total, 0);
    expect(total).toBe(36);
    for (const r of rows) expect(r.orders).toEqual(["MP-1042"]);
  });

  it("merges the same item and color across orders, keeps brands apart", () => {
    const again: Order = { ...structuredClone(order), id: "o2", orderNo: "MP-2000" };
    const hoodie: Order = structuredClone(order);
    hoodie.id = "o3";
    hoodie.orderNo = "MP-3000";
    hoodie.designs = [{ ...hoodie.designs[0], garmentId: "gildan-18500", brand: "Champion S700" }];
    const rows = shoppingList([order, again, hoodie]);
    const first = rows.find((r) => r.item === "Gildan 5000 Heavy Cotton Tee" && r.color === order.designs[0].color)!;
    expect(first.orders).toEqual(["MP-1042", "MP-2000"]);
    const champ = rows.find((r) => r.item === "Champion S700 hoodie")!;
    expect(champ.approxColor).toBe(true);
  });

  it("exports a CSV with sizes and a total line", () => {
    const csv = shoppingCsv(shoppingList([order]));
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("Item,Color,S,M,L,XL,2XL,3XL,Total,Orders");
    expect(lines.at(-1)).toMatch(/^Total,,.*,36,$/);
  });

  it("leaves out sizes ticked in stock, and whole orders marked in stock", () => {
    const some: Order = structuredClone(order);
    const d = some.designs[0];
    const firstSize = (Object.keys(d.sizeCounts) as (keyof typeof d.sizeCounts)[]).find((s) => d.sizeCounts[s])!;
    d.inStock[firstSize] = true;
    const before = shoppingList([order]).reduce((n, r) => n + r.total, 0);
    const after = shoppingList([some]).reduce((n, r) => n + r.total, 0);
    expect(before - after).toBe(d.sizeCounts[firstSize]);
    expect(allInStock(some)).toBe(false);

    const all: Order = structuredClone(order);
    for (const ds of all.designs) for (const s of Object.keys(ds.sizeCounts) as (keyof typeof ds.sizeCounts)[]) if (ds.sizeCounts[s]) ds.inStock[s] = true;
    expect(allInStock(all)).toBe(true);
    expect(shoppingList([all])).toEqual([]);
  });

  it("makes a PDF order list", () => {
    const doc = listPdf({ title: "Order list", subtitle: "Maria Reyes · File C-1001", rows: shoppingList([order]), notes: ["Orders: MP-1042."] });
    const bytes = Buffer.from(doc.output("arraybuffer"));
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(doc.getNumberOfPages()).toBe(1);
  });
});
