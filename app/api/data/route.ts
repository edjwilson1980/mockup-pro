import { NextResponse, after, type NextRequest } from "next/server";
import { editable } from "@/lib/order-rules";
import type { Order } from "@/lib/demo/types";
import { dbConfigured, getRecord, loadAll, loadCustomer, loadProof, write, type Rec } from "@/lib/server/db";
import { runProduction } from "@/lib/server/production";
import { who } from "@/lib/server/session";

// Saving an approval also builds the gang sheet in the background (after the response).
export const maxDuration = 300;

const EMPTY = { customers: [], orders: [], assets: [] };

/** What this browser may see: everything (shop), its own file (customer), or one proof. */
export async function GET(request: NextRequest) {
  if (!dbConfigured()) return NextResponse.json({ mode: "local" });
  try {
    const me = await who();
    const proof = request.nextUrl.searchParams.get("proof");
    if (me.shop) return NextResponse.json({ mode: "db", data: await loadAll() });
    if (proof) {
      const data = await loadProof(proof);
      if (data) return NextResponse.json({ mode: "db", data });
    }
    if (me.customerId) return NextResponse.json({ mode: "db", data: await loadCustomer(me.customerId) });
    return NextResponse.json({ mode: "db", data: EMPTY });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't load." }, { status: 500 });
  }
}

/** JSON with object keys sorted: the database stores records with its own key order. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as Record<string, unknown>)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

const sameDesigns = (a: Order, b: Order) => canonical(a.designs) === canonical(b.designs);

/** Keep the server's gang sheet result (and the "printing" it set) if the incoming copy is older. */
function keepServerFields(before: Order | undefined, incoming: Order) {
  if (!before?.production) return;
  const theirs = incoming.production;
  if (!theirs || Date.parse(theirs.sentAt) < Date.parse(before.production.sentAt) || (theirs.sentAt === before.production.sentAt && theirs.status !== before.production.status)) {
    incoming.production = before.production;
  }
  if (incoming.status === "approved" && (before.status === "printing" || before.status === "ready")) incoming.status = before.status;
}

/** Whether a customer (or a proof link) may save this record. Shop staff may save anything. */
async function allowed(rec: Rec, customerId: string | null, proof: string | null): Promise<boolean> {
  if (rec.kind === "customer") return !!customerId && rec.data.id === customerId;
  if (rec.kind === "asset") return !!customerId && rec.data.customerId === customerId;
  const found = await getRecord("order", rec.data.id);
  const before = found?.data as Order | undefined;
  // A proof link may only approve or ask for changes, nothing else.
  if (proof && before && before.proofToken === proof && before.status === "proof_sent") {
    return ["approved", "changes_requested"].includes(rec.data.status) && sameDesigns(before, rec.data) && rec.data.customerId === before.customerId;
  }
  if (!customerId || rec.data.customerId !== customerId) return false;
  if (!before) return rec.data.status === "draft";
  if (before.customerId !== customerId) return false;
  if (editable(before)) return ["draft", "changes_requested", "submitted"].includes(rec.data.status);
  if (before.status === "proof_sent") return ["approved", "changes_requested"].includes(rec.data.status) && sameDesigns(before, rec.data);
  return false;
}

export async function POST(request: NextRequest) {
  if (!dbConfigured()) return NextResponse.json({ mode: "local" }, { status: 503 });
  try {
    const body = (await request.json()) as { records?: Rec[]; proof?: string };
    const records = Array.isArray(body.records) ? body.records : [];
    if (records.some((r) => !["customer", "order", "asset"].includes(r?.kind) || typeof r?.data?.id !== "string")) {
      return NextResponse.json({ error: "Bad records." }, { status: 400 });
    }
    const me = await who();
    if (!me.shop) {
      for (const r of records) {
        if (!(await allowed(r, me.customerId, body.proof ?? null))) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
      }
    }
    // The gang sheet fields belong to the server: a screen with older data never wipes them.
    const approvedNow: string[] = [];
    for (const r of records) {
      if (r.kind !== "order") continue;
      const before = (await getRecord("order", r.data.id))?.data as Order | undefined;
      keepServerFields(before, r.data);
      if (r.data.status === "approved" && before?.status !== "approved" && !r.data.production) approvedNow.push(r.data.id);
    }
    const saved = await write(records);
    const origin = request.nextUrl.origin;
    for (const id of approvedNow) after(() => runProduction(id, { origin }).catch((e) => console.error("[production]", id, e)));
    return NextResponse.json({ records: saved });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't save." }, { status: 500 });
  }
}
