// Server only: the shared Supabase database (table mp_records, see
// supabase/migrations/20261014_mockup_pro_records.sql). Route handlers in
// app/api import this; browsers never see the service key.

import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { seedState } from "@/lib/demo/seed";
import type { Asset, Customer, Order } from "@/lib/demo/types";

export type Kind = "customer" | "order" | "asset";
export type Data = { customers: Customer[]; orders: Order[]; assets: Asset[] };
export type Rec = { kind: "customer"; data: Customer } | { kind: "order"; data: Order } | { kind: "asset"; data: Asset };

export const ART_BUCKET = "mockup-art";
/** Placeholders the browser uses until the server hands out the real number. */
export const NEW_FILE_NO = "C-NEW";
export const NEW_ORDER_NO = "MP-NEW";

export function dbConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (!dbConfigured()) throw new Error("The database isn't connected (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

function fail(what: string, error: { message: string } | null): never {
  throw new Error(`${what}: ${error?.message ?? "unknown error"}`);
}

const customerOf = (r: Rec) => (r.kind === "customer" ? r.data.id : r.data.customerId);

function toData(rows: { kind: Kind; data: unknown }[]): Data {
  const out: Data = { customers: [], orders: [], assets: [] };
  for (const r of rows) {
    if (r.kind === "customer") out.customers.push(r.data as Customer);
    else if (r.kind === "order") out.orders.push(r.data as Order);
    else out.assets.push(r.data as Asset);
  }
  return out;
}

// ---------- seed (empty database → the sample customers, so the demo hints work) ----------

let seeded: Promise<void> | null = null;

function seedOnce(): Promise<void> {
  seeded ??= (async () => {
    const { count, error } = await db().from("mp_records").select("id", { count: "exact", head: true });
    if (error) fail("Couldn't read the database", error);
    if (count) return;
    const s = seedState(Date.now());
    const recs: Rec[] = [
      ...s.customers.map((data) => ({ kind: "customer" as const, data })),
      ...s.orders.map((data) => ({ kind: "order" as const, data })),
      ...s.assets.map((data) => ({ kind: "asset" as const, data })),
    ];
    await write(recs);
  })().catch((e) => {
    seeded = null;
    throw e;
  });
  return seeded;
}

// ---------- reads ----------

export async function loadAll(): Promise<Data> {
  await seedOnce();
  const { data, error } = await db().from("mp_records").select("kind, data");
  if (error) fail("Couldn't load", error);
  return toData(data);
}

export async function loadCustomer(customerId: string): Promise<Data> {
  await seedOnce();
  const { data, error } = await db().from("mp_records").select("kind, data").eq("customer_id", customerId);
  if (error) fail("Couldn't load", error);
  return toData(data);
}

/** One order by its proof link, with its customer and art. */
export async function loadProof(token: string): Promise<Data | null> {
  await seedOnce();
  const { data, error } = await db().from("mp_records").select("kind, data, customer_id").eq("kind", "order").eq("data->>proofToken", token).limit(1);
  if (error) fail("Couldn't load the proof", error);
  const row = data[0];
  if (!row) return null;
  const all = await loadCustomer(row.customer_id as string);
  return { customers: all.customers, assets: all.assets, orders: all.orders.filter((o) => o.proofToken === token) };
}

export async function getRecord(kind: Kind, id: string): Promise<Rec | null> {
  const { data, error } = await db().from("mp_records").select("kind, data").eq("kind", kind).eq("id", id).maybeSingle();
  if (error) fail("Couldn't read", error);
  return data ? ({ kind: data.kind, data: data.data } as Rec) : null;
}

export async function findCustomerBy(field: "phone" | "email", value: string): Promise<Customer | null> {
  await seedOnce();
  const { data, error } = await db().from("mp_records").select("data").eq("kind", "customer").eq(`data->>${field}`, value).limit(1);
  if (error) fail("Couldn't search customers", error);
  return (data[0]?.data as Customer) ?? null;
}

// ---------- writes ----------

async function nextNo(which: "file" | "order"): Promise<number> {
  const { data, error } = await db().rpc("mp_next_no", { which });
  if (error) fail("Couldn't get the next number", error);
  return Number(data);
}

/** Saves records, giving new customers and orders their real numbers. Returns what was saved. */
export async function write(recs: Rec[]): Promise<Rec[]> {
  for (const r of recs) {
    if (r.kind === "customer" && r.data.fileNo === NEW_FILE_NO) r.data.fileNo = `C-${await nextNo("file")}`;
    if (r.kind === "order" && r.data.orderNo === NEW_ORDER_NO) r.data.orderNo = `MP-${await nextNo("order")}`;
  }
  if (!recs.length) return recs;
  const rows = recs.map((r) => ({ kind: r.kind, id: r.data.id, customer_id: customerOf(r), data: r.data, updated_at: new Date().toISOString() }));
  const { error } = await db().from("mp_records").upsert(rows, { onConflict: "kind,id" });
  if (error) fail("Couldn't save", error);
  return recs;
}

/** A signed one-time upload link for a customer's artwork, plus the public URL it will have. */
export async function artUploadLink(customerId: string, ext: string): Promise<{ uploadUrl: string; publicUrl: string }> {
  const path = `${customerId}/${crypto.randomUUID()}.${ext.replace(/[^a-z0-9]/gi, "").slice(0, 5) || "png"}`;
  const bucket = db().storage.from(ART_BUCKET);
  const { data, error } = await bucket.createSignedUploadUrl(path);
  if (error) fail("Couldn't start the upload", error);
  return { uploadUrl: data.signedUrl, publicUrl: bucket.getPublicUrl(path).data.publicUrl };
}
