# Print Sizes File + Print Art Only on Gang Sheets

**Project:** Southside Gang Sheet Builder (`southside-dtf`)
**Where this goes:** `docs/PRINT_SIZES_AND_PRINT_ART_ONLY_SPEC.md`
**Ships with:** `lib/print-sizes.json` (included next to this spec — copy it into `lib/`)
**Release:** **v2.4.0** — update the version footer and `CHANGELOG.md`

| Part | What it covers |
|---|---|
| **A. One size file** | Every print size comes from `lib/print-sizes.json`. Delete the three hand-copied size lists. |
| **B. Print art only** | A gang sheet can only ever contain print-ready artwork. Mockup pictures (art shown on a shirt) can never reach the sheet, the PNG export or Google Drive's print files. |
| **C. Checks** | A verify script proving nothing about sizes or pricing changed, and that mockups are refused. |

### Summary of decisions
- `lib/print-sizes.json` is the **single source of truth** for placements and sizes. Mockup Pro (the mockup screens and the press station) will read the same file later.
- **No size changes in this release.** Every label and number in the JSON matches the current app exactly. Saved projects (`project.ssp.json`) store size labels like `"Medium · 10.5 × 12 in"`, so labels must stay **character-for-character identical**.
- **Mockups are preview pictures only.** They are for the customer proof and the technician screen. They are never print files.
- Do **not** change pricing, sheet tiers, gutters, DPI rules or packing in this release.

---

# Part A — One size file

### A1. Today
The same `sizeOptions` list is copied by hand into three files:
- `app/page.tsx` (customer builder)
- `app/shop/page.tsx` (shop builder)
- `app/send/page.tsx` (done-for-you intake)

Plus two copies of `recommendedSize()` in `app/page.tsx` and `app/shop/page.tsx`.

### A2. Add `lib/print-sizes.json`
Copy the provided file into `lib/`. Shape:

```json
{
  "version": 1,
  "rule": "Each size is a MAX box ...",
  "printDpi": 300,
  "placements": [
    {
      "id": "Adult Shirt",
      "recommended": "Medium · 10.5 × 12 in",
      "sizes": [
        { "label": "Small · 10 × 12 in", "name": "Small", "maxWidthIn": 10, "maxHeightIn": 12, "maxWidthPx": 3000, "maxHeightPx": 3600 }
      ]
    }
  ],
  "fallbackSizes": [ { "label": "3 in", "maxWidthIn": 3, "maxHeightIn": 3 } ],
  "customPlacement": { "id": "Custom", "maxWidthIn": 22.3, "maxHeightIn": 199 },
  "gangSheet": { "filmWidthIn": 24, "printableWidthIn": 22.3, "minGapIn": 0.125, "preferredGapIn": 0.25, "maxSheetLengthIn": 200, "blockBelowDpi": 100, "warnBelowDpi": 150, "sheetTiers": [ ... ] }
}
```

- `placements` order = the order shown in the "What are you printing?" menu.
- `label` is the exact string the app already uses and saves.
- `fallbackSizes` = today's `sizeOptions.default`.
- `gangSheet` is **reference only** in this release. Keep `lib/sheet-size.ts` and `lib/sheet-pricing.ts` as they are. The verify script (Part C) checks that the JSON matches them.

### A3. Add `lib/print-sizes.ts`
A small typed wrapper so pages never touch the raw JSON:

```ts
import data from '@/lib/print-sizes.json'

export type PrintSize = { label: string; name: string; maxWidthIn: number; maxHeightIn: number; maxWidthPx: number; maxHeightPx: number }
export type Placement = { id: string; recommended: string; sizes: PrintSize[] }

export const PRINT_DPI: number
export const placementIds: string[]                        // same as today's `placements` array
export const sizeOptions: Record<string, string[]>         // same shape as today, including `default`
export function recommendedSize(placementId: string): string   // same results as today's builder function
export function findPrintSize(placementId: string, label: string): PrintSize | null
```

- `sizeOptions` must equal today's object exactly: the same keys, the same label strings, the same order, and `default` built from `fallbackSizes`.
- `recommendedSize()` must return exactly what `app/page.tsx` returns today for every placement, including the current `'10.5 in'` fallback for Sleeve and Custom.

### A4. Replace the copies
- `app/page.tsx` and `app/shop/page.tsx`: delete the local `placements`, `sizeOptions` and `recommendedSize`, and import them from `@/lib/print-sizes`.
- `app/send/page.tsx`: delete its local `placements` and `sizeOptions` and import them. **Keep its own `recommendedSize()`** (it returns the first option on purpose), but have it read the imported `sizeOptions`.
- `lib/compose-sheet.ts` `pieceBoxInches()` keeps parsing the label exactly as it does now. Do not change how a label becomes a box.

### A5. Known issue — do not fix in this release
Sleeve's recommended size falls back to `'10.5 in'`, which is not in the Sleeve list (3–5 in). Keep it as is, and list it in the PR description for Ed to decide.

