"""
Mockup Pro art engine — the image steps, with no web server in the way.

Every function takes PNG/JPG bytes and returns bytes or plain data, so they are easy to
test and to call from the API in main.py.

Free, open-source pieces (all OK for commercial use):
  * rembg + isnet-general-use / BiRefNet  (MIT)   background removal
  * vtracer                                (MIT)   raster logo -> SVG vector
  * Real-ESRGAN (ncnn-vulkan binary)       (BSD-3) AI upscale, optional
  * Pillow / numpy                                 checks and DTF clean-up
"""
from __future__ import annotations

import io
import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, field, asdict

import numpy as np
from PIL import Image

PRINT_DPI = 300
BLOCK_BELOW_DPI = 100   # same rules as the gang sheet builder
WARN_BELOW_DPI = 150

# isnet-general-use fits on a small server (~2 GB RAM). Set REMBG_MODEL=birefnet-general-lite
# (or birefnet-general on 8+ GB) for the best edges on hair, glass and fine detail.
REMBG_MODEL = os.environ.get("REMBG_MODEL", "isnet-general-use")
REALESRGAN_BIN = os.environ.get("REALESRGAN_BIN", "realesrgan-ncnn-vulkan")

_session = None


def _rembg_session():
    global _session
    if _session is None:
        from rembg import new_session
        _session = new_session(REMBG_MODEL)
    return _session


def open_image(data: bytes) -> Image.Image:
    im = Image.open(io.BytesIO(data))
    im.load()
    if im.mode not in ("RGB", "RGBA"):
        im = im.convert("RGBA")
    return im


def to_png(im: Image.Image, dpi: int = PRINT_DPI) -> bytes:
    buf = io.BytesIO()
    im.save(buf, "PNG", dpi=(dpi, dpi), optimize=True)
    return buf.getvalue()


# ---------------------------------------------------------------- checks

