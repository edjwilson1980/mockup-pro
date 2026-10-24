# Gang sheet export: Mockup Pro → South Side DTF

Mockup Pro is its own app (Vercel project `mockup-pro`). When an order is approved, **Send to gang sheet** produces a `.ssp.json` file: the South Side DTF gang sheet builder's own project format. Staff open it in the builder and every transfer is already there, with its artwork, size and quantity.

Code: [`lib/ssp-export.ts`](../../lib/ssp-export.ts). Checks: `node scripts/verify-ssp-export.mjs` (no install needed). A sample file is written to `scripts/sample-gang-sheet.ssp.json`.

## How staff open it

In South Side DTF go to `/shop`, then **Reopen Project**, then **Upload .ssp.json file**. Pasting the JSON or a Google Drive link to the file also works.

## What the file must contain

This is what the builder actually reads, checked against southside-dtf `main` v2.3.0 (`lib/project/types.ts` and `loadProject()` in `app/shop/page.tsx`). The exporter enforces all of it.

| Field | Value | Why |
|---|---|---|
| `format` | `"ssp-gangsheet-project"` | The only thing the builder rejects a file for |
| `schemaVersion` | `2` | The builder's current version |
| `source` | `"shop-builder"` | Opens in `/shop`. `"dtf-stickers"` would open the UV sticker maker instead |
| `projectId` | `prj_` + 6 base36 characters | Keep it, and bump `revision`, when an order is re-sent |
| `customer.name` | the customer | Becomes the builder's customer name |
| `images[].dataUrl` | `data:image/png;base64,…` (trimmed, transparent) | **The only way artwork gets in.** The builder never fetches `driveFileId` |
| `images[].pixelWidth` / `pixelHeight` | the PNG's real size | When it's 0 or wrong, the art is stretched. The exporter reads the PNG header and refuses a mismatch |
| `images[].placement` | one of `Left Chest, Toddler Shirt, Youth Shirt, Adult Shirt, Hoodie Front, Hoodie Back, Hat, Sleeve, Custom` | Anything else silently becomes Custom |
| `images[].size` | a label from `lib/print-sizes.json`, exact (`" · "` and `×`) | A box the art is fitted into. Anything else breaks the size menu |
| `images[].customWidth` / `customHeight` | strings in inches (Custom only) | Up to 22.3 wide and 199 tall |
| `images[].quantity` | whole number, 1 or more | |
| `images[].keepUpright` | `true` for names and numbers | `false` lets the builder turn art 90° to save film |
| `orderRefs` | `[{ system: "mockup-pro", orderNumber }]` | Ignored by the builder; it traces the file back to the order |

Positions are **not** stored. The builder packs the sheet itself every time a file is opened.

## Rules the exporter enforces

- **Only print art.** A transfer with `kind: "mockup"`, or with `_MOCKUP` in its name, is refused. The builder has no mockup check of its own yet.
- PNG only, at most 8000 px on the longest edge (the builder's upload limit).
- Transfers keep the order Mockup Pro gives them (garment size, then roster order, per spec Phase 5), so pressing goes in order.
- Every refusal is a plain sentence that can be shown to staff.

## Keep in step with the builder

The builder has three hand-copied size lists (`app/page.tsx`, `app/shop/page.tsx`, `app/send/page.tsx`). `lib/print-sizes.json` matches them exactly today, and the verify script fails if they drift apart. When the builder's sizes or `loadProject()` change, update `BUILDER_SIZES` / `openInShopBuilder()` in `scripts/verify-ssp-export.mjs` and re-run it.

## Known builder gaps (found while mapping the format)

These are in South Side DTF, not here:
- Projects that the shop and customer builders auto-save to Drive don't keep the artwork. Only the composed sheet PNG is referenced and there's no `dataUrl`, so those projects reopen without their art. Files from Mockup Pro are not affected, because they embed the art.
- `sig` is written but never checked, and `POST /api/drive/job-record` has no sign-in check.
- Files are large: base64 is about 1.33 × the PNG size. Keep art trimmed and at print resolution, not above it.
