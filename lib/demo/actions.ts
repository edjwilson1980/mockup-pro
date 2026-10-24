"use client";

// Every change the screens make, in one place. Each mirrors a server action
// from the spec, so Phase 2 replaces these bodies, not the screens.

import { colorsFor, defaultSizeLabel, isPersonalized, sizeLabels, spotDef, totalShirts } from "../catalog";
import { garmentHasSpot } from "../mockup/place";
import { emptyCounts } from "./seed";
import { dataMode, getState, reload, update } from "./store";
import { cleanCheckIn, newCustomer, parseLookup, type CheckInInput } from "../customer";
import type { Asset, Customer, DemoState, Design, Order, OrderStatus, PlacedSpot } from "./types";
import { SHIRT_SIZES } from "./types";

export class DemoError extends Error {}

const now = () => new Date().toISOString();
const uid = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}`;

export { formatPhone, normalizePhone } from "../customer";

function order(s: DemoState, id: string): Order {
  const o = s.orders.find((x) => x.id === id);
  if (!o) throw new DemoError("Order not found.");
  return o;
}

function log(o: Order, text: string) {
  o.events.push({ at: now(), text });
}

// ---------- check-in (spec 2.2) ----------

export type CheckIn = CheckInInput;

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const out = await res.json();
  if (!res.ok) throw new DemoError(out.error ?? "Something went wrong.");
  return out as T;
}

/** Phone OR email matches → that customer's file; otherwise a new C-#### file. */
export async function checkIn(input: CheckIn): Promise<{ customer: Customer; returning: boolean; flagged: boolean }> {
  if (dataMode() === "db") {
    const r = await post<{ customerId: string; returning: boolean; flagged: boolean }>("/api/checkin", input);
    await reload();
    const customer = getState()?.customers.find((c) => c.id === r.customerId);
    if (!customer) throw new DemoError("Couldn't open your file. Please try again.");
    return { customer, returning: r.returning, flagged: r.flagged };
  }
  let clean;
  try {
    clean = cleanCheckIn(input);
  } catch (e) {
    throw new DemoError(e instanceof Error ? e.message : "Check the form.");
  }
  const s = getState();
  if (!s) throw new DemoError("Still loading.");
  const byPhone = s.customers.find((c) => c.phone === clean.phone);
  const byEmail = s.customers.find((c) => c.email === clean.email);
  // Phone and email point at two different files: don't guess, use the phone match and flag it.
  const flagged = !!byPhone && !!byEmail && byPhone.id !== byEmail.id;
  const match = byPhone ?? byEmail;
  if (match) return { customer: match, returning: true, flagged };
  const customer = newCustomer(input, uid("cust"), `C-${s.nextFileNo}`, now());
  update((d) => {
    d.customers.push(customer);
    d.nextFileNo += 1;
  });
  return { customer, returning: false, flagged: false };
}

/** Returning customers: one box, phone number or email. Null when nothing matches. */
export async function findCustomer(query: string): Promise<Customer | null> {
  if (dataMode() === "db") {
    const r = await post<{ customerId: string | null }>("/api/find", { query });
    if (!r.customerId) return null;
    await reload();
    return getState()?.customers.find((c) => c.id === r.customerId) ?? null;
  }
  const s = getState();
  if (!s) throw new DemoError("Still loading.");
  let q;
  try {
    q = parseLookup(query);
  } catch (e) {
    throw new DemoError(e instanceof Error ? e.message : "Check what you typed.");
  }
  return s.customers.find((c) => c[q.field] === q.value) ?? null;
}

/** Ends the customer's session on this device (the counter tablet, for the next person). */
export async function logoutCustomer(): Promise<void> {
  if (dataMode() === "db") await post("/api/logout", {});
}

// ---------- orders ----------

function blankDesign(n: number): Design {
  return { id: uid("d"), name: `Design ${n}`, garmentId: "gildan-5000", color: "Black", sizeCounts: emptyCounts(), spots: [], roster: [], inStock: {} };
}

export function newOrder(customerId: string): string {
  const id = uid("ord");
  update((d) => {
    d.orders.push({
      id,
      // The server hands out the real number when the database is on.
      orderNo: d.nextOrderNo ? `MP-${d.nextOrderNo}` : "MP-NEW",
      customerId,
      status: "draft",
      designs: [blankDesign(1)],
      createdAt: now(),
      proofToken: null,
      approvedAt: null,
      approvedVia: null,
      changeText: null,
      pressed: 0,
      events: [{ at: now(), text: "Order started" }],
    });
    if (d.nextOrderNo) d.nextOrderNo += 1;
  });
  return id;
}

/** Copies a past order's designs and spots into a new draft (spec 2.3). */
export function reorder(orderId: string): string {
  const s = getState();
  if (!s) throw new DemoError("Still loading.");
  const past = order(s, orderId);
  const id = newOrder(past.customerId);
  update((d) => {
    const o = order(d, id);
    o.designs = past.designs.map((x) => ({ ...structuredClone(x), id: uid("d"), inStock: {} }));
    o.events = [{ at: now(), text: `Reorder of ${past.orderNo}` }];
  });
  return id;
}

/** Where a new order starts: its first shirt, step 1 (what are we printing on?). */
export function startOrder(customerId: string): string {
  const id = newOrder(customerId);
  const designId = getState()?.orders.find((o) => o.id === id)?.designs[0]?.id;
  return designId ? `/order/${id}/item/${designId}?start=1` : `/order/${id}`;
}

export function addDesign(orderId: string): string {
  let id = "";
  update((d) => {
    const o = order(d, orderId);
    const design = blankDesign(o.designs.length + 1);
    id = design.id;
    o.designs.push(design);
  });
  return id;
}

export function updateDesign(orderId: string, designId: string, fn: (d: Design) => void) {
  update((s) => {
    const design = order(s, orderId).designs.find((x) => x.id === designId);
    if (design) fn(design);
  });
}

export function removeDesign(orderId: string, designId: string) {
  update((s) => {
    const o = order(s, orderId);
    o.designs = o.designs.filter((x) => x.id !== designId);
  });
}

export function addSpot(orderId: string, designId: string, spotId: string, assetId: string | null): string {
  const id = uid("s");
  updateDesign(orderId, designId, (d) => {
    const spot: PlacedSpot = { id, spotId, assetId: isPersonalized(spotId) ? null : assetId, sizeLabel: defaultSizeLabel(spotId, d.garmentId) };
    if (spotId === "custom") Object.assign(spot, { freeXIn: 0, freeYIn: 6 });
    d.spots.push(spot);
  });
  return id;
}

/** Same color under another name on another garment (tee "Ash Grey" = hoodie "Ash"). */
const COLOR_ALIASES: Record<string, string[]> = { "Ash Grey": ["Ash"], Ash: ["Ash Grey"], "Forest Green": ["Forest"], Forest: ["Forest Green"] };

/**
 * Puts a design on another garment (tee ↔ hoodie). Keeps the color and the spots
 * that carry over, re-maps sizes to the new garment's boxes, and returns the
 * labels of spots it had to drop.
 */
export function switchGarment(orderId: string, designId: string, garmentId: string): string[] {
  const dropped: string[] = [];
  updateDesign(orderId, designId, (d) => {
    if (d.garmentId === garmentId) return;
    d.garmentId = garmentId;
    d.brand = null;
    const names = colorsFor(garmentId).map((c) => c.name);
    if (!names.includes(d.color)) d.color = (COLOR_ALIASES[d.color] ?? []).find((n) => names.includes(n)) ?? "Black";
    d.spots = d.spots.filter((s) => {
      const ok = garmentHasSpot(garmentId, s.spotId);
      if (!ok) dropped.push(spotDef(s.spotId).label);
      return ok;
    });
    for (const s of d.spots) {
      if (s.sizeLabel && !sizeLabels(s.spotId, garmentId).includes(s.sizeLabel)) s.sizeLabel = defaultSizeLabel(s.spotId, garmentId);
    }
  });
  return dropped;
}

export function saveAsset(customerId: string, a: Pick<Asset, "name" | "src" | "widthPx" | "heightPx" | "checks">): string {
  const id = uid("art");
  update((d) => d.assets.push({ id, customerId, kind: "print-art", createdAt: now(), ...a }));
  return id;
}

/** What still stops an order from going to the shop, in plain words. */
export function submitProblems(o: Order): string[] {
  const out: string[] = [];
  if (!o.designs.length) out.push("Add at least one shirt design.");
  for (const d of o.designs) {
    if (!totalShirts(d.sizeCounts)) out.push(`${d.name}: enter how many shirts in each size.`);
    if (!d.spots.length) out.push(`${d.name}: add at least one print spot.`);
    if (d.spots.some((s) => !isPersonalized(s.spotId) && !s.assetId)) out.push(`${d.name}: a print spot still needs artwork.`);
    if (d.spots.some((s) => isPersonalized(s.spotId))) {
      if (!d.roster.length) out.push(`${d.name}: add the names and numbers.`);
      else if (SHIRT_SIZES.some((sz) => d.roster.filter((r) => r.size === sz).length !== d.sizeCounts[sz])) out.push(`${d.name}: names per size don't match the shirt counts.`);
    }
  }
  return out;
}