def _dominant_colors(rgba: np.ndarray) -> tuple[int, bool]:
    """
    Count the colors that really make up the art (ignoring JPEG noise and blur edges).
    A logo is "simple" when a handful of flat colors cover almost all of it — those
    can be rebuilt as vectors safely. Photos and gradients can't.
    """
    px = rgba[rgba[..., 3] > 200][:, :3]
    if len(px) == 0:
        return 0, False
    if len(px) > 200_000:
        px = px[np.random.default_rng(0).choice(len(px), 200_000, replace=False)]
    bins = (px // 32).astype(np.int32)
    keys = bins[:, 0] * 64 + bins[:, 1] * 8 + bins[:, 2]
    counts = np.bincount(keys, minlength=512) / len(keys)
    major = np.sort(counts[counts > 0.01])[::-1]
    return int(len(major)), bool(len(major) <= 10 and major.sum() > 0.85)


@dataclass
class ArtCheck:
    width_px: int
    height_px: int
    has_transparency: bool
    solid_background: str | None          # "#FFFFFF" when the edges are one flat color
    print_width_in: float | None
    dpi_at_print_size: float | None
    quality: str                          # "good" | "soft" | "too-low" | "unknown"
    looks_like_simple_logo: bool          # few colors, flat fills -> vectorize is safe
    color_count: int
    notes: list[str] = field(default_factory=list)

    def as_dict(self):
        return asdict(self)


def check_art(data: bytes, print_width_in: float | None = None) -> ArtCheck:
    im = open_image(data)
    rgba = np.asarray(im.convert("RGBA"))
    h, w = rgba.shape[:2]
    alpha = rgba[..., 3]
    has_alpha = bool((alpha < 250).mean() > 0.01)

    edge = np.concatenate([rgba[0], rgba[-1], rgba[:, 0], rgba[:, -1]])
    edge_rgb = edge[edge[:, 3] > 200][:, :3].astype(int)
    solid = None
    if len(edge_rgb) and not has_alpha:
        med = np.median(edge_rgb, axis=0)
        if (np.abs(edge_rgb - med).max(axis=1) < 24).mean() > 0.9:
            solid = "#{:02X}{:02X}{:02X}".format(*med.astype(int))

    colors, simple = _dominant_colors(rgba)

    dpi = None
    quality = "unknown"
    notes: list[str] = []
    if print_width_in:
        dpi = w / print_width_in
        quality = "good" if dpi >= WARN_BELOW_DPI else "soft" if dpi >= BLOCK_BELOW_DPI else "too-low"
        if quality != "good":
            notes.append(f"Only {dpi:.0f} DPI at {print_width_in:g} in wide.")
    if solid:
        notes.append(f"Has a solid {solid} background box.")
    return ArtCheck(w, h, has_alpha, solid, print_width_in, dpi, quality, simple, colors, notes)


# ---------------------------------------------------------------- steps

def knockout_background(data: bytes, color: str | None = None, tolerance: int = 60,
                        inside_too: bool = False) -> bytes:
    """
    Remove a flat background box (white, black, any solid color). Starts at the edges and
    only removes background that touches them, so white INSIDE a logo stays white —
    unless inside_too=True ("remove every bit of this color").
    Use this for logos. Use remove_background() for photos.
    """
    from collections import deque
    im = open_image(data).convert("RGBA")
    rgba = np.asarray(im).copy()
    h, w = rgba.shape[:2]
    if color is None:
        edge = np.concatenate([rgba[0], rgba[-1], rgba[:, 0], rgba[:, -1]])[:, :3]
        bg = np.median(edge, axis=0)
    else:
        bg = np.array([int(color.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4)], float)
    dist = np.sqrt(((rgba[..., :3].astype(float) - bg) ** 2).sum(-1))
    near = dist <= tolerance
    if inside_too:
        hit = near
    else:
        hit = np.zeros((h, w), bool)
        q = deque()
        for x in range(w):
            for y in (0, h - 1):
                if near[y, x] and not hit[y, x]:
                    hit[y, x] = True; q.append((y, x))
        for y in range(h):
            for x in (0, w - 1):
                if near[y, x] and not hit[y, x]:
                    hit[y, x] = True; q.append((y, x))
        while q:
            y, x = q.popleft()
            for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= ny < h and 0 <= nx < w and near[ny, nx] and not hit[ny, nx]:
                    hit[ny, nx] = True; q.append((ny, nx))
    # soft edge: pixels just outside the tolerance fade instead of leaving a white halo
    soft = np.clip((dist - tolerance) / max(1, tolerance * 0.75), 0, 1)
    touching = hit.copy()                      # pixels within 2 px of removed background
    for _ in range(2):
        grown = touching.copy()
        grown[1:] |= touching[:-1]; grown[:-1] |= touching[1:]
        grown[:, 1:] |= touching[:, :-1]; grown[:, :-1] |= touching[:, 1:]
        touching = grown
    edge_zone = ~hit & touching & (dist < tolerance * 1.75)
    alpha = rgba[..., 3].astype(float)
    alpha[hit] = 0
    alpha[edge_zone] *= soft[edge_zone]
    rgba[..., 3] = alpha.astype(np.uint8)
    out = Image.fromarray(rgba, "RGBA")
    bbox = out.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    return to_png(out.crop(bbox) if bbox else out)


def remove_background(data: bytes) -> bytes:
    """AI cut-out for photos and busy backgrounds. For flat logos use knockout_background()."""
    from rembg import remove
    im = open_image(data).convert("RGB")
    mask = remove(im, session=_rembg_session(), only_mask=True)
    out = im.convert("RGBA")
    out.putalpha(mask)
    bbox = out.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    return to_png(out.crop(bbox) if bbox else out)


def vectorize(data: bytes) -> str:
    """Turn a flat logo into SVG paths so it prints sharp at any size."""
    import vtracer
    im = open_image(data).convert("RGBA")
    pixels = list(im.getdata())
    return vtracer.convert_pixels_to_svg(
        pixels, size=im.size, colormode="color", hierarchical="stacked", mode="spline",
        filter_speckle=4, color_precision=6, layer_difference=16, corner_threshold=60,
        length_threshold=4.0, splice_threshold=45, path_precision=3,
    )


def rasterize_svg(svg: str, width_px: int) -> bytes:
    """SVG -> transparent PNG at the exact pixel width the gang sheet needs."""
    import cairosvg  # optional dependency, see requirements.txt
    return cairosvg.svg2png(bytestring=svg.encode(), output_width=width_px, dpi=PRINT_DPI)


def upscale(data: bytes, scale: int = 4) -> bytes:
    """AI upscale with Real-ESRGAN. Needs the realesrgan-ncnn-vulkan binary (GPU or CPU)."""
    exe = shutil.which(REALESRGAN_BIN)
    if not exe:
        raise RuntimeError("Real-ESRGAN is not installed on this server. See art-engine/README.md.")
    im = open_image(data)
    alpha = im.getchannel("A") if im.mode == "RGBA" else None
    with tempfile.TemporaryDirectory() as tmp:
        src, dst = os.path.join(tmp, "in.png"), os.path.join(tmp, "out.png")
        im.convert("RGB").save(src)
        subprocess.run([exe, "-i", src, "-o", dst, "-s", str(scale), "-n", "realesrgan-x4plus"],
                       check=True, capture_output=True, timeout=600)
        big = Image.open(dst).convert("RGBA")
    if alpha is not None:
        big.putalpha(alpha.resize(big.size, Image.LANCZOS))
    return to_png(big)


def dtf_cleanup(data: bytes, alpha_cutoff: int = 128, choke_px: int = 0, trim: bool = True) -> bytes:
    """
    Make the PNG safe to print as DTF:
      * no half-transparent pixels (they print as a faint haze and weak glue)
      * optional choke to pull the white underbase in a hair
      * trimmed to the art, 300 DPI tag
    """
    im = open_image(data).convert("RGBA")
    a = np.asarray(im.getchannel("A"))
    hard = np.where(a >= alpha_cutoff, 255, 0).astype(np.uint8)
    mask = Image.fromarray(hard)
    if choke_px > 0:
        from PIL import ImageFilter
        mask = mask.filter(ImageFilter.MinFilter(choke_px * 2 + 1))
    im.putalpha(mask)
    bbox = mask.getbbox() if trim else None
    return to_png(im.crop(bbox) if bbox else im)


def set_print_width(data: bytes, width_in: float) -> bytes:
    """Resize so the art is exactly width_in at 300 DPI (keeps proportions)."""
    im = open_image(data).convert("RGBA")
    w = max(1, round(width_in * PRINT_DPI))
    h = max(1, round(im.height * w / im.width))
    return to_png(im.resize((w, h), Image.LANCZOS))


# ---------------------------------------------------------------- the whole job

@dataclass
class FixResult:
    png: bytes
    svg: str | None
    steps: list[str]
    notes: list[str]
    before: dict
    after: dict


def fix_art(data: bytes, print_width_in: float, allow_upscale: bool = True,
            prefer_vector: bool = True) -> FixResult:
    """
    The default plan the AI "foreman" starts from. It only ever runs deterministic tools;
    it never redraws the customer's art. Steps taken are listed for the staff screen.
    """
    steps: list[str] = []
    notes: list[str] = []
    before = check_art(data, print_width_in)
    work = data

    if not before.has_transparency:
        if before.solid_background and before.looks_like_simple_logo:
            work = knockout_background(work, before.solid_background)
            steps.append(f"Removed the {before.solid_background} background box (white inside the logo kept)")
        else:
            work = remove_background(work)
            steps.append("Removed background (AI cut-out)")

    svg = None
    target_px = round(print_width_in * PRINT_DPI)
    current = check_art(work, print_width_in)
    if current.quality != "good":
        if prefer_vector and (before.looks_like_simple_logo or current.looks_like_simple_logo):
            svg = vectorize(work)
            try:
                work = rasterize_svg(svg, target_px)
                steps.append("Rebuilt as sharp vector art")
            except Exception:
                notes.append("Vector made, but the PNG step needs cairosvg on the server.")
        elif allow_upscale:
            try:
                work = upscale(work, 4)
                steps.append("AI upscaled 4x")
            except Exception as e:
                notes.append(f"Upscale skipped: {e}")

    work = dtf_cleanup(work)                       # trim to the art first
    work = set_print_width(work, print_width_in)   # then exact width at 300 DPI
    work = dtf_cleanup(work, trim=False)           # resizing softens edges; make them hard again
    steps.append(f"Sized to {print_width_in:g} in at {PRINT_DPI} DPI, edges cleaned for DTF")

    after = check_art(work, print_width_in)
    rgba = np.asarray(open_image(work).convert("RGBA"))
    solid = rgba[rgba[..., 3] > 0][:, :3]
    if len(solid) and (solid.mean(axis=1) < 60).mean() > 0.3:
        notes.append("A lot of this art is very dark. It may disappear on black or navy shirts. Check before approving.")
    notes += [f"Original file: {n}" for n in before.notes]
    return FixResult(work, svg, steps, notes, before.as_dict(), after.as_dict())
