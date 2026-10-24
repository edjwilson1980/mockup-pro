"use client";

import { useState } from "react";
import { Button, Card, H2 } from "@/components/ui";
import { download } from "@/lib/art";
import { SHIRT_SIZES, STATUS_LABEL, type Order, type OrderStatus } from "@/lib/demo/types";
import { allInStock, shoppingCsv, shoppingList } from "@/lib/shopping";
import { listPdfBlob } from "@/lib/shopping-pdf";

const CHOICES: { label: string; statuses: OrderStatus[]; on: boolean }[] = [
  { label: "Sent, not checked yet", statuses: ["submitted"], on: true },
  { label: "Waiting on proof / changes", statuses: ["proof_sent", "changes_requested"], on: true },
  { label: "Approved", statuses: ["approved"], on: true },
  { label: "Printing", statuses: ["printing"], on: false },
  { label: "Ready for pickup", statuses: ["ready"], on: false },
];

/** Blanks to buy for the chosen orders, as a table, a CSV and a printout. */
export function ShoppingList({ orders }: { orders: Order[] }) {
  const [on, setOn] = useState(() => CHOICES.map((c) => c.on));
  const statuses = new Set(CHOICES.filter((_, i) => on[i]).flatMap((c) => c.statuses));
  const picked = orders.filter((o) => statuses.has(o.status));
  const rows = shoppingList(picked);
  const stocked = picked.filter(allInStock);
  const grand = rows.reduce((n, r) => n + r.total, 0);

  return (
    <Card className="flex flex-col gap-3 shopping-list">
      <div className="flex flex-wrap items-center gap-2">
        <H2>Shopping list</H2>
        <span className="text-muted">
          · {grand} pieces from {picked.length} {picked.length === 1 ? "order" : "orders"}
        </span>
        <div className="ml-auto flex gap-2 no-print">
          <Button
            tone="secondary"
            disabled={!rows.length}
            onClick={() =>
              download(
                listPdfBlob({
                  title: "Shopping list",
                  subtitle: `${picked.length} ${picked.length === 1 ? "order" : "orders"} · ${[...statuses].map((s) => STATUS_LABEL[s]).join(", ")}`,
                  rows,
                  notes: [
                    `Orders: ${[...new Set(rows.flatMap((r) => r.orders))].join(", ")}.`,
                    ...(stocked.length ? [`Not counted, blanks in stock: ${stocked.map((o) => o.orderNo).join(", ")}.`] : []),
                  ],
                }),
                `shopping-list-${new Date().toISOString().slice(0, 10)}.pdf`,
              )
            }
          >
            Download PDF
          </Button>
          <Button
            tone="secondary"
            disabled={!rows.length}
            onClick={() => download(new Blob([shoppingCsv(rows)], { type: "text/csv" }), `shopping-list-${new Date().toISOString().slice(0, 10)}.csv`)}
          >
            Download CSV
          </Button>
          <Button tone="secondary" disabled={!rows.length} onClick={() => window.print()}>
            Print
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[14px] no-print" role="group" aria-label="Which orders">
        {CHOICES.map((c, i) => (
          <label key={c.label} className="flex items-center gap-2 min-h-9">
            <input type="checkbox" className="size-5 accent-blue" checked={on[i]} onChange={(e) => setOn(on.map((v, j) => (j === i ? e.target.checked : v)))} />
            {c.label}
          </label>
        ))}
      </div>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[14px]">
            <thead className="text-[12px] uppercase tracking-[0.06em] text-muted">
              <tr>
                <th className="py-2 pr-3 font-semibold">Item</th>
                <th className="py-2 pr-3 font-semibold">Color</th>
                {SHIRT_SIZES.map((s) => (
                  <th key={s} className="py-2 px-1.5 font-semibold text-right">
                    {s}
                  </th>
                ))}
                <th className="py-2 pl-2 font-semibold text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.item}|${r.color}`} className="border-t border-line">
                  <td className="py-2 pr-3 font-medium">{r.item}</td>
                  <td className="py-2 pr-3">
                    {r.color}
                    {r.approxColor && <span className="block text-[12px] text-muted">closest Gildan match</span>}
                  </td>
                  {SHIRT_SIZES.map((s) => (
                    <td key={s} className="py-2 px-1.5 text-right tabular-nums">
                      {r.sizes[s] || ""}
                    </td>
                  ))}
                  <td className="py-2 pl-2 text-right font-semibold tabular-nums">{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[12px] text-muted mt-2">
            Orders: {[...new Set(rows.flatMap((r) => r.orders))].join(", ")}. Statuses counted: {[...statuses].map((s) => STATUS_LABEL[s]).join(", ") || "none"}.
            {stocked.length > 0 && ` Not counted, blanks in stock: ${stocked.map((o) => o.orderNo).join(", ")}.`} Sizes ticked in stock on a customer&apos;s file are left out.
          </p>
        </div>
      ) : (
        <p className="text-muted text-[15px]">Nothing to buy for the orders checked above.</p>
      )}
    </Card>
  );
}