export function submitOrder(orderId: string) {
  update((d) => {
    const o = order(d, orderId);
    const problems = submitProblems(o);
    if (problems.length) throw new DemoError(problems[0]);
    o.status = "submitted";
    log(o, "Order sent to the shop");
  });
}

// ---------- shop + proof (spec 3, 4) ----------

function setStatus(orderId: string, status: OrderStatus, text: string, extra: (o: Order) => void = () => {}) {
  update((d) => {
    const o = order(d, orderId);
    o.status = status;
    extra(o);
    log(o, text);
  });
}

export function sendProof(orderId: string, how: string) {
  setStatus(orderId, "proof_sent", `Proof sent by ${how}`, (o) => {
    o.proofToken ??= crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    o.changeText = null;
  });
}

export function approve(orderId: string, via: NonNullable<Order["approvedVia"]>, note?: string) {
  const s = getState();
  const o = s && order(s, orderId);
  if (!o || !["proof_sent", "changes_requested", "submitted"].includes(o.status)) throw new DemoError("This order isn't waiting for approval.");
  if (via === "staff" && !note?.trim()) throw new DemoError("Add a note: who approved it, and how.");
  setStatus(orderId, "approved", via === "staff" ? `Marked approved by staff: ${note!.trim()}` : `Approved on the ${via}`, (x) => {
    x.approvedAt = now();
    x.approvedVia = via;
  });
}

