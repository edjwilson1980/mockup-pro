"use client";

// The link between a Mockup Pro order and its own project in Art Pro (served at /shop/mockup).
// Art Pro writes these fields onto the shared records; Mockup Pro only reads them.

import { isPersonalized } from "@/lib/catalog";
import type { Asset, Order } from "@/lib/demo/types";

type ArtProAsset = Asset & { cmykSrc?: string; originalSrc?: string; artPro?: { jobId: string; jobNo: number } };
type ArtProOrder = Order & { artPro?: { jobId: string; jobNo?: number } | null };

const BTN = "inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold no-underline min-h-11 px-4 text-[15px]";

/** This order's project in Art Pro; a full page load because Art Pro is a separate app. */
export const artProUrl = (o: Order) => `/shop/mockup#order=${encodeURIComponent(o.orderNo)}`;
export const artProJobNo = (o: Order) => (o as ArtProOrder).artPro?.jobNo ?? null;
/** Art Pro opens as soon as the customer has uploaded any art, even while the order is still a draft. */
export const canOpenInArtPro = (o: Order) => o.status !== "draft" || o.designs.some((d) => d.spots.some((s) => !!s.assetId));

/** Small link for the order history row. */
export function ArtProLink({ order }: { order: Order }) {
  if (!canOpenInArtPro(order)) return null;
  const n = artProJobNo(order);
  return (
    <a href={artProUrl(order)} className="text-blue font-semibold text-[14px] whitespace-nowrap" title="Open this order's art project in Art Pro">
      {n ? `Art Pro #${n}` : "Art Pro"} ▸
    </a>
  );
}

/** The CMYK print file Art Pro attached to this art, if any. */
export function CmykLink({ asset }: { asset: Asset | undefined }) {
  const src = (asset as ArtProAsset | undefined)?.cmykSrc;
  if (!src) return null;
  return (
    <a href={src} target="_blank" rel="noreferrer" className="text-blue font-semibold">
      CMYK print file (TIFF) ↗
    </a>
  );
}

/** Where this order's art stands in Art Pro, with the button that opens its project. */
export function ArtProBar({ order, assets }: { order: Order; assets: Asset[] }) {
  const spots = order.designs.flatMap((d) => d.spots).filter((s) => !isPersonalized(s.spotId));
  const arts = spots.map((s) => assets.find((a) => a.id === s.assetId) as ArtProAsset | undefined);
  const missing = arts.filter((a) => !a).length;
  const fixed = arts.filter((a) => a?.artPro).length;
  const sent = spots.length - missing;
  const n = artProJobNo(order);
  const job = n ? `Art Pro job #${n}` : "Art Pro";
  const done = spots.length > 0 && missing === 0 && fixed === spots.length;
  const text =
    spots.length === 0
      ? "No print art on this order yet."
      : sent === 0
        ? "Waiting for the customer to upload art."
        : order.status === "draft" && fixed < sent
          ? `Customer is still building this order · ${sent} art file${sent > 1 ? "s" : ""} uploaded, ready to edit in ${job}`
        : fixed === sent
          ? `Print-ready from ${job} ✓${missing ? ` · ${missing} spot${missing > 1 ? "s" : ""} still waiting for art` : ""}`
          : `${job}: ${sent - fixed} of ${sent} art file${sent > 1 ? "s" : ""} still to fix${fixed ? ` · ${fixed} print-ready` : ""}`;
  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-[10px] border px-3 py-2 ${done ? "border-[#b9e2c9] bg-good-soft" : "border-line bg-ground"}`}>
      <span className={`text-[15px] font-semibold ${done ? "text-good" : ""}`}>{text}</span>
      {canOpenInArtPro(order) && (
        <a
          href={artProUrl(order)}
          title="Opens this order's own project in Art Pro"
          className={`${BTN} ml-auto ${done ? "bg-white text-ink border border-line-strong hover:border-ink-2" : "bg-blue text-white hover:bg-[#183f72]"}`}
        >
          {done ? "Open in Art Pro ▸" : "Fix art in Art Pro ▸"}
        </a>
      )}
    </div>
  );
}
