// Shopping list: the blank garments to buy for a set of orders, added up by
// what you'd order from the supplier (brand/style + color), with every size.

import { garmentLabel, totalShirts } from "./catalog";
import { SHIRT_SIZES, type Design, type Order, type SizeCounts } from "./demo/types";

export type ShoppingRow = {
  item: string;
  color: string;
  /** True when a non-Gildan brand was picked: the color is the closest Gildan match. */
  approxColor: boolean;
  sizes: SizeCounts;
  total: number;
  orders: string[];
};

const zero = (): SizeCounts => Object.fromEntries(SHIRT_SIZES.map((s) => [s, 0])) as SizeCounts;

/** Sizes still to buy for a design: the counts, minus sizes ticked "in stock". */
export function stillNeeded(d: Design): SizeCounts {
  return Object.fromEntries(SHIRT_SIZES.map((s) => [s, d.inStock?.[s] ? 0 : d.sizeCounts[s] || 0])) as SizeCounts;
}

/** Every size on the order is ticked in stock (nothing left to buy). */
export function allInStock(o: Order): boolean {
  return o.designs.every((d) => SHIRT_SIZES.every((s) => !d.sizeCounts[s] || d.inStock?.[s]));
}

/** Blanks to buy, added up by item and color. Sizes ticked "in stock" are left out. */
export function shoppingList(orders: Order[]): ShoppingRow[] {
  const rows = new Map<string, ShoppingRow>();
  for (const o of orders) {
    for (const d of o.designs) {
      const need = stillNeeded(d);
      if (!totalShirts(need)) continue;
      const item = garmentLabel(d);
      const key = `${item}|${d.color}`;
      const row = rows.get(key) ?? { item, color: d.color, approxColor: !!d.brand, sizes: zero(), total: 0, orders: [] };
      for (const s of SHIRT_SIZES) row.sizes[s] += need[s];
      row.total = totalShirts(row.sizes);
      if (!row.orders.includes(o.orderNo)) row.orders.push(o.orderNo);
      rows.set(key, row);
    }
  }
  return [...rows.values()].sort((a, b) => a.item.localeCompare(b.item) || a.color.localeCompare(b.color));
}

const cell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV for Excel / Google Sheets, with a total line at the bottom. */
export function shoppingCsv(rows: ShoppingRow[]): string {
  const head = ["Item", "Color", ...SHIRT_SIZES, "Total", "Orders"];
  const lines = rows.map((r) => [r.item, r.approxColor ? `${r.color} (closest Gildan match)` : r.color, ...SHIRT_SIZES.map((s) => r.sizes[s]), r.total, r.orders.join(" ")]);
  const sum = (s: (typeof SHIRT_SIZES)[number]) => rows.reduce((n, r) => n + r.sizes[s], 0);
  lines.push(["Total", "", ...SHIRT_SIZES.map(sum), rows.reduce((n, r) => n + r.total, 0), ""]);
  return [head, ...lines].map((l) => l.map(cell).join(",")).join("\r\n") + "\r\n";
}
