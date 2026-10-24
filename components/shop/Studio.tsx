"use client";

import { useState } from "react";
import { ColorRack } from "@/components/ColorRack";
import { PrintAreas } from "@/components/PrintAreas";
import { Button, Card, H1, H2, Mockup, Notice, ShopShell, type Backdrop } from "@/components/ui";
import { ACCEPTED_UPLOADS, download, readUpload } from "@/lib/art";
import { mockupFileName } from "@/lib/art-kind";
import { DEFAULT_GARMENT, GARMENTS, colorByName, colorsFor, defaultSizeLabel, dpiAt, fmtIn, printedInches, sizeLabels, spotDef, spotsFor, viewsFor, type ViewId } from "@/lib/catalog";
import type { Asset, PlacedSpot } from "@/lib/demo/types";
import { renderMockup } from "@/lib/mockup/render";
import { spotBoxes } from "@/lib/spot-boxes";

const SAMPLE: Asset = {
  id: "studio-art",
  customerId: "",
  name: "Lions wordmark (sample)",
  kind: "print-art",
  src: "/demo-art/lions-wordmark.svg",
  widthPx: 3150,
  heightPx: 1500,
  checks: [],
  createdAt: "",
};

/** Spec Phase 1: any art on any garment and color, at true size. */
export function Studio() {
  const [art, setArt] = useState<Asset>(SAMPLE);
  const [garmentId, setGarmentId] = useState(DEFAULT_GARMENT);
  const [color, setColor] = useState("Black");
  const [spot, setSpot] = useState<PlacedSpot>({ id: "studio", spotId: "full-front", assetId: SAMPLE.id, sizeLabel: "Medium · 10.5 × 12 in" });
  const [viewPick, setView] = useState<ViewId>("front");
  const [backdrop, setBackdrop] = useState<Backdrop>("ash");
  const [areas, setAreas] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const views = viewsFor(garmentId);
  const view = views.includes(viewPick) ? viewPick : "front";
  const studioSpots = spotsFor(garmentId).filter((s) => s.id !== "names-numbers" && s.id !== "custom");
  const def = spotDef(spot.spotId);
  const design = { garmentId, color, spots: [spot], roster: [] };
  const size = printedInches(spot, art, garmentId);
  const dpi = size ? dpiAt(art, size.widthIn) : null;
  const vector = art.src.endsWith(".svg") || art.src.startsWith("data:image/svg");
  const c = colorByName(color, garmentId);

  function pickGarment(id: string) {
    setGarmentId(id);
    if (!colorsFor(id).some((x) => x.name === color)) setColor("Black");
    const keep = spotsFor(id).some((s) => s.id === spot.spotId);
    const spotId = keep ? spot.spotId : "full-front";
    const labels = sizeLabels(spotId, id);
    setSpot((s) => ({ ...s, spotId, sizeLabel: s.sizeLabel && labels.includes(s.sizeLabel) && keep ? s.sizeLabel : defaultSizeLabel(spotId, id) }));
  }

  async function pick(f: File | undefined) {
    if (!f) return;
    setError(null);
    try {
      const r = await readUpload(f, size?.widthIn ?? 10.5);
      setArt({ ...SAMPLE, name: f.name, src: r.dataUrl, widthPx: r.widthPx, heightPx: r.heightPx, checks: r.checks });
    } catch (e) {
      setError(e instanceof Error ? e.message : "That file couldn't be used.");
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const png = await renderMockup({
        garmentId,
        view,
        colorHex: c.hex,
        spots: def.view === view ? [{ spotId: spot.spotId, artUrl: art.src, sizeLabel: spot.sizeLabel ?? undefined }] : [],
      });
      download(png, mockupFileName("STUDIO", 1, view));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the mockup.");
    } finally {
      setSaving(false);
    }
  }

  const assets = [art];

  return (
    <ShopShell current="/shop/mockup">
      <H1 kicker="Shop">Mockup studio</H1>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_400px] gap-5 items-start">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div role="tablist" aria-label="View" className="flex gap-1 p-1 rounded-[12px] bg-white border border-line">
              {views.map((v) => (
                <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`min-h-10 px-4 rounded-[9px] font-semibold capitalize ${view === v ? "bg-ink text-white" : "text-ink-2"}`}>
                  {v === "side" ? "Left sleeve" : v === "right" ? "Right sleeve" : v}
                </button>
              ))}
            </div>
            <div role="group" aria-label="Backdrop" className="flex gap-1 p-1 rounded-[12px] bg-white border border-line">
              {(["ash", "dark", "clear"] as const).map((b) => (
                <button key={b} type="button" aria-pressed={backdrop === b} onClick={() => setBackdrop(b)} className={`min-h-10 px-3 rounded-[9px] font-medium ${backdrop === b ? "bg-ink text-white" : "text-ink-2"}`}>
                  {b === "clear" ? "Transparent" : b === "ash" ? "Ash gray" : "Dark"}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 ml-auto">
              <input type="checkbox" className="size-5 accent-blue" checked={areas} onChange={(e) => setAreas(e.target.checked)} />
              Print areas
            </label>
          </div>
          <Mockup input={{ design, view, assets }} backdrop={backdrop} alt={`Mockup, ${view}`} className="max-h-[78vh] mx-auto w-full max-w-[640px]">
            {areas && <PrintAreas boxes={spotBoxes([spot], view, assets, garmentId)} />}
          </Mockup>
          {def.view !== view && <Notice tone="info">The {def.label.toLowerCase()} is on the {def.view === "side" ? "left sleeve view" : def.view === "right" ? "right sleeve view" : def.view}. Switch views to see it.</Notice>}
        </div>

        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3">
            <H2>Artwork</H2>
            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void pick(e.dataTransfer.files[0]);
              }}
              className="flex items-center gap-3 p-3 rounded-[12px] border-2 border-dashed border-line-strong cursor-pointer hover:border-blue"
            >
              <span className="size-14 shrink-0 rounded-[8px] checker p-1 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element -- local art */}
                <img src={art.src} alt="" className="max-h-full max-w-full object-contain" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold truncate">{art.name}</span>
                <span className="block text-[13px] text-blue">Drop art here or choose a file</span>
              </span>
              <input type="file" accept={ACCEPTED_UPLOADS} className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
            </label>
            {error && <Notice tone="bad">{error}</Notice>}
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-[14px] font-semibold">
                Print spot
                <select
                  className="min-h-11 px-2 rounded-[8px] border border-line-strong bg-white font-normal"
                  value={spot.spotId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSpot((s) => ({ ...s, spotId: id, sizeLabel: defaultSizeLabel(id, garmentId) }));
                    setView(spotDef(id).view as ViewId);
                  }}
                >
                  {studioSpots.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[14px] font-semibold">
                Size
                <select className="min-h-11 px-2 rounded-[8px] border border-line-strong bg-white font-normal" value={spot.sizeLabel ?? ""} onChange={(e) => setSpot((s) => ({ ...s, sizeLabel: e.target.value }))}>
                  {sizeLabels(spot.spotId, garmentId).map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </label>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[15px] bg-ground rounded-[10px] p-3">
              <dt className="text-muted">Color</dt>
              <dd className="font-semibold">
                {c.name} <span className="font-mono text-[13px] text-muted">{c.hex}</span>
              </dd>
              <dt className="text-muted">Art prints at</dt>
              <dd className="font-semibold">{size ? `${fmtIn(size.widthIn)} × ${fmtIn(size.heightIn)} in` : "—"}</dd>
              <dt className="text-muted">Sharpness</dt>
              <dd className={`font-semibold ${vector || dpi?.tone === "ok" ? "text-good" : dpi?.tone === "warn" ? "text-warn" : "text-bad"}`}>
                {vector ? "Vector · sharp" : dpi ? `${dpi.dpi} DPI${dpi.tone === "warn" ? " · may print soft" : dpi.tone === "block" ? " · too low to print" : ""}` : "—"}
              </dd>
            </dl>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save mockup PNG"}
            </Button>
            <p className="text-[13px] text-muted">The PNG is tagged as a mockup, so the gang sheet refuses it as print art.</p>
          </Card>
          <Card>
            <H2 className="mb-3">Shirt</H2>
            <div role="radiogroup" aria-label="Shirt style" className="grid grid-cols-2 gap-2 mb-4">
              {GARMENTS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  role="radio"
                  aria-checked={g.id === garmentId}
                  onClick={() => pickGarment(g.id)}
                  className={`min-h-11 px-3 rounded-[10px] border-2 text-left font-semibold ${g.id === garmentId ? "border-blue bg-blue-soft" : "border-line bg-white"}`}
                >
                  {g.short}
                  <span className="block text-[12px] font-normal text-muted">{g.name}</span>
                </button>
              ))}
            </div>
            <H2 className="mb-3">Color</H2>
            <ColorRack garmentId={garmentId} value={color} onChange={setColor} columns={8} />
          </Card>
        </div>
      </div>
    </ShopShell>
  );
}
