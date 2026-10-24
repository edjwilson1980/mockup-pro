"""Run:  python -m pytest -q   (from the art-engine folder)"""
import io
import os

import numpy as np
from PIL import Image

import engine

HERE = os.path.dirname(__file__)
SAMPLE = open(os.path.join(HERE, "samples", "blurry_logo_on_white.jpg"), "rb").read()


def rgba(png: bytes) -> np.ndarray:
    return np.asarray(Image.open(io.BytesIO(png)).convert("RGBA"))


def test_check_flags_low_res_and_white_box():
    c = engine.check_art(SAMPLE, 10.5)
    assert c.quality == "too-low"
    assert c.solid_background == "#FFFFFF"
    assert c.looks_like_simple_logo


def test_knockout_keeps_white_inside_the_logo():
    out = rgba(engine.knockout_background(SAMPLE, "#FFFFFF"))
    h, w = out.shape[:2]
    assert out[0, 0, 3] == 0                  # corner (background) removed
    assert out[h // 2, w // 2, 3] == 255      # white inside the circle kept


def test_fix_gives_exact_print_size_and_hard_edges():
    r = engine.fix_art(SAMPLE, 10.5)
    im = Image.open(io.BytesIO(r.png))
    assert im.size[0] == round(10.5 * 300)
    assert round(im.info["dpi"][0]) == 300
    a = np.asarray(im.getchannel("A"))
    assert int(((a > 0) & (a < 255)).sum()) == 0   # no half-transparent pixels for DTF
    assert r.after["quality"] == "good"


def test_mockup_is_never_print_art():
    from fastapi.testclient import TestClient
    os.environ["ENGINE_KEY"] = "k"
    import importlib, main
    importlib.reload(main)
    client = TestClient(main.app)
    res = client.post("/check", headers={"X-Engine-Key": "k"},
                      files={"file": ("order_shirt1_front_MOCKUP.png", SAMPLE, "image/png")})
    assert res.status_code == 422
    assert client.post("/check", files={"file": ("a.jpg", SAMPLE, "image/jpeg")}).status_code == 401
