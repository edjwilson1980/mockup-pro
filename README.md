# Mockup Pro

Customer art → live mockups on the Gildan 5000 tee or 18500 hoodie → proof → approval → a gang sheet file for South Side DTF → the press station. The build spec is [docs/mockup-pro/MOCKUP_PRO_SPEC.md](docs/mockup-pro/MOCKUP_PRO_SPEC.md).

**Status: clickable demo of every screen.** Data is sample data in the browser (localStorage); "Reset demo data" on the home page starts over.

- Real: mockups (the kit's renderer, 87 colors, true print sizes), size and DPI checks, mockup refusal, and the **gang sheet file** (`.ssp.json`, opens in South Side DTF via `/shop` → Reopen Project → Upload).
- Not connected yet: Supabase, the art engine API, texts (Twilio) and email. The screens say so where it matters.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

## Screens

| URL | Side | What |
|---|---|---|
| `/start`, `/start/welcome` | Customer | Check in; phone or email finds the file |
| `/order/[id]` | Customer | Order builder: designs, sizes, spots, "Send to shop" |
| `/order/[id]/art` | Customer | Upload artwork (PNG, JPG, SVG); mockups refused |
| `/order/[id]/item/[itemId]` | Customer | Print spots + color with a live mockup |
| `/order/[id]/item/[itemId]/names` | Customer | Names & numbers: table, paste, CSV, size check |
| `/proof/[token]` | Customer | Proof: approve or request a change |
| `/shop`, `/shop/customers/[fileNo]` | Shop | Customer file, approval card, send proof, send to gang sheet |
| `/shop/mockup` | Shop | Mockup studio: any art, any color, save mockup PNG |
| `/shop/press/[orderNo]` | Press | One shirt at a time with measurements |

## Checks

```bash
npm run verify       # renderer (14 checks) + gang sheet export checks
npm test             # order math, transfers, press order, roster parsing
npm run typecheck
npm run lint
```

## Where things live

- `lib/mockup/`, `lib/print-sizes.json`, `lib/art-kind.ts`: from the kit (renderer, colors, sizes, mockup tagging).
- Garments live in `lib/mockup/garments.json` (photos, scale, neck point, allowed spots, size-box overrides) with a `*-colors.json` each. New garment: `node scripts/make-foldmap.mjs <photo> public/mockup-pro/<id>/front-foldmap.png --preview <dir>` (works from a dark photo too), then add it to `garments.json` and `COLORS_BY_GARMENT` in `lib/catalog.ts`.
- `lib/ssp-export.ts`: the South Side DTF file format ([docs/mockup-pro/SSP_EXPORT.md](docs/mockup-pro/SSP_EXPORT.md)).
- `art-engine/`: standalone Python artwork-processing API. Deploy separately from Next.js; app integration is not wired yet. See [art-engine/README.md](art-engine/README.md).
- `lib/demo/`: demo data and every change the screens make (`actions.ts`). Phase 2 swaps these for Supabase.
- `lib/production.ts`: approved order → gang sheet transfers and the press list.
