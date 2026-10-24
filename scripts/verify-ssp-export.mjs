// Checks that Mockup Pro's gang sheet export (lib/ssp-export.ts) opens cleanly in
// the South Side DTF shop builder. Run: node scripts/verify-ssp-export.mjs
// (Node 22.18+ / 24, which run TypeScript directly.)
//
// BUILDER_SIZES and openInShopBuilder() copy southside-dtf main (v2.3.0):
// app/shop/page.tsx `placements`, `sizeOptions` and `loadProject()`. If the
// builder changes those, update them here and re-run.

import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import printSizes from "../lib/print-sizes.json" with { type: "json" };
import { SSP_PLACEMENTS, SspExportError, buildSspProject, pngSize, sspFileName } from "../lib/ssp-export.ts";

const BUILDER_PLACEMENTS = ["Left Chest", "Toddler Shirt", "Youth Shirt", "Adult Shirt", "Hoodie Front", "Hoodie Back", "Hat", "Sleeve", "Custom"];
const BUILDER_SIZES = {
  "Left Chest": ["Youth Left Chest · 3 × 3 in", "Standard Left Chest · 3.75 × 3.75 in", "Oversized Left Chest · 4.5 × 4.5 in"],
  "Toddler Shirt": ["2T · 5.5 × 6 in", "3T · 6 × 6.5 in", "4T · 6.5 × 7 in", "5T · 6.5 × 7 in"],
  "Youth Shirt": ["XS · 7.5 × 8 in", "Small · 8.5 × 9 in", "Medium · 9.25 × 10 in", "Large · 9.75 × 11 in"],
  "Adult Shirt": ["Small · 10 × 12 in", "Medium · 10.5 × 12 in", "Large · 10.5 × 12 in", "XL · 10.5 × 12 in", "2XL · 12.5 × 13 in", "3XL · 13.5 × 14 in"],
  "Hoodie Front": ["Small · 10.5 × 10 in", "Medium · 10.5 × 11 in", "Large · 10.5 × 12 in", "XL · 10.5 × 12 in", "2XL · 12 × 13 in", "3XL · 13 × 15 in", "4XL · 14 × 15 in"],
  "Hoodie Back": ["Small · 10.5 × 12 in", "Medium · 10.5 × 12 in", "Large · 10.5 × 12 in", "XL · 10.5 × 12 in", "2XL · 12 × 14 in", "3XL · 13 × 15 in", "4XL · 14 × 16 in"],
  Hat: ["Small · 3 in", "Medium · 4 in", "Large · 5 in"],
  Sleeve: ["3 in", "3.5 in", "4 in", "4.5 in", "5 in"],
  Custom: ["3 in", "4 in", "5 in", "6 in", "8 in", "10 in", "12 in", "14 in"],
};

/** What the shop builder's loadProject() does with a file. */
function openInShopBuilder(project) {
  if (project.format !== "ssp-gangsheet-project") throw new Error("This file is not a gang sheet project (.ssp.json).");
  return (project.images || []).map((image, index) => {
    const placement = image.placement && BUILDER_PLACEMENTS.includes(image.placement) ? image.placement : "Custom";
    return {
      name: image.name || image.fileName || `Design ${index + 1}`,
      placement,
      size: image.size,
      customWidth: image.customWidth,
      customHeight: image.customHeight,
      quantity: Math.max(1, image.quantity || 1),
      url: image.dataUrl || "",
      pixelWidth: image.pixelWidth || 0,
      pixelHeight: image.pixelHeight || 0,
      keepUpright: Boolean(image.keepUpright),
    };
  });
}

let failures = 0;
function ok(cond, msg) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) failures++;
}
function throws(fn, pattern, msg) {
  try {
    fn();
    ok(false, `${msg} (did not throw)`);
  } catch (e) {
    ok(e instanceof SspExportError && pattern.test(e.message), `${msg} → “${e.message}”`);
  }
}

/** A transparent RGBA PNG of the given size, as a data URL. */
function png(w, h) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const raw = Buffer.alloc((w * 4 + 1) * h); // all transparent
  const file = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
  return `data:image/png;base64,${file.toString("base64")}`;
}

// ---------- 1. Same placements and labels as the builder ----------
ok(JSON.stringify(SSP_PLACEMENTS) === JSON.stringify(BUILDER_PLACEMENTS), "placements match the builder, in order");
for (const p of printSizes.placements) {
  const ours = p.sizes.map((s) => s.label);
  ok(JSON.stringify(ours) === JSON.stringify(BUILDER_SIZES[p.id]), `${p.id}: size labels match the builder character for character`);
}