export function requestChange(orderId: string, text: string) {
  if (!text.trim()) throw new DemoError("Tell us what to change.");
  setStatus(orderId, "changes_requested", `Change requested: “${text.trim()}”`, (o) => {
    o.changeText = text.trim();
  });
}

/** Tick (or untick) every size on these orders as in stock: they drop off the master shopping list. */
export function setOrdersInStock(orderIds: string[], ok: boolean) {
  update((d) => {
    for (const id of orderIds) {
      const o = order(d, id);
      for (const ds of o.designs) for (const s of SHIRT_SIZES) if (ds.sizeCounts[s]) ds.inStock[s] = ok;
      log(o, ok ? "Blanks marked in stock" : "Blanks in stock cleared");
    }
  });
}

export function setInStock(orderId: string, designId: string, size: string, ok: boolean) {
  updateDesign(orderId, designId, (d) => {
    d.inStock[size as keyof Design["inStock"]] = ok;
  });
}

/** Sent to production: the gang sheet file is saved and the order goes on the Job Board feed. */
export function markSentToProduction(orderId: string, fileName: string, fileUrl: string | null) {
  update((d) => {
    const o = order(d, orderId);
    o.production = { sentAt: now(), fileName, fileUrl };
    if (o.status === "approved") o.status = "printing";
    log(o, `Sent to production (Job Board): ${fileName}`);
  });
}

export function pressNext(orderId: string, total: number) {
  update((d) => {
    const o = order(d, orderId);
    o.pressed = Math.min(total, o.pressed + 1);
    if (o.status === "approved") {
      o.status = "printing";
      log(o, "Pressing started");
    }
    if (o.pressed === total && o.status === "printing") {
      o.status = "ready";
      o.readyAt = now();
      log(o, "All shirts pressed · ready for pickup");
    }
  });
}

export function pressProblem(orderId: string, what: string) {
  update((d) => log(order(d, orderId), `Press problem: ${what}`));
}
