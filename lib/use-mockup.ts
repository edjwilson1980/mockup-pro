"use client";

// Live mockups from the kit's renderer (lib/mockup/render.ts). Each finished
// picture is cached by what's on it, so lists and thumbnails stay quick.
// Mockups are only shown, never saved as art (hard rule 1).

import { useEffect, useState } from "react";
import { inkFor, namePlate } from "./art";
import { DEFAULT_GARMENT, NAMES_BLOCK, colorByName, isPersonalized, type ViewId } from "./catalog";
import { garmentHasSpot } from "./mockup/place";
import type { Asset, Design, PlacedSpot } from "./demo/types";
import { renderMockupCanvas, type MockupSpot } from "./mockup/render";

export type MockupInput = {
  design: Pick<Design, "color" | "spots" | "roster"> & { garmentId?: string };
  view: ViewId;
  assets: Asset[];
  /** Which roster row to show on the back (names + numbers). */
  rosterIndex?: number;
};

const cache = new Map<string, Promise<string>>();
const MAX_CACHE = 80;

function spotsFor(input: MockupInput): { key: string; spots: () => MockupSpot[] } {
  const garmentId = input.design.garmentId ?? DEFAULT_GARMENT;
  const hex = colorByName(input.design.color, garmentId).hex;
  const parts: string[] = [garmentId, input.design.color, input.view];
  const make: (() => MockupSpot)[] = [];
  for (const s of input.design.spots as PlacedSpot[]) {
    if (!garmentHasSpot(garmentId, s.spotId)) continue;
    if (isPersonalized(s.spotId)) {
      const row = input.design.roster.at(input.rosterIndex ?? 0);
      const name = row?.name || "NAME";
      const number = row?.number || "00";
      make.push(() => ({ spotId: s.spotId, artUrl: namePlate(name, number, inkFor(hex), 40), widthIn: NAMES_BLOCK.widthIn, heightIn: NAMES_BLOCK.heightIn }));
      parts.push(`${s.spotId}:${name}:${number}`);
      continue;
    }
    const asset = input.assets.find((a) => a.id === s.assetId);
    if (!asset) continue;
    make.push(() => ({ spotId: s.spotId, artUrl: asset.src, sizeLabel: s.sizeLabel ?? undefined, widthIn: s.widthIn, heightIn: s.sizeLabel ? undefined : s.heightIn, freeXIn: s.freeXIn, freeYIn: s.freeYIn, moveXIn: s.moveXIn, moveYIn: s.moveYIn }));
    parts.push(`${s.spotId}:${asset.id}:${asset.src.length}:${s.sizeLabel}:${s.widthIn}:${s.heightIn}:${s.freeXIn}:${s.freeYIn}:${s.moveXIn}:${s.moveYIn}`);
  }
  return { key: parts.join("|"), spots: () => make.map((m) => m()) };
}

/** Renders (or reuses) the mockup; resolves to an object URL of a 1000 × 1250 PNG. */
export function mockupUrl(input: MockupInput): Promise<string> {
  const { key, spots } = spotsFor(input);
  let p = cache.get(key);
  if (!p) {
    const garmentId = input.design.garmentId ?? DEFAULT_GARMENT;
    p = renderMockupCanvas({ garmentId, view: input.view, colorHex: colorByName(input.design.color, garmentId).hex, spots: spots(), trim: false })
      .then((canvas) => new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't draw the mockup."))), "image/png")))
      .then((blob) => URL.createObjectURL(blob));
    p.catch(() => cache.delete(key));
    cache.set(key, p);
    if (cache.size > MAX_CACHE) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
  }
  return p;
}

export function useMockup(input: MockupInput | null): { url: string | null; error: string | null } {
  const [out, setOut] = useState<{ key: string; url: string | null; error: string | null }>({ key: "", url: null, error: null });
  const key = input ? spotsFor(input).key : "";
  useEffect(() => {
    if (!input) return;
    let live = true;
    mockupUrl(input).then(
      (url) => live && setOut({ key, url, error: null }),
      (e: unknown) => live && setOut({ key, url: null, error: e instanceof Error ? e.message : "Couldn't draw the mockup." }),
    );
    return () => {
      live = false;
    };
    // `key` captures everything the picture depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  // Keep showing the last picture while the next one draws.
  return { url: out.url, error: out.key === key ? out.error : null };
}
