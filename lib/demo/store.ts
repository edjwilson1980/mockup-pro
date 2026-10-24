"use client";

// The app's data. With the database connected (the live site), it comes from
// /api/data: the shop sees everything, a customer sees only their own file.
// Every change is shown at once, then saved in the background; new artwork is
// uploaded to storage first. Other devices' changes arrive by polling.
// Without a database (local dev with no keys) it falls back to this browser's
// localStorage, shared by every tab, exactly like the original demo.

import { useSyncExternalStore } from "react";
import { seedState } from "./seed";
import type { Asset, Customer, DemoState, Order } from "./types";

const KEY = "mockup-pro:demo:v1";
const POLL_MS = 4000;

type Mode = "loading" | "db" | "local";
type Kind = "customer" | "order" | "asset";
type Rec = { kind: "customer"; data: Customer } | { kind: "order"; data: Order } | { kind: "asset"; data: Asset };
type Data = { customers: Customer[]; orders: Order[]; assets: Asset[] };

let state: DemoState | null = null;
let mode: Mode = "loading";
let started = false;
let error: string | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());
const fromData = (d: Data): DemoState => ({ version: 1, ...d, nextFileNo: 0, nextOrderNo: 0 });
/** A proof page loads just that order, by its link. */
const proofToken = () => (window.location.pathname.match(/^\/proof\/([^/]+)/)?.[1] ?? null);

// ---------- localStorage fallback ----------

function readLocal(): DemoState | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as DemoState) : null;
    return s?.version === 1 ? s : null;
  } catch {
    return null;
  }
}

function writeLocal(s: DemoState) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage full (big uploads) or blocked: keep working in memory.
  }
}

function startLocal() {
  mode = "local";
  state = readLocal() ?? seedState(Date.now());
  writeLocal(state);
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    const next = readLocal();
    if (next) {
      state = next;
      emit();
    }
  });
  emit();
}

// ---------- database ----------

async function fetchData(): Promise<{ mode: "db"; data: Data } | { mode: "local" }> {
  const t = proofToken();
  const res = await fetch(`/api/data${t ? `?proof=${encodeURIComponent(t)}` : ""}`, { cache: "no-store" });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "Couldn't load.");
  return body;
}

/** Records changed locally and not yet saved, by kind:id. */
const dirty = new Set<string>();
/** Real numbers the server handed out for new customers and orders. */
const assigned = new Map<string, string>();
let saving: Promise<void> | null = null;

function find(kind: Kind, id: string): Rec | null {
  if (!state) return null;
  if (kind === "customer") {
    const data = state.customers.find((x) => x.id === id);
    return data ? { kind, data } : null;
  }
  if (kind === "order") {
    const data = state.orders.find((x) => x.id === id);
    return data ? { kind, data } : null;
  }
  const data = state.assets.find((x) => x.id === id);
  return data ? { kind, data } : null;
}

/** New art is a data: URL in the browser; upload it and keep the storage URL instead. */
async function uploadArt(a: Asset): Promise<Asset> {
  const blob = await (await fetch(a.src)).blob();
  const ext = (blob.type.split("/")[1] ?? "png").replace("svg+xml", "svg").replace("jpeg", "jpg");
  const link = await fetch("/api/art", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ customerId: a.customerId, ext }) });
  const { uploadUrl, publicUrl, error: err } = await link.json();
  if (!link.ok) throw new Error(err ?? "Couldn't upload the artwork.");
  const put = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": blob.type || "application/octet-stream" }, body: blob });
  if (!put.ok) throw new Error("Couldn't upload the artwork.");
  return { ...a, src: publicUrl };
}

/** Uploads a file to the customer's storage folder; returns its URL, or null without a database. */
export async function uploadFile(customerId: string, blob: Blob, ext: string): Promise<string | null> {
  if (mode !== "db") return null;
  const link = await fetch("/api/art", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ customerId, ext }) });
  const { uploadUrl, publicUrl, error: err } = await link.json();
  if (!link.ok) throw new Error(err ?? "Couldn't upload the file.");
  const put = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": blob.type || "application/octet-stream" }, body: blob });
  if (!put.ok) throw new Error("Couldn't upload the file.");
  return publicUrl as string;
}

function patchNumbers(r: Rec): Rec {
  const n = assigned.get(`${r.kind}:${r.data.id}`);
  if (!n) return r;
  if (r.kind === "customer") return { kind: r.kind, data: { ...r.data, fileNo: n } };
  if (r.kind === "order") return { kind: r.kind, data: { ...r.data, orderNo: n } };
  return r;
}

