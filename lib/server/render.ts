// Server versions of the browser's canvas helpers in lib/art.ts, for building the
// gang sheet without a browser: artwork at an exact print size, and name + number
// plates. Uses sharp; the plate font ships in lib/server/fonts.

import "server-only";
import "./fontconfig";
import { join } from "node:path";
import sharp from "sharp";
import { NAMES_BLOCK } from "@/lib/catalog";

const PLATE_FONT = join(process.cwd(), "lib/server/fonts/ArchivoBlack-Regular.ttf");

async function bytesOf(src: string, origin: string): Promise<Buffer> {
  if (src.startsWith("data:")) return Buffer.from(src.slice(src.indexOf(",") + 1), "base64");
  const url = /^https?:\/\//i.test(src) ? src : new URL(src, origin).toString();
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Couldn't load artwork (${res.status}).`);
  return Buffer.from(await res.arrayBuffer());
}

/** Art redrawn as a PNG data URL at an exact pixel size (like rasterize in lib/art.ts). */
export async function rasterizeServer(src: string, widthPx: number, heightPx: number, origin: string): Promise<string> {
  const bytes = await bytesOf(src, origin);
  const svg = src.startsWith("data:image/svg") || /\.svg(\?|$)/i.test(src) || bytes.subarray(0, 200).toString("utf8").includes("<svg");
  // Vector art: draw it just big enough for the print size (sharp's base is 72 dpi), not huge.
  let density: number | undefined;
  if (svg) {
    const meta = await sharp(bytes).metadata();
    const scale = Math.max(widthPx / (meta.width || widthPx), heightPx / (meta.height || heightPx));
    density = Math.min(2400, Math.max(72, Math.ceil(72 * scale * 1.05)));
  }
  const png = await sharp(bytes, { ...(density ? { density } : {}), limitInputPixels: false })
    .resize(widthPx, heightPx, { fit: "fill" })
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

/**
 * One line of heavy text, cropped to its ink. (The comma in "Archivo Black, 200" matters:
 * without it Pango reads "Black" as a weight and falls back to another font.)
 */
/** One line of heavy text, cropped to its ink, `heightPx` tall (cap height), at most `maxWidthPx` wide. */
async function textLine(text: string, color: string, heightPx: number, maxWidthPx: number) {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const big = await sharp({ text: { text: `<span foreground="${color}">${escaped}</span>`, font: "Archivo Black, 200", fontfile: PLATE_FONT, dpi: 300, rgba: true } })
    .png()
    .toBuffer();
  const inked = await sharp(big).trim({ threshold: 1 }).png().toBuffer({ resolveWithObject: true });
  const scale = Math.min(heightPx / inked.info.height, maxWidthPx / inked.info.width);
  const w = Math.max(1, Math.round(inked.info.width * scale));
  const h = Math.max(1, Math.round(inked.info.height * scale));
  return { png: await sharp(inked.data).resize(w, h, { fit: "fill" }).png().toBuffer(), w, h };
}

/** A name + number plate as a PNG data URL (like namePlate in lib/art.ts): name on top, number below. */
export async function namePlateServer(name: string, number: string, color: string, ppi: number): Promise<string> {
  const b = NAMES_BLOCK;
  const width = Math.round(b.widthIn * ppi);
  const height = Math.round(b.heightIn * ppi);
  const layers: sharp.OverlayOptions[] = [];
  const top = name.trim() ? await textLine(name.toUpperCase(), color, b.nameIn * ppi, width * 0.98) : null;
  if (top) layers.push({ input: top.png, left: Math.round((width - top.w) / 2), top: Math.round(b.nameIn * ppi - top.h) });
  const bottom = number.trim() ? await textLine(number, color, b.numberIn * ppi, width * 0.98) : null;
  if (bottom) layers.push({ input: bottom.png, left: Math.round((width - bottom.w) / 2), top: height - bottom.h });
  const png = await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(layers)
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}
