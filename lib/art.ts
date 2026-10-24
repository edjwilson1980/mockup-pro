"use client";

// Artwork in the browser: reading uploads, name + number plates, and print-size
// PNGs for the gang sheet. The art engine (art-engine/) isn't connected in the
// demo, so uploads are checked here and used as sent.

import { MOCKUP_REFUSED_MESSAGE, isMockupFile } from "./art-kind";
import { DPI, NAMES_BLOCK } from "./catalog";
import type { ArtCheck } from "./demo/types";

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That file couldn't be opened as an image."));
    img.src = src;
  });
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Couldn't read the file."));
    r.readAsDataURL(file);
  });
}

export const ACCEPTED_UPLOADS = "image/png,image/jpeg,image/svg+xml,.png,.jpg,.jpeg,.svg";
/** Uploads are kept in this browser in the demo, so keep them modest. */
const MAX_BYTES = 8 * 1024 * 1024;

export type ReadUpload = { dataUrl: string; widthPx: number; heightPx: number; checks: ArtCheck[] };

/** Reads an upload; refuses mockups and unreadable files with a plain sentence. */
export async function readUpload(file: File, plannedWidthIn = 10.5): Promise<ReadUpload> {
  if (await isMockupFile(file)) throw new Error(MOCKUP_REFUSED_MESSAGE);
  if (!/^image\/(png|jpeg|svg\+xml)$/.test(file.type) && !/\.(png|jpe?g|svg)$/i.test(file.name)) {
    throw new Error("Upload a PNG, JPG or SVG. PDF, AI, EPS and PSD come with the art engine.");
  }
  if (file.size > MAX_BYTES) throw new Error("That file is over 8 MB. The demo keeps files in your browser, so try a smaller one.");
  const dataUrl = await readAsDataUrl(file);
  const img = await loadImage(dataUrl);
  const isSvg = /svg/.test(file.type) || /\.svg$/i.test(file.name);
  const widthPx = img.naturalWidth || 3000;
  const heightPx = img.naturalHeight || 3000;
  const checks: ArtCheck[] = [];
  if (isSvg) checks.push({ ok: true, text: "Vector art: prints sharp at any size" });
  else {
    const dpi = Math.round(widthPx / plannedWidthIn);
    checks.push(
      dpi >= DPI.warn
        ? { ok: true, text: `Sharp enough: ${dpi} DPI at ${plannedWidthIn} in wide` }
        : { ok: false, text: `Low resolution: ${dpi} DPI at ${plannedWidthIn} in wide. It may print soft; the art team will check it.` },
    );
  }
  checks.push((await hasTransparency(img)) ? { ok: true, text: "Transparent background" } : { ok: false, text: "Has a solid background. The art team will remove it before printing." });
  return { dataUrl, widthPx, heightPx, checks };
}

async function hasTransparency(img: HTMLImageElement): Promise<boolean> {
  const c = document.createElement("canvas");
  c.width = 96;
  c.height = Math.max(1, Math.round((96 * (img.naturalHeight || 1)) / (img.naturalWidth || 1)));
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
  return false;
}

/** White text on dark shirts, ink on light ones. */
export { inkFor } from "./ink";

/**
 * A name + number plate (name 2.6″, number 8″, per garments.json), as a PNG
 * data URL at `ppi` pixels per inch. Low ppi for previews, 300 for printing.
 */
export function namePlate(name: string, number: string, color: string, ppi: number): string {
  const b = NAMES_BLOCK;
  const c = document.createElement("canvas");
  c.width = Math.round(b.widthIn * ppi);
  c.height = Math.round(b.heightIn * ppi);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const fit = (text: string, sizePx: number) => {
    ctx.font = `900 ${sizePx}px "Arial Black", Arial, sans-serif`;
    const w = ctx.measureText(text).width;
    if (w > c.width * 0.98) ctx.font = `900 ${(sizePx * c.width * 0.98) / w}px "Arial Black", Arial, sans-serif`;
  };
  // Cap height is about 0.72 of the font size.
  fit(name.toUpperCase(), (b.nameIn * ppi) / 0.72);
  ctx.fillText(name.toUpperCase(), c.width / 2, b.nameIn * ppi);
  fit(number, (b.numberIn * ppi) / 0.72);
  ctx.fillText(number, c.width / 2, b.heightIn * ppi);
  return c.toDataURL("image/png");
}

/** Art redrawn as a PNG at an exact pixel size (for the gang sheet). */
export async function rasterize(src: string, widthPx: number, heightPx: number): Promise<string> {
  const img = await loadImage(src);
  const c = document.createElement("canvas");
  c.width = widthPx;
  c.height = heightPx;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, widthPx, heightPx);
  return c.toDataURL("image/png");
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