// ---------- 2. A typical team order ----------
const logo = { dataUrl: png(3150, 3600), pixelWidth: 3150, pixelHeight: 3600 };
const chest = { dataUrl: png(1125, 1100), pixelWidth: 1125, pixelHeight: 1100 };
const name = { dataUrl: png(2400, 780), pixelWidth: 2400, pixelHeight: 780 };
const order = {
  orderNumber: "MP1042",
  customer: { name: "Lincoln Park Lions", email: "coach@example.com" },
  now: new Date("2026-10-13T15:00:00Z"),
  appVersion: "0.1.0",
  transfers: [
    { name: "Lions crest · left chest", kind: "print-art", placement: "Left Chest", sizeLabel: "Standard Left Chest · 3.75 × 3.75 in", quantity: 18, png: chest },
    { name: "SMITH", kind: "print-art", placement: "Custom", customWidthIn: 10, customHeightIn: 3.25, quantity: 1, png: name, keepUpright: true },
    { name: "Lions logo · back", kind: "print-art", placement: "Adult Shirt", sizeLabel: "XL · 10.5 × 12 in", quantity: 18, png: logo },
  ],
};
const project = buildSspProject(order);
const designs = openInShopBuilder(project);

ok(project.format === "ssp-gangsheet-project" && project.schemaVersion === 2, "format and schema version");
ok(/^prj_[0-9a-z]{6}$/.test(project.projectId), `project id looks like the builder's (${project.projectId})`);
ok(project.source === "shop-builder", "opens in the shop builder");
ok(designs.length === 3, "all three designs open");
ok(designs.map((d) => d.name).join(" | ") === "Lions crest · left chest | SMITH | Lions logo · back", "transfers keep the order Mockup Pro gave");
ok(designs.every((d) => d.url.startsWith("data:image/png;base64,")), "every design has its artwork embedded");
ok(designs[2].placement === "Adult Shirt" && designs[2].size === "XL · 10.5 × 12 in", "placement and size label survive the load");
ok(designs.filter((d) => d.placement !== "Custom").every((d) => BUILDER_SIZES[d.placement].includes(d.size)), "size label is in the builder's menu for that placement");
ok(designs[1].placement === "Custom" && designs[1].customWidth === "10" && designs[1].customHeight === "3.25", "custom size kept as strings in inches");
ok(designs[1].keepUpright === true && designs[2].keepUpright === false, "names stay upright; logos may turn");
ok(designs[2].pixelWidth === 3150 && designs[2].pixelHeight === 3600, "real pixel size kept (no stretching)");
ok(designs[0].quantity === 18 && designs[1].quantity === 1, "quantities kept");
ok(project.customer.name === "Lincoln Park Lions" && project.orderRefs[0].orderNumber === "MP1042", "customer and order number kept");
ok(sspFileName(project) === "Lincoln Park Lions MP1042.ssp.json", `download name: ${sspFileName(project)}`);
ok(JSON.stringify(pngSize(logo.dataUrl)) === JSON.stringify({ w: 3150, h: 3600 }), "PNG size read from the header");

// Same project id and a higher revision when an order is sent again.
const again = buildSspProject({ ...order, projectId: project.projectId, revision: 2, createdAt: project.createdAt });
ok(again.projectId === project.projectId && again.revision === 2 && again.createdAt === project.createdAt, "re-export keeps the same project");

// ---------- 3. Things that must never reach a sheet ----------
const base = order.transfers[2];
const one = (t) => () => buildSspProject({ ...order, transfers: [{ ...base, ...t }] });
throws(one({ kind: "mockup" }), /mockup/, "a mockup is refused");
throws(one({ name: "Lions logo_MOCKUP" }), /mockup/, "a _MOCKUP file is refused");
throws(one({ sizeLabel: "Medium · 10.5 x 12 in" }), /isn't a Adult Shirt size/, "a near-miss label (x instead of ×) is refused");
throws(one({ placement: "Pocket" }), /isn't a gang sheet placement/, "an unknown placement is refused");
throws(one({ quantity: 0 }), /quantity/, "quantity 0 is refused");
throws(one({ png: { ...logo, pixelWidth: 1000 } }), /says 1000 × 3600 px but the PNG is 3150 × 3600 px/, "wrong pixel size is refused");
throws(one({ png: { dataUrl: "data:image/jpeg;base64,/9j/4AAQ", pixelWidth: 10, pixelHeight: 10 } }), /PNG/, "a JPEG is refused");
throws(one({ placement: "Custom", customWidthIn: 24, customHeightIn: 5 }), /custom width/, "wider than the film is refused");
throws(() => buildSspProject({ ...order, transfers: [] }), /Nothing to put/, "an empty sheet is refused");

// ---------- 4. Sample file to open in the builder by hand ----------
const sampleUrl = new URL("./sample-gang-sheet.ssp.json", import.meta.url);
writeFileSync(sampleUrl, JSON.stringify(buildSspProject({ ...order, transfers: order.transfers.map((t) => ({ ...t, png: { dataUrl: png(300, 300), pixelWidth: 300, pixelHeight: 300 } })) }), null, 2));
console.log(`\nSample written: scripts/sample-gang-sheet.ssp.json (open it in the builder: /shop → Reopen Project → Upload).`);

console.log(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.");
process.exit(failures ? 1 : 0);