/** Saves every dirty record, one batch at a time, until nothing is left. */
function flush(): Promise<void> {
  saving ??= (async () => {
    try {
      while (dirty.size) {
        const keys = [...dirty];
        dirty.clear();
        const recs: Rec[] = [];
        for (const k of keys) {
          const cut = k.indexOf(":");
          const kind = k.slice(0, cut) as Kind;
          const id = k.slice(cut + 1);
          const r = find(kind, id);
          if (!r) continue;
          if (r.kind === "asset" && r.data.src.startsWith("data:")) {
            const up = await uploadArt(r.data);
            replaceLocal({ kind: "asset", data: { ...(find("asset", up.id)?.data as Asset), src: up.src } });
            recs.push({ kind: "asset", data: { ...r.data, src: up.src } });
          } else recs.push(patchNumbers(r));
        }
        const t = proofToken();
        const res = await fetch("/api/data", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ records: recs, proof: t ?? undefined }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Couldn't save.");
        for (const r of body.records as Rec[]) {
          if (r.kind === "customer") assigned.set(`customer:${r.data.id}`, r.data.fileNo);
          if (r.kind === "order") assigned.set(`order:${r.data.id}`, r.data.orderNo);
          const local = find(r.kind, r.data.id);
          if (local) replaceLocal(patchNumbers(local));
        }
      }
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't save.";
      // Try again on the next change or poll.
    } finally {
      saving = null;
      emit();
    }
  })();
  return saving;
}

function replaceLocal(r: Rec) {
  if (!state) return;
  const next = structuredClone(state);
  if (r.kind === "customer") next.customers = next.customers.map((x) => (x.id === r.data.id ? r.data : x));
  if (r.kind === "order") next.orders = next.orders.map((x) => (x.id === r.data.id ? r.data : x));
  if (r.kind === "asset") next.assets = next.assets.map((x) => (x.id === r.data.id ? r.data : x));
  state = next;
}

/** Replace local data with the server's, unless we have unsaved changes. */
export async function reload(): Promise<void> {
  if (mode !== "db") return;
  if (saving) await saving;
  if (dirty.size) return;
  const r = await fetchData();
  if (r.mode !== "db" || dirty.size || saving) return;
  const next = fromData(r.data);
  if (JSON.stringify(next) !== JSON.stringify(state)) {
    state = next;
    emit();
  }
}

async function startDb() {
  try {
    const r = await fetchData();
    if (r.mode === "local") return startLocal();
    mode = "db";
    state = fromData(r.data);
    emit();
    window.setInterval(() => {
      if (document.visibilityState === "visible") {
        if (dirty.size) void flush();
        else void reload().catch(() => {});
      }
    }, POLL_MS);
    window.addEventListener("focus", () => void reload().catch(() => {}));
  } catch (e) {
    error = e instanceof Error ? e.message : "Couldn't load.";
    mode = "db";
    state = fromData({ customers: [], orders: [], assets: [] });
    emit();
  }
}

// ---------- the store ----------

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  void startDb();
}

function subscribe(l: () => void) {
  listeners.add(l);
  start();
  return () => listeners.delete(l);
}

/** The data; null on the server and until loaded. */
export function useDemo(): DemoState | null {
  return useSyncExternalStore(subscribe, () => state, () => null);
}

/** "db" on the live site, "local" without a database. */
export function useDataMode(): { mode: Mode; error: string | null } {
  useSyncExternalStore(subscribe, () => state, () => null);
  return { mode, error };
}

export function dataMode(): Mode {
  return mode;
}

/** Apply a change. `fn` gets a copy it may change freely. */
export function update(fn: (draft: DemoState) => void) {
  start();
  if (!state) return;
  const before = state;
  const draft = structuredClone(state);
  fn(draft);
  state = draft;
  if (mode === "local") writeLocal(draft);
  else {
    for (const [kind, list, old] of [
      ["customer", draft.customers, before.customers],
      ["order", draft.orders, before.orders],
      ["asset", draft.assets, before.assets],
    ] as const) {
      const prev = new Map<string, string>((old as { id: string }[]).map((x) => [x.id, JSON.stringify(x)]));
      for (const x of list as { id: string }[]) if (prev.get(x.id) !== JSON.stringify(x)) dirty.add(`${kind}:${x.id}`);
    }
    if (dirty.size) void flush();
  }
  emit();
}

export function getState(): DemoState | null {
  start();
  return state;
}

/** Offline demo only: start over with the sample data. */
export function resetDemo() {
  if (mode !== "local") return;
  state = seedState(Date.now());
  writeLocal(state);
  emit();
}
