import { describe, expect, it } from "vitest";
import { parseRoster } from "@/components/customer/Names";
import { orderSummary, printedInches, summaryText } from "@/lib/catalog";
import { submitProblems } from "@/lib/demo/actions";
import { seedState } from "@/lib/demo/seed";
import { pressList, planTransfers } from "@/lib/production";

const s = seedState(Date.parse("2026-10-13T15:00:00Z"));
const order = s.orders.find((o) => o.orderNo === "MP-1042")!;

describe("sample team order", () => {
  it("adds up like the order screen says", () => {
    expect(orderSummary(order.designs)).toEqual({ shirts: 36, designs: 2, spots: 5, names: 12 });
    expect(summaryText(order.designs)).toBe("36 shirts · 2 designs · 5 print spots · 12 names");
    expect(submitProblems(order)).toEqual([]);
  });

  it("plans one transfer per spot per shirt, and one per name", () => {
    const plan = planTransfers(order, s.assets);
    expect(plan.reduce((n, p) => n + p.quantity, 0)).toBe(12 + 12 + 24 + 24 + 12);
    const names = plan.filter((p) => p.personalized).map((p) => p.name);
    expect(names).toHaveLength(12);
    expect(names[0]).toMatch(/^S · /);
    expect(names.at(-1)).toMatch(/^2XL · /);
  });

  it("prints art at the gang sheet's size: square-ish art fits the box width", () => {
    const front = order.designs[0].spots[0];
    expect(printedInches(front, s.assets.find((a) => a.id === front.assetId)!)).toEqual({ widthIn: 10.5, heightIn: 5 });
  });

  it("presses every shirt once, by design, then size, then roster", () => {
    const list = pressList(order);
    expect(list).toHaveLength(36);
    const named = list.filter((x) => x.row).map((x) => x.row!.id);
    expect(new Set(named).size).toBe(12);
    expect(list[0].size).toBe("S");
    expect(list[11].design.name).toBe("Game day tee");
    expect(list[12].design.name).toBe("Parent tee");
  });

  it("flags names that don't match the shirt counts", () => {
    const bad = structuredClone(order);
    bad.designs[0].roster.pop();
    expect(submitProblems(bad)[0]).toMatch(/names per size don't match/);
  });
});

describe("parseRoster", () => {
  it("reads name, number, size per line", () => {
    const { rows, bad } = parseRoster("reyes, 12, l\nOKAFOR\t3\tM\nSMITH, #7, XXL\nLEE, 8, huge");
    expect(rows).toEqual([
      { name: "REYES", number: "12", size: "L" },
      { name: "OKAFOR", number: "3", size: "M" },
      { name: "SMITH", number: "7", size: "2XL" },
      { name: "LEE", number: "8", size: "L" },
    ]);
    expect(bad).toEqual(["LEE, 8, huge"]);
  });
});
