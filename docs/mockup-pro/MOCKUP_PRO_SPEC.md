# Mockup Pro — Build Spec

**Project:** Mockup Pro, **its own app** (Vercel project `mockup-pro`), separate from the Southside Gang Sheet Builder (`southside-dtf`) and the Shop Job Board. *(Changed 2026-10-13: this spec was first written for building inside `southside-dtf`. Where it says "reuse the existing …" code from that app, copy what's needed instead.)*
**Hand-offs:** gang sheets go to South Side DTF as a `.ssp.json` file ([SSP_EXPORT.md](SSP_EXPORT.md), `lib/ssp-export.ts`). Jobs go to the Shop Job Board (endpoint to be designed).
**Owner:** Ed · South Side Printing / South Side DTF · 2824 W Marquette, Chicago
**Release target:** v3.0.0, shipped in 5 phases. Each phase is its own PR and must pass its checklist before the next one starts.

> **Read first:** `AGENTS.md` (this Next.js version has breaking changes; read `node_modules/next/dist/docs/` before writing route or page code), `PRODUCTS.md` (customer side vs shop side are separate products), and `docs/PRINT_SIZES_AND_PRINT_ART_ONLY_SPEC.md` (**do that spec first**: Mockup Pro depends on it).

---

## What Mockup Pro does

```
Customer checks in (name, phone, email) ─► customer file found or created
   ─► uploads artwork ─► ART ENGINE cleans it (background, resolution, DTF edges)
   ─► builds the order: one or more shirt designs, each with print spots + optional names/numbers
   ─► live MOCKUP on the real Gildan 5000 in any of 87 colors, at true print size
   ─► staff check art + garments in stock ─► PROOF sent by text + email
   ─► customer replies YES / APPROVED or taps Approve ─► order unlocks
   ─► GANG SHEET built from print art only (one transfer per name, sorted by size)
   ─► PRESS STATION tablet shows one shirt at a time with exact measurements
```

**Hard rules (never break these):**
1. **A mockup is never print art.** Only `kind = 'print-art'` assets can reach a print spot, a gang sheet, a PNG export or Drive's print folder. Mockups carry `_MOCKUP` in the name and a `ssp:kind=mockup` PNG chunk (`lib/art-kind.ts`).
2. **One size source.** All print sizes come from `lib/print-sizes.json`. Mockup, gang sheet and press station must show the same inches.
3. **Nothing prints before the customer approves.** "Send to gang sheet" stays disabled until `orders.status = 'approved'`.
4. **The engine never redraws customer art.** It only runs the deterministic steps in `art-engine/engine.py` and lists every step it took.

---

## What's already in this kit (working, tested)

| Path | What it is | Status |
|---|---|---|
| `lib/print-sizes.json` | Every placement and size from the current app, labels exact | from the print-sizes spec |
| `lib/mockup/gildan-5000-colors.json` | 87 Gildan 5000 colors: name, hex, family, heather | ready |
| `lib/mockup/garments.json` | Master shirt calibration (21.909 px/in, collar points) and print-spot rules | ready |
| `lib/mockup/recolor.ts` | Recolors the master white shirt to any hex (CIELAB fold map) | tested vs reference |
| `lib/mockup/place.ts` | Where each spot goes and how big, plus pressing art into the fabric folds | tested |
| `lib/mockup/render.ts` | Browser: build a finished mockup canvas or PNG (tagged as a mockup) | type-checked |
| `lib/art-kind.ts` | `isMockupFile`, `tagPngAsMockup`, refusal message | tested |
| `public/mockup-pro/gildan-5000/*` | Fold maps + transparent white masters (front, back, side) | ready |
| `art-engine/` | Python service: check, knockout, AI cut-out, vectorize, upscale, DTF clean-up, `/fix` | 4 tests pass |
| `supabase/migrations/20261012_mockup_pro.sql` | Tables, RLS on everything, print-art-only trigger, private `art` bucket | parses |
| `scripts/verify-mockup.mjs` (+ `mockup-reference.json`) | Renderer checks (14) | pass |

**Design reference:** the "Mockup Pro Customer Flow" design canvas (ask Ed for the shared link). It has 12 screens: check-in, file found, upload, quick order, order builder, print spots, names & numbers, shop customer file, proof by text, proof page, proof by email, and press station. **Match those screens.** Brand: ink `#14181F`, red `#C8102E`, blue `#1F4E8C`, ground `#F2F4F7`, Barlow Condensed (headings) + IBM Plex Sans (body), four red Chicago stars.

---

## New dependencies (add to `docs/TOOLBOX` / `package.json` with a reason)

| Package | Why |
|---|---|
| `@supabase/supabase-js`, `@supabase/ssr` | Customers, orders, proofs, artwork storage |
| `twilio` | Proof texts + inbound YES/CHANGE replies |
| `zod` | Validate every API input |
| `resend` *(or Gmail API, already used for Drive OAuth)* | Proof emails |

No others without asking.

## Environment variables (add names to `.env.example`, never values)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # server only
ART_ENGINE_URL=                     # e.g. https://engine.yourhost.com
ART_ENGINE_KEY=                     # server only, matches ENGINE_KEY on the engine
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=                  # server only, also used to verify webhooks
TWILIO_FROM_NUMBER=                 # +1...
PROOF_EMAIL_FROM=                   # "South Side Printing <proofs@yourdomain>"
RESEND_API_KEY=                     # if using Resend
INBOUND_EMAIL_SECRET=               # shared secret for the email-reply webhook (n8n)
PUBLIC_APP_URL=                     # used to build /proof/<token> links
CUSTOMER_SESSION_SECRET=            # signs the customer check-in cookie
```

---

# Phase 1 — Mockup renderer + color picker (no database)

**Goal:** staff can see any art on any Gildan 5000 color, front/back/side, at true size.

1. Copy the kit's `lib/`, `public/mockup-pro/`, `scripts/verify-mockup.mjs`, `scripts/mockup-reference.json` into the repo. Add `verify-mockup.mjs` to the verify run.
2. New page **`/shop/mockup`** (shop side only, add it to the top menu as "Mockup Pro"):
   - Left: big preview from `renderMockupCanvas()`. Front / Back / Side tabs. Backdrop light / dark / transparent.
   - Right: color rack from `gildan-5000-colors.json`, grouped by family, with search. Heathers show a speckle dot and an "approx." tag.
   - Drop artwork (PNG/JPG). Pick a print spot (`garments.json → printSpots`) and a size (`print-sizes.json`, filtered by the spot's `sizePlacement`).
   - A "Print areas" toggle draws dashed boxes for each spot at true size.
   - Readout: color name, hex, art size in inches ("10.5 × 10.5 in") and DPI at that size, using the gang sheet's rules (block below 100, warn below 150).
   - "Save mockup PNG" uses `renderMockup()`. The file name comes from `mockupFileName()` and the PNG is tagged automatically.
3. Do the rendering in a **Web Worker** if it blocks the page for more than about 100 ms (the shirt is 1000 × 1250 px; recolor is one pass).

**Checklist**
- [ ] Black, Red, Royal, Sand look like the real Gildan photos (compare with `G500` folder photos).
- [ ] Art on "Adult Shirt · Medium · 10.5 × 12 in" shows 10.5″ wide (square art) and sits 3″ below the collar.
- [ ] A saved mockup dropped into the gang sheet builder is refused with the mockup message.
- [ ] `node scripts/verify-mockup.mjs` passes. Works at 375 px wide.

---

# Phase 2 — Customer check-in, customer file, order builder

**Goal:** the customer-side flow on a phone or counter tablet, saved to Supabase.

### 2.1 Database
Run `supabase/migrations/20261012_mockup_pro.sql`. Add Ed and staff to `public.staff`. Run the Supabase security advisor and fix what it flags.

### 2.2 Customer check-in — `/start` (customer side)
- Fields: first name, last name, mobile phone, email, and two **unchecked** opt-ins: order texts (sets `sms_ok`) and promotional texts + emails (sets `marketing_ok`). Wording is in `lib/consent.ts` (A2P 10DLC checklist); save the exact text agreed to, its version and the time with the customer. Returning customers use `/start/returning` (phone or email).
- **Promotions go only to `marketing_ok` customers.** Every promo email carries an unsubscribe link; an inbound STOP clears both `sms_ok` and `marketing_ok` texts.
- Server action (`zod`-validated): normalize phone to E.164 and email to lower case.
  - **Match rule: phone OR email matches → existing file.** If phone and email match two *different* customers, don't guess: create a "needs staff" flag and use the phone match.
  - No match → create the customer (`file_no` = `C-` + `nextval('customer_file_seq')`) and a Drive folder under the existing shop Drive (reuse `lib/google-drive.ts`).
- Set an **httpOnly, signed** customer-session cookie (customer id + expiry, 4 hours, signed with `CUSTOMER_SESSION_SECRET`). **Never** expose other customers' data. Every customer route checks this cookie on the server.
- Rate-limit `/start` (e.g. 10 per IP per 10 min). Someone who knows a phone number must not be able to browse past orders without it being noticed: show past orders and saved art **only** as thumbnails + names, never contact details or addresses.

### 2.3 File found — `/start/welcome`
"Welcome back, {first name}" · saved artwork (print-art assets) · past orders with **Reorder** (copies the order's items and spots into a new draft) · **Start a new order**. "Not you? Use different info" clears the cookie.

### 2.4 Upload artwork — `/order/[id]/art`
- Accept image/*, PDF, AI, EPS, SVG, PSD (reuse `lib/accepted-uploads.ts` and `lib/rasterize-upload.ts`). Refuse mockups (`isMockupFile`).
- Save the original to bucket `art` (`kind='original'`), then call the engine **from the server**: `POST {ART_ENGINE_URL}/fix?print_width_in=<widest planned size>` with header `X-Engine-Key`.
- Save the result as `kind='print-art'` with `parent_id`, `engine_steps` and `engine_notes`.
- Show "What you sent" next to "Print ready" (on a dark tile), plus a checklist built from `steps`. Each note gets a ⚠ row in plain words.
- If the engine is down: keep the original, mark the asset "needs art team", and let the customer continue. Never block the order.

### 2.5 Order builder — `/order/[id]`
- A list of **shirt designs** (`order_items`). Each card shows front/back mockup thumbnails, garment + color + quantity, and its print spots ("Full front · Club logo · 10.5″").
- "Add another shirt or design". Quantity is entered **per garment size** (S/M/L/XL/2XL/3XL) and stored in `size_counts`.
- Footer summary: "48 shirts · 2 designs · 5 print spots · 36 names" and **Send to shop for approval** (`status → submitted`, writes an `order_events` row).

### 2.6 Print spots on one shirt — `/order/[id]/item/[itemId]`
- Front / Back / Sleeves tabs with a live mockup (`renderMockupCanvas`).
- List of spots, each with art thumbnail, spot name and size. **Change** opens the saved print-art picker plus the size menu from `print-sizes.json`.
- Add-a-spot chips come from `garments.json → printSpots`. "Somewhere else" lets the customer drag the art on the shirt; store `free_x_in` / `free_y_in` from the collar point.
- **Size rules per garment size (optional):** a spot may set `size_rules` so smaller shirts get a smaller transfer, e.g. `{"S":"Small · 10 × 12 in","M":"Medium · 10.5 × 12 in","2XL":"2XL · 12.5 × 13 in"}`. The default comes from the Adult Shirt list in `print-sizes.json` (it already varies by size).

### 2.7 Names & numbers — `/order/[id]/item/[itemId]/names`
- Table of name / number / garment size. Paste a list (one per line: `REYES, 12, L`), upload `.xlsx`/`.csv`, or **Text the coach a link** (`/roster/<token>` with only this table).
- Live back preview steps through names. Validation: duplicate numbers (warn, allow), blank names (warn), sizes summed vs `size_counts` (must match to continue).
- Name style for v1: one font, name 2.6″ tall, number 8″ tall, placed per `garments.json → names-numbers`.

**Checklist**
- [ ] A returning customer matched by phone sees their file. A new one gets `C-####` and a Drive folder.
- [ ] Customer pages show nothing about any other customer. Cookies are httpOnly + signed. Inputs are validated with zod.
- [ ] Order with 2 designs, 5 spots and 36 names saves and reloads exactly.
- [ ] Every DB write goes through server code and RLS is on (security advisor clean).

---

# Phase 3 — Shop side: customer file + art review

### `/shop/customers` and `/shop/customers/[fileNo]` (shop side, staff sign-in required)
Match the "Shop side: customer file + approval" screen:
- Header: name, file number, organization, phone, email, Texts OK badge, **Drive folder**, **Edit info**, **New order for {name}**.
- **Approval card** for the newest submitted order:
  1. *What they sent → Engine fixed → Mockup* (three images) + engine notes.
  2. **What goes on the gang sheet:** per design, every spot × quantity, plus "N transfers · M personalized, one per name, sorted by size".
  3. **Garments:** per design and size, an "In stock" tick (manual for now; leave a hook for the S&S API later).
  4. **Customer approval tracker:** Shop checks art → Proof sent → Waiting on customer → Unlocks printing.
  5. Buttons: **Send proof** (or **Resend proof**), **Send to gang sheet** (disabled until approved), **Fix by hand (open in Photoshop)** (reuse the existing Photoshop export).
- Order history table, artwork library, shop notes, today's activity (`order_events`).
- Global search: name, phone, email, order number.

**Checklist**
- [ ] Staff-only (server-checked). Non-staff get the sign-in page.
- [ ] "Send to gang sheet" is disabled until approved, and the server refuses it too.

---

# Phase 4 — Proof and customer approval (text or email)

### Sending — server action `sendProof(orderId)`
- Render front/back mockups per design (`renderMockup` in the browser, upload as `kind='mockup'`, or render server-side later). Create a `proofs` row (token).
- **Text** (if `sms_ok` and phone): via Twilio, from `TWILIO_FROM_NUMBER`:
  > Hi {first}, your proof for order #{order_no} is ready: {designs} shirt designs, {qty} shirts. {PUBLIC_APP_URL}/proof/{token}
  > Reply YES to approve and start printing. Reply CHANGE and tell us what to fix.
- **Email** (if email): subject `Your proof is ready: order #{order_no}`, mockup images, a **Review and approve** button to `/proof/{token}`, and "Or reply APPROVED".
- Order `status → proof_sent`. Event logged.

### Approving — whichever comes first wins
1. **Proof page `/proof/[token]`** (customer side, no login; the token is the key, expires in 30 days): every design front/back, the "I checked the spelling of all N names" checkbox (required when names exist), **Approve · start printing**, **Request a change** (text box).
2. **Text reply** — `POST /api/webhooks/twilio/sms`:
   - **Verify the Twilio signature** (`X-Twilio-Signature` with `TWILIO_AUTH_TOKEN`). Reject if invalid.
   - Idempotent: skip if `processed_webhooks('twilio', MessageSid)` exists.
   - Match the sender's phone to the customer's newest `proof_sent` order.
   - `YES` / `Y` / `APPROVE` / `APPROVED` (case-insensitive, trimmed) → approve. `CHANGE...` → changes requested, keeping the text. Anything else → forward to staff as a note, and reply "Thanks! Reply YES to approve or CHANGE to request edits."
   - Reply with the confirmation text ("Approved. Thanks {first}! #{order} is in the print queue…").
3. **Email reply** — `POST /api/webhooks/email-reply` with header `X-Inbound-Secret: INBOUND_EMAIL_SECRET`. An **n8n** workflow (Ed already uses n8n with Gmail) watches the proofs inbox for replies whose subject contains `#SSP-`, extracts the order number, sender and first line, and posts `{orderNo, from, text, messageId}`. Same keywords (`APPROVED`, `YES` → approve; `CHANGE` → changes). Sender must match the customer's email. Idempotent on `messageId`.
4. **Staff override:** "Mark approved (customer called)" requires a typed note.

On approve: `orders.status='approved'`, `approved_at`, `approved_via`, `approved_by_name`, the proof `response`, and an event. Staff screen updates; gang sheet unlocks.

**Checklist**
- [ ] A forged Twilio request (bad signature) does nothing. The same MessageSid twice approves once.
- [ ] YES by text, APPROVED by email, and the button each approve. CHANGE moves to `changes_requested` with the text shown to staff.
- [ ] An expired or unknown token shows "This proof link has expired. Call us at the shop." and changes nothing.

---

# Phase 5 — Production: gang sheet + press station

### Gang sheet from an approved order — server/shop action
- Expand every spot × quantity into transfers, using `size_rules` per garment size when present. **Names & numbers:** one transfer per roster row (name and number as separate pieces, or one combined piece, per staff setting). Render text with the same font at 300 DPI.
- **Only `print-art` assets** (and generated name/number art). `buildSspProject` refuses mockups. South Side DTF doesn't check for them yet (the print-sizes spec's refusal isn't built there), so this export is the guard.
- Order pieces by garment size, then by roster order, so pressing goes in order. Label each name transfer with a tiny size + name tag outside the art area (reuse the existing label code).
- Hand off with `buildSspProject()` (`lib/ssp-export.ts`, see [SSP_EXPORT.md](SSP_EXPORT.md)): the result is a `.ssp.json` file that staff download (and/or that is saved to the order's Drive folder) and open in South Side DTF via `/shop` → Reopen Project. Record in `order_events`.
- Checklist: `node scripts/verify-ssp-export.mjs` passes, and the file opens in the builder with every transfer, size and quantity.

### Press station — `/shop/press/[orderNo]` (tablet, landscape, dark, no clutter)
Match the "Press station" screen:
- Top: order number, "Shirt 1 of 2 · Black Gildan 5000", green "Customer approved {time}".
- Big front and back images with **yellow measurement lines** (width, inches below collar), drawn from `garments.json` + the spot's real size. **The size rule for this shirt size is shown under each image** ("Sizes S and M: use the 10″ transfer").
- Yellow **NOW PRESSING** box: "L · REYES 12", "Large 3 of 12 · shirt 17 of 36".
- Sleeve and other spots as small cards. Press settings (`[TEMP] °F · [TIME] s · [PRESSURE]`, editable in shop settings).
- Size progress strip. Buttons: **Done · next shirt** (sets `roster_rows.pressed_at` or a counter) and **Problem with this shirt** (logs an event and pings staff).
- No customer contact info, prices or notes on this screen.

**Checklist**
- [ ] 36 names produce 36 different transfers, none missing or doubled, sorted by size.
- [ ] The press station's inches equal the gang sheet transfer sizes for every spot and size.
- [ ] Order goes `printing → ready`, and the customer gets a "ready for pickup" text if `sms_ok`.

---

## Security checklist (every phase)
- Secrets only in env vars, server-only keys never `NEXT_PUBLIC_`.
- RLS on every table (migration does this). The service role is used only in server code.
- Customer routes check the signed cookie or proof token on the server. Staff routes check `is_staff`.
- Inputs validated with zod. Uploads: type + size checked on the server, private bucket, signed URLs.
- Webhooks: signature/secret verified, idempotent.
- Don't log phone numbers, emails or message bodies in full.

## Open questions for Ed (don't guess — ask)
1. Press settings for DTF on cotton (temp, time, pressure).
2. Proof link domain and the "from" email address.
3. Sleeve default size (the current app falls back to 10.5″, which isn't a sleeve size).
4. Show price before "Send to shop", or only on the proof?
5. Adult shirt 4XL/5XL sizes (the chart stops at 3XL), and is the shirt back the same as the front?
