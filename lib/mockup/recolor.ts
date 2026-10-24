/**
 * Mockup Pro — shirt recolor.
 *
 * One master white shirt photo is turned into a "fold map": a PNG whose alpha is the
 * shirt shape and whose gray value stores how much lighter/darker each pixel is than
 * the cloth (CIELAB lightness offset). fold = (gray - 200) / 5.
 *
 * To recolor: take the Gildan hex, convert to CIELAB, add the fold offset (boosted for
 * mid tones because the white master's folds are compressed), keep a/b, convert back.
 *
 * Pure functions only — no DOM — so they run in the browser, in a Web Worker or in Node.
 * Matches the Python reference used to build and check the master (Black/Red/Royal/Sand
 * were compared against real Gildan photos).
 */

export type Raster = { width: number; height: number; data: Uint8ClampedArray }

export type FoldMap = {
  width: number
  height: number
  /** CIELAB L offset per pixel (negative = fold/shadow). */
  fold: Float32Array
  /** 0–255 shirt coverage. */
  alpha: Uint8ClampedArray
}

const XN = 0.95047
const YN = 1
const ZN = 1.08883

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)
const fwd = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
const inv = (t: number) => {
  const t3 = t * t * t
  return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787
}

export function parseHex(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) throw new Error(`Not a hex color: ${hex}`)
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const R = toLinear(r / 255)
  const G = toLinear(g / 255)
  const B = toLinear(b / 255)
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / XN
  const Y = (0.2126729 * R + 0.7151522 * G + 0.072175 * B) / YN
  const Z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / ZN
  const fy = fwd(Y)
  return [116 * fy - 16, 500 * (fwd(X) - fy), 200 * (fy - fwd(Z))]
}

export function labToRgb(L: number, A: number, B: number): [number, number, number] {
  const fy = (L + 16) / 116
  const X = inv(fy + A / 500) * XN
  const Y = (L > 8 ? fy * fy * fy : L / 903.3) * YN
  const Z = inv(fy - B / 200) * ZN
  const r = toGamma(3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z)
  const g = toGamma(-0.969266 * X + 1.8760108 * Y + 0.041556 * Z)
  const b = toGamma(0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z)
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)))
  return [clamp(r), clamp(g), clamp(b)]
}

/** How strongly folds show for a target lightness (white master folds are compressed). */
export function foldStrength(L: number): number {
  const xs = [0, 15, 30, 85, 100]
  const ys = [1.0, 1.15, 1.6, 1.5, 0.9]
  if (L <= xs[0]) return ys[0]
  for (let i = 1; i < xs.length; i++) {
    if (L <= xs[i]) {
      const t = (L - xs[i - 1]) / (xs[i] - xs[i - 1])
      return ys[i - 1] + t * (ys[i] - ys[i - 1])
    }
  }
  return ys[ys.length - 1]
}

/** Decode a fold-map PNG (already read into RGBA pixels). */
export function decodeFoldMap(png: Raster): FoldMap {
  const n = png.width * png.height
  const fold = new Float32Array(n)
  const alpha = new Uint8ClampedArray(n)
  for (let i = 0; i < n; i++) {
    fold[i] = (png.data[i * 4] - 200) / 5
    alpha[i] = png.data[i * 4 + 3]
  }
  return { width: png.width, height: png.height, fold, alpha }
}

/** The blank shirt in any color. Transparent outside the shirt. */
export function recolorShirt(map: FoldMap, hex: string): Raster {
  const [r, g, b] = parseHex(hex)
  const [Lt, A, B] = rgbToLab(r, g, b)
  const s = foldStrength(Lt)
  const out = new Uint8ClampedArray(map.width * map.height * 4)
  for (let i = 0, n = map.width * map.height; i < n; i++) {
    const a = map.alpha[i]
    if (a === 0) continue
    let L = Lt + map.fold[i] * s
    if (L < 0) L = 0
    else if (L > 100) L = 100
    const [R, G, Bl] = labToRgb(L, A, B)
    const p = i * 4
    out[p] = R
    out[p + 1] = G
    out[p + 2] = Bl
    out[p + 3] = a
  }
  return { width: map.width, height: map.height, data: out }
}

/**
 * Fabric shading for prints: 1 = flat cloth, <1 = inside a fold. Multiplying the print
 * by this makes the art sit in the shirt's folds instead of floating on top.
 */
export function fabricShade(map: FoldMap): Float32Array {
  const [Lw, Aw, Bw] = rgbToLab(255, 255, 255)
  const s = foldStrength(Lw)
  const shade = new Float32Array(map.width * map.height)
  for (let i = 0; i < shade.length; i++) {
    let L = Lw + map.fold[i] * s
    if (L < 0) L = 0
    else if (L > 100) L = 100
    shade[i] = labToRgb(L, Aw, Bw)[0] / 255
  }
  return shade
}
