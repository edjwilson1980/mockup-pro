"use client";

import { useState } from "react";
import { Button, ButtonLink, Card, CustomerShell, H1, H2, Loading, Mockup, Notice } from "@/components/ui";
import { updateDesign } from "@/lib/demo/actions";
import { useDemo } from "@/lib/demo/store";
import { SHIRT_SIZES, type RosterRow, type ShirtSize } from "@/lib/demo/types";
import { Missing, editable } from "./OrderBuilder";

/** "REYES, 12, L" per line (commas or tabs). Unknown sizes default to L and are reported. */
export function parseRoster(text: string): { rows: Omit<RosterRow, "id">[]; bad: string[] } {
  const rows: Omit<RosterRow, "id">[] = [];
  const bad: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [name = "", number = "", size = ""] = line.split(/\t|,/).map((x) => x.trim());
    const sz = size.toUpperCase().replace("XXL", "2XL").replace("XXXL", "3XL") as ShirtSize;
    if (!SHIRT_SIZES.includes(sz)) bad.push(line.trim());
    rows.push({ name: name.toUpperCase(), number: number.replace(/[^0-9]/g, "").slice(0, 3), size: SHIRT_SIZES.includes(sz) ? sz : "L" });
  }
  return { rows, bad };
}

/** Spec 2.7: names + numbers for one shirt design. */
export function Names({ id, itemId }: { id: string; itemId: string }) {
  const demo = useDemo();
  const [paste, setPaste] = useState("");
  const [pasteNote, setPasteNote] = useState<string | null>(null);
  const [preview, setPreview] = useState(0);
  if (!demo) return <Loading />;
  const order = demo.orders.find((o) => o.id === id);
  const design = order?.designs.find((d) => d.id === itemId);
  if (!order || !design) return <Missing />;
  const canEdit = editable(order);
  const roster = design.roster;
  const setRoster = (fn: (r: RosterRow[]) => RosterRow[]) => updateDesign(order.id, design.id, (d) => (d.roster = fn(d.roster)));
  const uid = () => `r-${crypto.randomUUID().slice(0, 8)}`;

  const numbers = roster.map((r) => r.number).filter(Boolean);
  const dupes = [...new Set(numbers.filter((n, i) => numbers.indexOf(n) !== i))];
  const blanks = roster.filter((r) => !r.name.trim()).length;
  const perSize = SHIRT_SIZES.map((s) => ({ size: s, names: roster.filter((r) => r.size === s).length, shirts: design.sizeCounts[s] }));
  const mismatch = perSize.filter((x) => x.names !== x.shirts);
  const showing = Math.min(preview, Math.max(0, roster.length - 1));

  function addPasted(text: string) {
    const { rows, bad } = parseRoster(text);
    setRoster((r) => [...r, ...rows.map((x) => ({ ...x, id: uid() }))]);
    setPasteNote(`Added ${rows.length} ${rows.length === 1 ? "name" : "names"}.${bad.length ? ` ${bad.length} had no size we know, so they're set to L: check them.` : ""}`);
    setPaste("");
  }

  return (
    <CustomerShell step="Step 3 of 4" back={{ href: `/order/${order.id}/item/${design.id}`, label: design.name }}>
      <H1 kicker={design.name}>Names &amp; numbers</H1>

      <div className="flex flex-col gap-2">
        <Mockup input={{ design, view: "back", assets: demo.assets, rosterIndex: showing }} alt={`Back with ${roster.at(showing)?.name ?? "a name"}`} />
        {roster.length > 1 && (
          <div className="flex items-center gap-2">
            <Button tone="secondary" onClick={() => setPreview((showing - 1 + roster.length) % roster.length)} aria-label="Previous name">
              ←
            </Button>
            <span className="flex-1 text-center font-semibold">
              {roster.at(showing)?.name} {roster.at(showing)?.number} · {roster.at(showing)?.size} <span className="text-muted font-normal">({showing + 1} of {roster.length})</span>
            </span>
            <Button tone="secondary" onClick={() => setPreview((showing + 1) % roster.length)} aria-label="Next name">
              →
            </Button>
          </div>
        )}
      </div>

      <Card className="flex flex-col gap-2">
        <H2>Roster</H2>
        <div className="grid grid-cols-[1fr_72px_80px_44px] gap-1.5 text-[13px] font-semibold text-muted">
          <span>Name</span>
          <span>Number</span>
          <span>Size</span>
          <span />
        </div>
        {roster.map((r) => (
          <div key={r.id} className="grid grid-cols-[1fr_72px_80px_44px] gap-1.5">
            <input
              aria-label="Name"
              disabled={!canEdit}
              value={r.name}
              onChange={(e) => setRoster((all) => all.map((x) => (x.id === r.id ? { ...x, name: e.target.value.toUpperCase() } : x)))}
              className={`min-h-11 px-2 rounded-[8px] border bg-white font-semibold uppercase ${!r.name.trim() ? "border-warn" : "border-line-strong"}`}
            />
            <input
              aria-label="Number"
              inputMode="numeric"
              disabled={!canEdit}
              value={r.number}
              onChange={(e) => setRoster((all) => all.map((x) => (x.id === r.id ? { ...x, number: e.target.value.replace(/[^0-9]/g, "").slice(0, 3) } : x)))}
              className={`min-h-11 px-2 rounded-[8px] border bg-white text-center font-semibold ${dupes.includes(r.number) ? "border-warn" : "border-line-strong"}`}
            />
            <select
              aria-label="Size"
              disabled={!canEdit}
              value={r.size}
              onChange={(e) => setRoster((all) => all.map((x) => (x.id === r.id ? { ...x, size: e.target.value as ShirtSize } : x)))}
              className="min-h-11 px-1 rounded-[8px] border border-line-strong bg-white"
            >
              {SHIRT_SIZES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            {canEdit && (
              <button type="button" aria-label={`Remove ${r.name || "row"}`} onClick={() => setRoster((all) => all.filter((x) => x.id !== r.id))} className="min-h-11 rounded-[8px] text-bad text-[20px]">
                ×
              </button>
            )}
          </div>
        ))}
        {canEdit && (
          <Button tone="secondary" onClick={() => setRoster((r) => [...r, { id: uid(), name: "", number: "", size: "L" }])}>
            + Add a name
          </Button>
        )}
      </Card>

      {canEdit && (
        <Card className="flex flex-col gap-2">
          <H2>Paste a list</H2>
          <p className="text-[14px] text-muted">One per line: name, number, size. For example: REYES, 12, L</p>
          <textarea rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} className="px-3 py-2 rounded-[10px] border border-line-strong bg-white font-mono text-[14px]" placeholder={"REYES, 12, L\nOKAFOR, 3, M"} />
          <div className="flex flex-wrap gap-2">
            <Button disabled={!paste.trim()} onClick={() => addPasted(paste)}>
              Add these names
            </Button>
            <label className="inline-flex items-center min-h-11 px-4 rounded-[10px] border border-line-strong bg-white font-semibold cursor-pointer">
              Upload .csv
              <input type="file" accept=".csv,text/csv,text/plain" className="sr-only" onChange={async (e) => e.target.files?.[0] && addPasted(await e.target.files[0].text())} />
            </label>
          </div>
          {pasteNote && <Notice tone="good">{pasteNote}</Notice>}
          <p className="text-[13px] text-muted">Coming next: Excel (.xlsx) upload, and texting the coach a link to fill in the roster.</p>
        </Card>
      )}

      <Card className="flex flex-col gap-2">
        <H2>Check</H2>
        <div className="grid grid-cols-6 gap-1 text-center text-[14px]">
          {perSize.map((x) => (
            <div key={x.size} className={`rounded-[8px] py-1.5 border ${x.names === x.shirts ? "border-line bg-ground" : "border-warn bg-warn-soft"}`}>
              <div className="font-semibold">{x.size}</div>
              <div>
                {x.names}/{x.shirts}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[13px] text-muted">Names in each size / shirts ordered in that size.</p>
        {mismatch.length > 0 && <Notice tone="warn">Names per size must match the shirts ordered: {mismatch.map((m) => `${m.size} has ${m.names} names for ${m.shirts} shirts`).join("; ")}.</Notice>}
        {dupes.length > 0 && <Notice tone="warn">Number {dupes.join(", ")} is used more than once. That&apos;s allowed, just making sure.</Notice>}
        {blanks > 0 && <Notice tone="warn">{blanks} {blanks === 1 ? "row has" : "rows have"} no name.</Notice>}
        {!mismatch.length && !dupes.length && !blanks && roster.length > 0 && <Notice tone="good">All {roster.length} names match the shirt sizes.</Notice>}
      </Card>
      <ButtonLink href={`/order/${order.id}`} size="lg">
        Back to the order
      </ButtonLink>
    </CustomerShell>
  );
}
