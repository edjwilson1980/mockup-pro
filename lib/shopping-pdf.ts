// Shopping / order list as a PDF (letter, landscape): what to buy, by item and
// color, with every size and a total line. Same rows as the CSV (lib/shopping.ts).

import { jsPDF } from "jspdf";
import { SHIRT_SIZES } from "./demo/types";
import type { ShoppingRow } from "./shopping";

export type ListPdfInput = {
  /** "Order list" or "Shopping list". */
  title: string;
  /** e.g. "Maria Reyes · File C-1001" or "All open orders". */
  subtitle?: string;
  /** Small lines under the table (orders included, what was left out). */
  notes?: string[];
  rows: ShoppingRow[];
  at?: Date;
};

const PAGE = { w: 792, h: 612, margin: 40 };
const COLS = [
  { key: "item", label: "Item", w: 230, align: "left" as const },
  { key: "color", label: "Color", w: 150, align: "left" as const },
  ...SHIRT_SIZES.map((s) => ({ key: s, label: s, w: 42, align: "right" as const })),
  { key: "total", label: "Total", w: 60, align: "right" as const },
];

export function listPdf(input: ListPdfInput): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "landscape" });
  const at = input.at ?? new Date();
  const when = at.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
  let y = PAGE.margin;

  const header = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(200, 16, 46);
    doc.text("SOUTH SIDE PRINTING", PAGE.margin, y);
    doc.setTextColor(20, 24, 31);
    doc.setFontSize(20);
    doc.text(input.title, PAGE.margin, y + 22);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(90, 96, 106);
    doc.text(when, PAGE.w - PAGE.margin, y + 22, { align: "right" });
    if (input.subtitle) doc.text(input.subtitle, PAGE.margin, y + 38);
    y += input.subtitle ? 58 : 44;
    tableHead();
  };

  const tableHead = () => {
    doc.setFillColor(242, 243, 245);
    doc.rect(PAGE.margin, y - 12, PAGE.w - PAGE.margin * 2, 18, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(90, 96, 106);
    let x = PAGE.margin + 6;
    for (const c of COLS) {
      doc.text(c.label.toUpperCase(), c.align === "right" ? x + c.w - 12 : x, y, { align: c.align });
      x += c.w;
    }
    y += 18;
  };

  const row = (cells: Record<string, string>, opts: { bold?: boolean; sub?: string } = {}) => {
    const height = opts.sub ? 30 : 20;
    if (y + height > PAGE.h - PAGE.margin) {
      doc.addPage();
      y = PAGE.margin;
      header();
    }
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(10);
    doc.setTextColor(20, 24, 31);
    let x = PAGE.margin + 6;
    for (const c of COLS) {
      const text = doc.splitTextToSize(cells[c.key] ?? "", c.w - 10)[0] ?? "";
      doc.text(text, c.align === "right" ? x + c.w - 12 : x, y, { align: c.align });
      x += c.w;
    }
    if (opts.sub) {
      doc.setFontSize(8);
      doc.setTextColor(120, 126, 136);
      doc.text(opts.sub, PAGE.margin + 6 + COLS[0].w, y + 11);
    }
    doc.setDrawColor(226, 228, 232);
    doc.line(PAGE.margin, y + height - 13, PAGE.w - PAGE.margin, y + height - 13);
    y += height;
  };

  header();
  if (!input.rows.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text("Nothing to buy: every garment is in stock.", PAGE.margin + 6, y + 4);
    y += 24;
  }
  for (const r of input.rows) {
    const cells: Record<string, string> = { item: r.item, color: r.color, total: String(r.total) };
    for (const s of SHIRT_SIZES) cells[s] = r.sizes[s] ? String(r.sizes[s]) : "";
    row(cells, { sub: r.approxColor ? "closest Gildan color" : undefined });
  }
  if (input.rows.length) {
    const totals: Record<string, string> = { item: "Total", color: "" };
    for (const s of SHIRT_SIZES) totals[s] = String(input.rows.reduce((n, r) => n + r.sizes[s], 0));
    totals.total = String(input.rows.reduce((n, r) => n + r.total, 0));
    row(totals, { bold: true });
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90, 96, 106);
  for (const note of input.notes ?? []) {
    for (const line of doc.splitTextToSize(note, PAGE.w - PAGE.margin * 2) as string[]) {
      if (y + 12 > PAGE.h - PAGE.margin) {
        doc.addPage();
        y = PAGE.margin;
      }
      doc.text(line, PAGE.margin, y + 6);
      y += 12;
    }
  }
  return doc;
}

/** The PDF as a Blob, for downloading. */
export function listPdfBlob(input: ListPdfInput): Blob {
  return listPdf(input).output("blob");
}

/**
 * Print a PDF straight from the page: loads it in a hidden frame and opens the
 * print dialog. iPhone/iPad Safari can't print a PDF frame, so there it opens
 * the PDF in a new tab (Share → Print).
 */
export function printPdf(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios) {
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  frame.src = url;
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      window.open(url, "_blank");
    }
    setTimeout(() => {
      frame.remove();
      URL.revokeObjectURL(url);
    }, 60_000);
  };
  document.body.append(frame);
}
