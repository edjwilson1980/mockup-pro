# Mockup Pro art engine

A small Python web service that cleans up customer artwork for DTF printing.
It runs **separately** from the Next.js app (too heavy for Vercel functions). The app calls it.

| Endpoint | What it does |
|---|---|
| `POST /check?print_width_in=10.5` | Quality report: pixel size, DPI at print size, solid background, simple logo or photo |
| `POST /knockout` | Removes a flat background box (white, black, any color). Keeps white **inside** the logo |
| `POST /remove-background` | AI cut-out for photos and busy backgrounds |
| `POST /vectorize` | Flat logo to SVG |
| `POST /upscale` | AI 4× upscale (Real-ESRGAN, optional) |
| `POST /dtf-cleanup` | No half-transparent pixels, trimmed, 300 DPI |
| `POST /fix?print_width_in=10.5` | All of the above, in the right order, returns `{png_base64, svg, steps, notes, before, after}` |
| `GET /health` | Status |

Every request needs the header `X-Engine-Key: <ENGINE_KEY>`.
Files with `_MOCKUP` in the name are refused: mockups are never print art.

**How `/fix` decides:**
1. Background: if it's a flat box behind a simple logo, use knockout. If it's a photo, use the AI cut-out.
2. Resolution: if it's under 150 DPI at the print size, rebuild a simple logo as a vector. Otherwise use the AI upscale.
3. Then trim, size to exactly the print width at 300 DPI, and make the edges hard for DTF.

It never redraws the customer's art. Every step taken is listed in `steps` for the staff screen.

## Run it on your PC
```bash
cd art-engine
python -m venv .venv && .venv\Scripts\activate        # Windows  (Mac/Linux: source .venv/bin/activate)
pip install -r requirements.txt
set ENGINE_KEY=pick-a-long-random-string               # Mac/Linux: export ENGINE_KEY=...
uvicorn main:app --port 8080
```
Open http://localhost:8080/docs to try every endpoint in the browser.

Tests: `pip install pytest httpx` then `python -m pytest -q` (4 tests).

## Put it online
Use any host that runs Docker: Railway, Render, Fly.io or Google Cloud Run. Plan on about 2 GB of RAM.
```bash
docker build -t mockup-pro-engine .
docker run -p 8080:8080 -e ENGINE_KEY=... mockup-pro-engine
```
Then in the Next.js app's environment: `ART_ENGINE_URL=https://your-engine-host` and `ART_ENGINE_KEY=...` (server-side only, never `NEXT_PUBLIC_`).

## Options
- `REMBG_MODEL=isnet-general-use` is the default and fits in about 2 GB. `birefnet-general-lite` gives better hair and glass edges and needs about 6 GB or more. Full `birefnet-general` needs 8 GB or more.
- AI upscale: uncomment the Real-ESRGAN lines in the `Dockerfile`. It's fastest with a GPU. On CPU expect about 30–90 s per image.
- `MAX_UPLOAD_MB` defaults to 40.

All parts are free and allow commercial use: rembg / ISNet / BiRefNet (MIT/Apache), vtracer (MIT), Real-ESRGAN (BSD-3), Pillow, numpy, FastAPI.
