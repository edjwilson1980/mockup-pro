"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { ColorRack } from "@/components/ColorRack";
import { PrintAreas } from "@/components/PrintAreas";
import { ButtonLink, Card, CustomerShell, H1, H2, Loading, Mockup, Notice } from "@/components/ui";
import { BRANDS, CUSTOM_MAX_H_IN, CUSTOM_MAX_IN, GARMENTS, dpiAt, fmtIn, garmentLabel, garmentName, isPersonalized, maxStandardHeightIn, maxStandardWidthIn, printedInches, sizeLabels, spotDef, spotsFor, viewsFor, type ViewId } from "@/lib/catalog";
import { addSpot, switchGarment, updateDesign } from "@/lib/demo/actions";
import { useDemo } from "@/lib/demo/store";
import type { Asset, Design, Order, PlacedSpot } from "@/lib/demo/types";
import { MASTER, collarPoint, pxPerInch, spotBoxes, type SpotBox } from "@/lib/spot-boxes";
import { Missing, editable } from "./OrderBuilder";

const VIEWS: { id: ViewId; label: string }[] = [
  { id: "front", label: "Front" },
  { id: "back", label: "Back" },
  { id: "side", label: "Left sleeve" },
  { id: "right", label: "Right sleeve" },
];

/** Spec 2.6: print spots on one shirt, with a live mockup. */
export function PrintSpots({ id, itemId }: { id: string; itemId: string }) {
  const demo = useDemo();
  const router = useRouter();
  // Right after the first upload, the shirt color comes next.
  const params = useSearchParams();
  const start = params.get("start") === "1";
  const colorFirst = params.get("pick") === "color";
  const [viewPick, setView] = useState<ViewId>("front");
  const [areas, setAreas] = useState(false);
  const [colorOpen, setColorOpen] = useState(colorFirst);
  // After step 1 the shirt is chosen: show one line, and the picker only if they want to change it.
  const [changeShirt, setChangeShirt] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  const [dropped, setDropped] = useState<string[]>([]);
  if (!demo) return <Loading />;
  const order = demo.orders.find((o) => o.id === id);
  const design = order?.designs.find((d) => d.id === itemId);
  if (!order || !design) return <Missing />;
  const assets = demo.assets.filter((a) => a.customerId === order.customerId);
  const canEdit = editable(order);
  const garmentId = design.garmentId;
  const views = VIEWS.filter((v) => viewsFor(garmentId).includes(v.id));
  const view = views.some((v) => v.id === viewPick) ? viewPick : "front";
  const used = new Set(design.spots.map((s) => s.spotId));
  const edit = (fn: (d: Design) => void) => updateDesign(order.id, design.id, fn);
  const editSpot = (spotId: string, fn: (s: PlacedSpot) => void) =>
    edit((d) => {
      const s = d.spots.find((x) => x.id === spotId);
      if (s) fn(s);
    });
  const movingSpot = canEdit ? design.spots.find((s) => s.id === moving) : undefined;
  const moveBox = movingSpot ? spotBoxes([movingSpot], view, assets, garmentId)[0] : undefined;
  const moveArt = movingSpot ? assets.find((a) => a.id === movingSpot.assetId) : undefined;

  /** Adds a print location and goes straight to choosing its artwork. */
  const addLocation = (spotId: string, spotView: string) => {
    const id = addSpot(order.id, design.id, spotId, null);
    setView(spotView as ViewId);
    if (!isPersonalized(spotId)) router.push(`/order/${order.id}/art?design=${design.id}&spot=${id}`);
  };
  const stepTag = (text: string) => <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-red">{text}</span>;

  const shirtCard = (
    <Card className={start ? "border-2 border-blue" : ""}>
      {start && stepTag("Step 1")}
      <H2 className="mb-3">{start ? "What are we printing on?" : "Shirt"}</H2>
      <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Shirt style">
        {GARMENTS.map((g) => {
          const on = g.id === garmentId;
          return (
            <button
              key={g.id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={!canEdit}
              onClick={() => {
                setDropped(switchGarment(order.id, design.id, g.id));
                setMoving(null);
              }}
              className={`flex flex-col gap-1.5 p-2 rounded-[12px] border-2 text-left ${on ? "border-blue bg-blue-soft" : "border-line bg-white hover:border-line-strong"}`}
            >
              <Mockup input={{ design: { garmentId: g.id, color: on ? design.color : "Black", spots: [], roster: [] }, view: "front", assets: [] }} alt="" />
              <span className="font-semibold">{g.short}</span>
              <span className="text-[13px] text-muted leading-tight">{g.name}</span>
            </button>
          );
        })}
      </div>
      <BrandPicker
        garmentId={garmentId}
        brand={design.brand ?? null}
        disabled={!canEdit}
        onChange={(b) => edit((d) => (d.brand = b))}
      />
      {dropped.length > 0 && (
        <div className="mt-3">
          <Notice tone="warn">
            Removed {dropped.join(", ")}: the {garmentName(garmentId)} doesn&apos;t have {dropped.length === 1 ? "that spot" : "those spots"}.
          </Notice>
        </div>
      )}
    </Card>
  );

  /** The one place print locations are listed and added (top on a new shirt, below color otherwise). */
  const open = spotsFor(garmentId).filter((s) => !used.has(s.id));
  const locationsCard = (
    <Card className={`flex flex-col gap-3 ${start ? "border-2 border-blue" : ""}`}>
      <div>
        {start && stepTag("Step 2")}
        <H2>{start ? "Where does the print go?" : "Print locations"}</H2>
        <p className="text-muted text-[14px]">
          {start ? "Pick a spot, then choose or upload the artwork for it. You can add more spots after." : "Front, back, sleeves: each location can have its own artwork."}
        </p>
      </div>
      {design.spots.map((s) => (
        <SpotRow
          key={s.id}
          order={order}
          design={design}
          spot={s}
          assets={assets}
          canEdit={canEdit}
          onView={setView}
          moving={moving === s.id}
          onMoveToggle={() => {
            setMoving(moving === s.id ? null : s.id);
            setView(spotDef(s.spotId).view as ViewId);
          }}
        />
      ))}
      {canEdit && open.length > 0 && (
        <div>
          {design.spots.length > 0 && <div className="text-[14px] font-semibold text-muted mb-1.5">Add another print location</div>}
          <div className={design.spots.length ? "flex flex-wrap gap-2" : "grid grid-cols-2 gap-2"}>
            {open.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => addLocation(s.id, s.view)}
                className={
                  design.spots.length
                    ? "min-h-11 px-3.5 rounded-full border border-line-strong bg-white font-medium hover:border-blue"
                    : "min-h-14 px-3 rounded-[12px] border-2 border-line-strong bg-white font-semibold text-left hover:border-blue"
                }
              >
                {design.spots.length ? `+ ${s.label}` : s.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </Card>
  );

  const colorCard = (
    <Card className={colorFirst ? "border-2 border-blue" : ""}>
      <button type="button" className="w-full flex items-center gap-2 min-h-11" onClick={() => setColorOpen(!colorOpen)} aria-expanded={colorOpen}>
        <span className="flex flex-col items-start text-left">
          {colorFirst && stepTag("Next")}
          <H2>{colorFirst ? "Pick your color" : "Color"}</H2>
        </span>
        <span className="ml-auto text-ink-2 text-right">
          {garmentLabel(design)} · <b>{design.color}</b> {colorOpen ? "▴" : "▾"}
        </span>
      </button>
      {design.brand && <p className="text-[13px] text-muted mt-1">Pick the closest color. The mockup shows it on a {garmentName(garmentId)}; the shop matches it in {design.brand}.</p>}
      {colorOpen && canEdit && (
        <div className="mt-3">
          <ColorRack garmentId={garmentId} value={design.color} onChange={(c) => edit((d) => (d.color = c))} />
        </div>
      )}
    </Card>
  );

  return (
    <CustomerShell step="Step 3 of 4" back={{ href: `/order/${order.id}`, label: "Your order" }}>
      <H1 kicker={`Order ${order.orderNo}`}>{design.name}</H1>
      {!canEdit && <Notice tone="info">This order is with the shop, so it can&apos;t be changed here.</Notice>}
      {start && shirtCard}
      {start && locationsCard}
      {colorFirst && colorCard}

      <div
        role="tablist"
        aria-label="Side of the shirt"
        className="grid gap-1 p-1 rounded-[12px] bg-white border border-line"
        style={{ gridTemplateColumns: `repeat(${views.length}, minmax(0, 1fr))` }}
      >
        {views.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={view === v.id}
            onClick={() => setView(v.id)}
            className={`min-h-11 rounded-[9px] font-semibold ${view === v.id ? "bg-ink text-white" : "text-ink-2"}`}
          >
            {v.label}
          </button>
        ))}
      </div>
      <Mockup input={{ design, view, assets }} alt={`${design.name}, ${view}`}>
        {areas && <PrintAreas boxes={spotBoxes(design.spots, view, assets, garmentId)} />}
        {moveBox && (
          <DragBox
            key={`${moveBox.id}:${moveBox.x}:${moveBox.y}`}
            box={moveBox}
            view={view}
            garmentId={garmentId}
            artSrc={moveArt?.src}
            onMove={(dx, dy) =>
              editSpot(moveBox.id, (s) => {
                s.moveXIn = snap((s.moveXIn ?? 0) + dx);
                s.moveYIn = snap((s.moveYIn ?? 0) + dy);
              })
            }
          />
        )}
      </Mockup>
      {movingSpot && (
        <Notice tone="info">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex-1 min-w-[200px]">Drag the art on the shirt to place it by hand. Arrow keys nudge it ¼ in.</span>
            <button
              type="button"
              className="underline min-h-11 px-1"
              onClick={() =>
                editSpot(movingSpot.id, (s) => {
                  delete s.moveXIn;
                  delete s.moveYIn;
                })
              }
            >
              Reset to standard spot
            </button>
            <button type="button" className="min-h-11 px-4 rounded-[10px] bg-blue text-white font-semibold" onClick={() => setMoving(null)}>
              Done placing
            </button>
          </div>
        </Notice>
      )}
      <label className="flex items-center gap-2 text-[15px] w-fit">
        <input type="checkbox" className="size-5 accent-blue" checked={areas} onChange={(e) => setAreas(e.target.checked)} />
        Show print areas at true size
      </label>

      {!start &&
        (changeShirt ? (
          shirtCard
        ) : (
          <div className="flex items-center gap-2 text-[15px]">
            <span className="text-muted">Shirt:</span>
            <b>{garmentLabel(design)}</b>
            {canEdit && (
              <button type="button" className="ml-auto text-blue font-medium min-h-11 px-1" onClick={() => setChangeShirt(true)}>
                Change
              </button>
            )}
          </div>
        ))}
      {!colorFirst && colorCard}

      {!start && locationsCard}
      <ButtonLink href={`/order/${order.id}`} size="lg">
        Done with this shirt
      </ButtonLink>
    </CustomerShell>
  );
}

function SpotRow({
  order,
  design,
  spot,
  assets,
  canEdit,
  onView,
  moving,
  onMoveToggle,
}: {
  order: Order;
  design: Design;
  spot: PlacedSpot;
  assets: Asset[];
  canEdit: boolean;
  onView: (v: ViewId) => void;
  moving: boolean;
  onMoveToggle: () => void;
}) {
  const router = useRouter();
  const def = spotDef(spot.spotId);
  const asset = assets.find((a) => a.id === spot.assetId) ?? null;
  const size = printedInches(spot, asset, design.garmentId);
  const dpi = asset && size ? dpiAt(asset, size.widthIn) : null;
  const vector = asset?.src.startsWith("data:image/svg") || asset?.src.endsWith(".svg");
  const edit = (fn: (s: PlacedSpot) => void) =>
    updateDesign(order.id, design.id, (d) => {
      const s = d.spots.find((x) => x.id === spot.id);
      if (s) fn(s);
    });
  const select = "min-h-11 px-2 rounded-[8px] border border-line-strong bg-white text-[15px] min-w-0";
  const customSize = !spot.sizeLabel;
  const maxStd = maxStandardWidthIn(spot.spotId, design.garmentId);
  const maxStdH = maxStandardHeightIn(spot.spotId, design.garmentId);
  const [keepShape, setKeepShape] = useState(true);
  const aspect = asset ? asset.heightPx / asset.widthPx : 1;
  const q = (n: number) => Math.round(n * 4) / 4;
  const moved = !!(spot.moveXIn || spot.moveYIn);

  return (
    <div className="flex gap-3 py-3 border-t border-line first:border-t-0 first:pt-0">
      <button type="button" onClick={() => onView(def.view as ViewId)} className="size-16 shrink-0 rounded-[10px] bg-[#1c2028] p-1.5 flex items-center justify-center" aria-label={`Show the ${def.view}`}>
        {isPersonalized(spot.spotId) ? (
          <span className="font-cond font-extrabold text-white text-[20px] leading-none text-center">
            NAME
            <br />
            00
          </span>
        ) : asset ? (
          // eslint-disable-next-line @next/next/no-img-element -- local art
          <img src={asset.src} alt="" className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-white/60 text-[12px]">no art</span>
        )}
      </button>
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{def.label}</span>
          {size && (
            <span className="text-[13px] text-muted">
              prints {fmtIn(size.widthIn)} × {fmtIn(size.heightIn)} in
            </span>
          )}
          {canEdit && (
            <button type="button" className="ml-auto text-[14px] text-bad font-medium min-h-11 px-1" onClick={() => updateDesign(order.id, design.id, (d) => (d.spots = d.spots.filter((x) => x.id !== spot.id)))}>
              Remove
            </button>
          )}
        </div>
        {isPersonalized(spot.spotId) ? (
          <Link href={`/order/${order.id}/item/${design.id}/names`} className="text-blue font-semibold">
            Names &amp; numbers: {design.roster.length} {design.roster.length === 1 ? "name" : "names"} →
          </Link>
        ) : (
          canEdit && (
            <div className="grid grid-cols-2 gap-2">
              <select
                aria-label="Artwork"
                className={select}
                value={spot.assetId ?? ""}
                onChange={(e) => {
                  if (e.target.value === "__upload") router.push(`/order/${order.id}/art?design=${design.id}&spot=${spot.id}`);
                  else edit((s) => (s.assetId = e.target.value || null));
                }}
              >
                <option value="">Pick artwork…</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
                <option value="__upload">Upload new…</option>
              </select>
              <select
                aria-label="Size"
                className={select}
                value={customSize ? "__custom" : (spot.sizeLabel ?? "")}
                onChange={(e) => {
                  const v = e.target.value;
                  edit((s) => {
                    if (v === "__custom") {
                      s.widthIn = q(size?.widthIn ?? maxStd);
                      s.heightIn = q(size?.heightIn ?? maxStdH);
                      s.sizeLabel = null;
                    } else {
                      s.sizeLabel = v;
                      delete s.widthIn;
                      delete s.heightIn;
                    }
                  });
                }}
              >
                {sizeLabels(spot.spotId, design.garmentId).map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
                <option value="__custom">Custom size…</option>
              </select>
            </div>
          )
        )}
        {customSize && !isPersonalized(spot.spotId) && canEdit && (
          <div className="flex flex-col gap-2 text-[14px]">
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                Width (in)
                <input
                  type="number"
                  step={0.25}
                  min={1}
                  max={CUSTOM_MAX_IN}
                  className={select}
                  value={spot.widthIn ?? ""}
                  onChange={(e) => {
                    const w = Math.min(CUSTOM_MAX_IN, Math.max(1, Number(e.target.value) || 1));
                    edit((s) => {
                      s.widthIn = w;
                      if (keepShape) s.heightIn = Math.min(CUSTOM_MAX_H_IN, q(w * aspect));
                    });
                  }}
                />
              </label>
              <label className="flex flex-col gap-1">
                Height (in)
                <input
                  type="number"
                  step={0.25}
                  min={1}
                  max={CUSTOM_MAX_H_IN}
                  className={select}
                  value={spot.heightIn ?? ""}
                  onChange={(e) => {
                    const h = Math.min(CUSTOM_MAX_H_IN, Math.max(1, Number(e.target.value) || 1));
                    edit((s) => {
                      s.heightIn = h;
                      if (keepShape) s.widthIn = Math.min(CUSTOM_MAX_IN, q(h / aspect));
                    });
                  }}
                />
              </label>
            </div>
            <label className="flex items-center gap-2 w-fit">
              <input type="checkbox" className="size-5 accent-blue" checked={keepShape} onChange={(e) => setKeepShape(e.target.checked)} />
              Keep the art&apos;s shape (changing one changes the other)
            </label>
            {!keepShape && size && spot.widthIn && spot.heightIn && (Math.abs(size.widthIn - spot.widthIn) > 0.1 || Math.abs(size.heightIn - spot.heightIn) > 0.1) && (
              <span className="text-muted">
                The art isn&apos;t stretched: it fits inside {fmtIn(spot.widthIn)} × {fmtIn(spot.heightIn)} in and prints at {fmtIn(size.widthIn)} × {fmtIn(size.heightIn)} in.
              </span>
            )}
            {size && (size.widthIn > maxStd + 1e-6 || size.heightIn > maxStdH + 1e-6) && (
              <span className="text-warn font-medium">
                Bigger than the largest standard size ({fmtIn(maxStd)} × {fmtIn(maxStdH)} in). Check it fits the shirt; the shop will confirm.
              </span>
            )}
          </div>
        )}
        {!isPersonalized(spot.spotId) && asset && canEdit && (
          <div className="flex flex-wrap items-center gap-2 text-[14px]">
            <button
              type="button"
              onClick={onMoveToggle}
              aria-pressed={moving}
              className={`min-h-11 px-3 rounded-[8px] border font-medium ${moving ? "bg-blue text-white border-blue" : "bg-white border-line-strong hover:border-blue"}`}
            >
              {moving ? "Placing by hand…" : "Move by hand"}
            </button>
            {moved && <span className="text-muted">Moved {[fmtMove(spot.moveXIn ?? 0, "right", "left"), fmtMove(spot.moveYIn ?? 0, "down", "up")].filter(Boolean).join(", ")}</span>}
          </div>
        )}
        {spot.spotId === "custom" && canEdit && (
          <div className="grid grid-cols-2 gap-2 text-[14px]">
            <label className="flex flex-col gap-1">
              Across from center (in)
              <input type="number" step={0.25} className={select} value={spot.freeXIn ?? 0} onChange={(e) => edit((s) => (s.freeXIn = Number(e.target.value)))} />
            </label>
            <label className="flex flex-col gap-1">
              Below the collar (in)
              <input type="number" step={0.25} min={0} className={select} value={spot.freeYIn ?? 6} onChange={(e) => edit((s) => (s.freeYIn = Number(e.target.value)))} />
            </label>
          </div>
        )}
        {dpi && !vector && (
          <span className={`text-[13px] font-medium ${dpi.tone === "ok" ? "text-good" : dpi.tone === "warn" ? "text-warn" : "text-bad"}`}>
            {dpi.dpi} DPI at this size{dpi.tone === "warn" ? " · may print soft" : dpi.tone === "block" ? " · too low to print; the shop will contact you" : ""}
          </span>
        )}
      </div>
    </div>
  );
}

const snap = (n: number) => Math.round(n * 8) / 8;

function fmtMove(n: number, plus: string, minus: string): string {
  return n ? `${fmtIn(Math.abs(n))} in ${n > 0 ? plus : minus}` : "";
}

/** Manual placement: drag (or arrow-key) the art's box over the mockup. Reports the inches moved on release. */
function DragBox({ box, view, garmentId, artSrc, onMove }: { box: SpotBox; view: ViewId; garmentId: string; artSrc?: string; onMove: (dxIn: number, dyIn: number) => void }) {
  const [drag, setDrag] = useState<{ sx: number; sy: number; dx: number; dy: number; scale: number } | null>(null);
  const x = box.x + (drag?.dx ?? 0);
  const y = box.y + (drag?.dy ?? 0);
  const collar = collarPoint(view, garmentId);
  const ppi = pxPerInch(garmentId);
  const pct = (n: number, of: number) => `${(n / of) * 100}%`;
  const fromCenter = collar ? (x + box.width / 2 - collar.x) / ppi : null;
  const belowCollar = collar ? (y - collar.y) / ppi : null;
  const where =
    belowCollar !== null && fromCenter !== null
      ? `${fmtIn(belowCollar)} in below collar · ${Math.abs(fromCenter) < 0.06 ? "centered" : `${fmtIn(Math.abs(fromCenter))} in ${fromCenter > 0 ? "right" : "left"}`}`
      : null;

  function down(e: PointerEvent<HTMLDivElement>) {
    const frame = e.currentTarget.parentElement?.getBoundingClientRect();
    if (!frame) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ sx: e.clientX, sy: e.clientY, dx: 0, dy: 0, scale: MASTER.width / frame.width });
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    if (drag) setDrag({ ...drag, dx: (e.clientX - drag.sx) * drag.scale, dy: (e.clientY - drag.sy) * drag.scale });
  }
  function up() {
    if (!drag) return;
    setDrag(null);
    if (Math.abs(drag.dx) > 1 || Math.abs(drag.dy) > 1) onMove(drag.dx / ppi, drag.dy / ppi);
  }
  function key(e: KeyboardEvent<HTMLDivElement>) {
    const step: Record<string, [number, number]> = { ArrowLeft: [-0.25, 0], ArrowRight: [0.25, 0], ArrowUp: [0, -0.25], ArrowDown: [0, 0.25] };
    const m = step[e.key];
    if (!m) return;
    e.preventDefault();
    onMove(m[0], m[1]);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Move ${box.label}${where ? `: ${where}` : ""}`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => setDrag(null)}
      onKeyDown={key}
      className="absolute border-2 border-dashed border-blue bg-blue/10 cursor-move touch-none select-none outline-none focus-visible:ring-4 focus-visible:ring-blue/40"
      style={{ left: pct(x, MASTER.width), top: pct(y, MASTER.height), width: pct(box.width, MASTER.width), height: pct(box.height, MASTER.height) }}
    >
      {drag && artSrc && (
        // eslint-disable-next-line @next/next/no-img-element -- local art, shown while dragging
        <img src={artSrc} alt="" draggable={false} className="absolute inset-0 size-full object-contain opacity-80 pointer-events-none" />
      )}
      {where && <span className="absolute left-0 -top-7 whitespace-nowrap px-2 py-0.5 rounded-md bg-blue text-white text-[12px] font-semibold pointer-events-none">{where}</span>}
    </div>
  );
}

const OTHER = "__other";

/** Which brand the shop buys. The mockup always uses the Gildan photo. */
function BrandPicker({ garmentId, brand, disabled, onChange }: { garmentId: string; brand: string | null; disabled: boolean; onChange: (b: string | null) => void }) {
  const list = BRANDS[garmentId] ?? [];
  const typed = !!brand && !list.includes(brand);
  const [other, setOther] = useState(typed);
  const value = other || typed ? OTHER : (brand ?? "");
  return (
    <div className="mt-3 flex flex-col gap-2">
      <label className="flex flex-col gap-1">
        <span className="font-semibold text-[15px]">
          Brand <span className="font-normal text-muted">· optional</span>
        </span>
        <select
          disabled={disabled}
          className="min-h-11 px-2 rounded-[8px] border border-line-strong bg-white text-[15px]"
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            setOther(v === OTHER);
            if (v !== OTHER) onChange(v || null);
          }}
        >
          <option value="">{garmentName(garmentId)} (as shown)</option>
          {list.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
          <option value={OTHER}>Other brand…</option>
        </select>
      </label>
      {value === OTHER && (
        <input
          disabled={disabled}
          aria-label="Brand and style"
          placeholder="Brand and style, e.g. Lane Seven LS14001"
          className="min-h-11 px-3 rounded-[8px] border border-line-strong bg-white text-[15px]"
          value={typed ? brand : ""}
          onChange={(e) => onChange(e.target.value.trim() ? e.target.value : null)}
        />
      )}
    </div>
  );
}
