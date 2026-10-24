// Server: an approved order → gang sheet project → South Side DTF builder → the
// finished, printable gang sheet in Google Drive. Runs by itself after the
// customer approves (app/api/data), or when the shop presses Rebuild
// (app/api/production/send). Without BUILDER_INGEST_URL it stops after saving
// the project file (the Job Board then links that file instead of the sheet).

import "server-only";
import { PRINT_DPI } from "@/lib/catalog";
import type { Asset, Customer, Order } from "@/lib/demo/types";
import { gangSheetSpecs, projectFor } from "@/lib/production";
import type { Transfer } from "@/lib/ssp-export";
import { ART_BUCKET, db, getRecord, loadAll, write } from "./db";
import { namePlateServer, rasterizeServer } from "./render";

export type Production = NonNullable<Order["production"]>;

const now = () => new Date().toISOString();

/** Builds the `.ssp.json` project on the server, with the same transfers as the browser. */
export async function buildProjectServer(order: Order, customer: Customer, assets: Asset[], origin: string) {
  const transfers: Transfer[] = [];
  for (const { draw, pixelWidth: w, pixelHeight: h, ...t } of gangSheetSpecs(order, assets)) {
    const dataUrl = draw.kind === "art" ? await rasterizeServer(draw.src, w, h, origin) : await namePlateServer(draw.name, draw.number, draw.ink, PRINT_DPI);
    transfers.push({ ...t, png: { dataUrl, pixelWidth: w, pixelHeight: h } });
  }
  return projectFor(order, customer, transfers);
}

async function saveOrder(order: Order, change: (o: Order) => void): Promise<Order> {
  const fresh = ((await getRecord("order", order.id))?.data as Order | undefined) ?? order;
  const next = structuredClone(fresh);
  change(next);
  await write([{ kind: "order", data: next }]);
  return next;
}

type BuilderResult = { folderUrl: string; sheet: { url: string; name: string; lengthIn: number; ppi: number }; cut: { url: string } | null };

async function sendToBuilder(projectUrl: string): Promise<BuilderResult | null> {
  const url = process.env.BUILDER_INGEST_URL;
  const secret = process.env.BUILDER_INGEST_SECRET;
  if (!url || !secret) return null;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-ssgs-ingest-secret": secret },
    body: JSON.stringify({ projectUrl }),
    signal: AbortSignal.timeout(280_000),
  });
  const body = (await res.json().catch(() => ({}))) as BuilderResult & { error?: string };
  if (!res.ok) throw new Error(`South Side DTF couldn't build the sheet: ${body.error ?? res.status}`);
  return body;
}

/**
 * Makes the gang sheet for one approved order. `force` rebuilds even if one was
 * made already (the shop's Rebuild button); otherwise it only runs once.
 */
export async function runProduction(orderId: string, options: { origin: string; force?: boolean }): Promise<Production> {
  const record = await getRecord("order", orderId);
  if (!record) throw new Error("Order not found.");
  const order = record.data as Order;
  if (!["approved", "printing", "ready"].includes(order.status)) throw new Error("The customer hasn't approved this order yet.");
  if (!options.force && order.production && order.production.status !== "failed") return order.production;

  const startedAt = now();
  await saveOrder(order, (o) => {
    o.production = { ...(o.production ?? { fileName: "", fileUrl: null }), sentAt: startedAt, status: "building", error: null };
  });

  try {
    const all = await loadAll();
    const customer = all.customers.find((c) => c.id === order.customerId);
    if (!customer) throw new Error("Customer not found.");
    const { fileName, json } = await buildProjectServer(order, customer, all.assets, options.origin);

    const path = `${customer.id}/sheets/${order.orderNo}-${Date.now()}.ssp.json`;
    const bucket = db().storage.from(ART_BUCKET);
    const { error } = await bucket.upload(path, Buffer.from(json), { contentType: "application/json", upsert: true });
    if (error) throw new Error(`Couldn't save the project file: ${error.message}`);
    const fileUrl = bucket.getPublicUrl(path).data.publicUrl;

    const built = await sendToBuilder(fileUrl);
    const done: Production = {
      sentAt: startedAt,
      fileName,
      fileUrl,
      status: "sent",
      error: null,
      sheetUrl: built?.sheet.url ?? null,
      sheetName: built?.sheet.name ?? null,
      sheetLengthIn: built?.sheet.lengthIn ?? null,
      folderUrl: built?.folderUrl ?? null,
      cutUrl: built?.cut?.url ?? null,
    };
    await saveOrder(order, (o) => {
      o.production = done;
      if (o.status === "approved") o.status = "printing";
      o.events.push({
        at: now(),
        text: built ? `Gang sheet built automatically: ${built.sheet.name} (${built.sheet.lengthIn} in)` : `Gang sheet project saved: ${fileName}`,
      });
    });
    return done;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Couldn't make the gang sheet.";
    const failed: Production = { ...(order.production ?? { fileName: "", fileUrl: null }), sentAt: startedAt, status: "failed", error: message };
    await saveOrder(order, (o) => {
      o.production = failed;
      o.events.push({ at: now(), text: `Gang sheet failed: ${message}` });
    }).catch(() => {});
    return failed;
  }
}