---

# Part B — Print art only on the gang sheet

**Rule:** only print-ready artwork goes on a gang sheet. A mockup is any picture of artwork shown on a garment (shirt, hoodie, hat), and it must be impossible to place, export or upload as a print file.

### B1. Every sheet piece says what it is
In `lib/compose-sheet.ts`:

```ts
export type ArtKind = 'print-art' | 'mockup'

export type SheetPiece = {
  previewUrl: string
  widthIn: number
  heightIn: number
  rotated?: boolean
  /** Required. Only 'print-art' may be composed onto a sheet. */
  kind: ArtKind
}
```

- Every place that builds pieces today sets `kind: 'print-art'`: the customer builder, shop builder, sticker maker, send intake, project reopen, and Photoshop re-import.
- `composeGangSheet()` **throws before drawing anything** if any piece has `kind !== 'print-art'`:
  > "A mockup picture can't go on a gang sheet. Use the original print artwork."
- `packSheetPieces()` and the related pack helpers skip nothing silently. Mockups never reach them, and the compose check is the last guard.

### B2. Mark mockup files so they are recognisable anywhere
Mockup Pro will save mockups as PNG. Every mockup file gets **both** of these:
1. **File name ends in `_MOCKUP`**, for example `SSP-1243_shirt1_front_MOCKUP.png`.
2. **A PNG text chunk:** `tEXt` keyword `ssp:kind`, value `mockup`.

Add `lib/art-kind.ts`:

```ts
/** True when a file is a Mockup Pro mockup, by name or by its PNG text chunk. */
export async function isMockupFile(file: File | Blob, fileName?: string): Promise<boolean>
/** Adds tEXt ssp:kind=mockup to a PNG blob. Used by Mockup Pro when saving mockups. */
export async function tagPngAsMockup(png: Blob): Promise<Blob>
```

`isMockupFile` reads only the PNG chunk headers, not the whole image. It returns true if the name contains `_MOCKUP` (any case) or the chunk is present.

### B3. Refuse mockups wherever files come in
Call `isMockupFile()` and refuse the file in each of these places:
- Upload and Replace artwork (customer builder, shop builder, sticker maker, `/send`, `/upload`, `/embed/upload`)
- Photoshop re-import
- Reopen Project, when a project JSON points at an image that turns out to be a mockup

Message shown to the person:
> **This is a mockup picture, not print art.** It shows the design on a shirt, so it can't be printed. Upload the original artwork file instead.

### B4. Google Drive
- Print files keep their current folders and names.
- When Mockup Pro saves mockups, they go into a `mockups/` subfolder inside the job folder, never next to the print PNG, PLT or `project.ssp.json` print entries.
- `project.ssp.json` may reference mockups only under a separate `mockups` key, never inside the list of print pieces.

---

# Part C — Checks

Add `scripts/verify-print-sizes.mjs` (use `scripts/load-lib.mjs` like the other verify scripts) and add it to the existing verify run. It must check:

1. **Labels unchanged.** `sizeOptions` from `lib/print-sizes.ts` equals a snapshot of today's object, taken from `app/page.tsx` before this change. Same keys, same labels, same order.
2. **Boxes unchanged.** For every label, `piecePrintSize()` gives the same width and height before and after, for a square, a wide and a tall test image.
3. **Recommended sizes unchanged** for every placement.
4. **Sheet rules match the code.** `gangSheet` in the JSON equals `SHEET_WIDTH_IN`, `FILM_WIDTH_IN`, `SHEET_GUTTER_IN`, `PREFERRED_GUTTER_IN` and `sheetOptions` in `lib/sheet-size.ts`, `lib/compose-sheet.ts` and `lib/sheet-pricing.ts`.
5. **Mockups refused.** `composeGangSheet()` throws for a piece with `kind: 'mockup'`.
6. **Detection works.** `isMockupFile()` is true for a `_MOCKUP` file name, true for a PNG tagged by `tagPngAsMockup()`, and false for a normal PNG.

Also run all existing `scripts/verify-*.mjs`. They must pass unchanged.

---

# Acceptance checklist
- [ ] `lib/print-sizes.json` and `lib/print-sizes.ts` added. No size lists are left in `app/page.tsx`, `app/shop/page.tsx` or `app/send/page.tsx`.
- [ ] Every size menu, the size popup and the live size chart look exactly as before.
- [ ] An old saved project reopens with the same sizes and the same price.
- [ ] Uploading a `_MOCKUP` PNG shows the "mockup picture, not print art" message and adds nothing.
- [ ] The gang sheet PNG and Drive print folder never contain a mockup.
- [ ] `verify-print-sizes.mjs` and all existing verify scripts pass.
- [ ] Version footer shows **v2.4.0**, and `CHANGELOG.md` has a 2.4.0 entry.

# Do not
- Change any size, label, price, sheet tier, gutter or DPI rule.
- Rename placements.
- Add new dependencies.
