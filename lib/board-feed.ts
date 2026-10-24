// Orders sent to production, shaped as jobs for the Shop Job Board's live feed
// (its lib/mockup-feed.ts reads this). Mirrors the board's NewJobInput fields.

import { garmentLabel, spotDef, totalShirts } from "./catalog";
import type { Customer, Order } from "./demo/types";
import { planTransfers } from "./production";
import type { Asset } from "./demo/types";

export type BoardJob = {
  id: string;
  order_number: string;
  source: "mockup";
  external_id: string;
  category_id: "dtf";
  details: { sheet_types: ["dtf"]; sheet_count: number };
  customer_name: string;
  contact_name: string;
  phone: string | null;
  email: string | null;
  item_summary: string;
  quantity: number;
  ordered_at: string;
  rush: boolean;
  payment_status: "unknown";
  file_url: string | null;
  notes: string | null;
};

/** One feed entry: the job, plus "completed" once the press station has finished it. */
export type BoardEntry = { job: BoardJob; status: "processing" | "completed"; completedAt: string | null; stage?: Order["boardStage"] };

/** "MP-1044" → "M1044" (the board wants a letter and digits). */
export const boardOrderNo = (orderNo: string) => `M${orderNo.replace(/\D/g, "")}`;

export function boardEntries(orders: Order[], customers: Customer[], assets: Asset[]): BoardEntry[] {
  const out: BoardEntry[] = [];
  for (const o of orders) {
    if (!o.production || !["printing", "ready"].includes(o.status)) continue;
    const c = customers.find((x) => x.id === o.customerId);
    if (!c) continue;
    const shirts = o.designs.reduce((n, d) => n + totalShirts(d.sizeCounts), 0);
    const transfers = planTransfers(o, assets).reduce((n, p) => n + p.quantity, 0);
    const press = o.designs
      .map((d) => `${d.name}: ${totalShirts(d.sizeCounts)} × ${garmentLabel(d)} ${d.color} (${d.spots.map((s) => spotDef(s.spotId).label).join(", ") || "no spots"})`)
      .join("\n");
    out.push({
      job: {
        id: `mockup-${o.id}`,
        order_number: boardOrderNo(o.orderNo),
        source: "mockup",
        external_id: o.id,
        category_id: "dtf",
        details: { sheet_types: ["dtf"], sheet_count: 1 },
        // Same name in both fields → the TV shows "First L." (the board's privacy rule).
        customer_name: c.org?.trim() || c.name,
        contact_name: c.name,
        phone: c.phone || null,
        email: c.email || null,
        item_summary: `Mockup Pro gang sheet · ${shirts} shirts · ${transfers} transfers`,
        quantity: 1,
        ordered_at: o.production.sentAt,
        rush: false,
        payment_status: "unknown",
        file_url: o.production.sheetUrl ?? o.production.fileUrl,
        notes: `From Mockup Pro order ${o.orderNo}.\n${press}${o.production.sheetName ? `\nGang sheet: ${o.production.sheetName}${o.production.folderUrl ? ` (Drive: ${o.production.folderUrl})` : ""}` : o.production.fileUrl ? `\nGang sheet project: ${o.production.fileName}` : ""}`,
      },
      status: o.status === "ready" ? "completed" : "processing",
      completedAt: o.status === "ready" ? (o.readyAt ?? o.production.sentAt) : null,
      ...(o.boardStage ? { stage: o.boardStage } : {}),
    });
  }
  return out;
}
