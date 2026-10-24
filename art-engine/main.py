"""
Mockup Pro art engine — web API.

Run locally:   uvicorn main:app --port 8080
Every request needs the header  X-Engine-Key: <ENGINE_KEY>  (set ENGINE_KEY in the server env).

Endpoints (all take a multipart file upload named "file"):
  POST /check              -> JSON quality report            (?print_width_in=10.5)
  POST /remove-background  -> PNG, transparent  (AI cut-out, for photos)
  POST /knockout           -> PNG, transparent  (flat background box, for logos; ?color=#FFFFFF&inside_too=false)
  POST /vectorize          -> SVG
  POST /upscale            -> PNG, 4x  (needs Real-ESRGAN binary)
  POST /dtf-cleanup        -> PNG, no half-transparent pixels, 300 DPI
  POST /fix                -> JSON {png_base64, svg, steps, notes, before, after}  (?print_width_in=10.5)
  GET  /health
"""
from __future__ import annotations

import base64
import hmac
import os

from fastapi import Depends, FastAPI, File, Header, HTTPException, Query, UploadFile
from fastapi.responses import JSONResponse, Response

import engine

MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "40"))
ENGINE_KEY = os.environ.get("ENGINE_KEY", "")

app = FastAPI(title="Mockup Pro art engine", version="1.0.0")


def require_key(x_engine_key: str = Header(default="")):
    if not ENGINE_KEY:
        raise HTTPException(500, "ENGINE_KEY is not set on the server.")
    if not hmac.compare_digest(x_engine_key, ENGINE_KEY):
        raise HTTPException(401, "Wrong or missing X-Engine-Key.")


async def read_upload(file: UploadFile) -> bytes:
    data = await file.read()
    if not data:
        raise HTTPException(400, "The file is empty.")
    if len(data) > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(413, f"File is over {MAX_UPLOAD_MB} MB.")
    if (file.filename or "").lower().find("_mockup") >= 0:
        raise HTTPException(422, "This is a mockup picture, not print art. Upload the original artwork file instead.")
    try:
        engine.open_image(data)
    except Exception:
        raise HTTPException(415, "That file isn't an image we can read. Send PNG, JPG, WEBP or TIFF.")
    return data


def png(data: bytes) -> Response:
    return Response(data, media_type="image/png")


@app.get("/health")
def health():
    return {"ok": True, "rembg_model": engine.REMBG_MODEL, "upscaler": bool(engine.shutil.which(engine.REALESRGAN_BIN))}


@app.post("/check", dependencies=[Depends(require_key)])
async def check(file: UploadFile = File(...), print_width_in: float | None = Query(default=None, gt=0, le=22.3)):
    return engine.check_art(await read_upload(file), print_width_in).as_dict()


@app.post("/remove-background", dependencies=[Depends(require_key)])
async def remove_background(file: UploadFile = File(...)):
    return png(engine.remove_background(await read_upload(file)))


@app.post("/knockout", dependencies=[Depends(require_key)])
async def knockout(file: UploadFile = File(...), color: str | None = Query(default=None, pattern=r"^#?[0-9A-Fa-f]{6}$"),
                   tolerance: int = Query(default=60, ge=5, le=160), inside_too: bool = False):
    return png(engine.knockout_background(await read_upload(file), color, tolerance, inside_too))


@app.post("/vectorize", dependencies=[Depends(require_key)])
async def vectorize(file: UploadFile = File(...)):
    return Response(engine.vectorize(await read_upload(file)), media_type="image/svg+xml")


@app.post("/upscale", dependencies=[Depends(require_key)])
async def upscale(file: UploadFile = File(...)):
    try:
        return png(engine.upscale(await read_upload(file)))
    except RuntimeError as e:
        raise HTTPException(501, str(e))


@app.post("/dtf-cleanup", dependencies=[Depends(require_key)])
async def dtf_cleanup(file: UploadFile = File(...), choke_px: int = Query(default=0, ge=0, le=6)):
    return png(engine.dtf_cleanup(await read_upload(file), choke_px=choke_px))


@app.post("/fix", dependencies=[Depends(require_key)])
async def fix(file: UploadFile = File(...), print_width_in: float = Query(..., gt=0, le=22.3)):
    r = engine.fix_art(await read_upload(file), print_width_in)
    return JSONResponse({
        "png_base64": base64.b64encode(r.png).decode(),
        "svg": r.svg,
        "steps": r.steps,
        "notes": r.notes,
        "before": r.before,
        "after": r.after,
    })
