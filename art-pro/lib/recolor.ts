import { loadImage } from './image'

// sRGB <-> CIELAB (D65), per Ed's Mockup Pro kit README.
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
const gam = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)
const Xn = 0.95047, Yn = 1, Zn = 1.08883
const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116)
const fi = (t: number) => (t * t * t > 216 / 24389 ? t * t * t : (116 * t - 16) / (24389 / 27))

export function hexToLab(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  const r = lin(((n >> 16) & 255) / 255), g = lin(((n >> 8) & 255) / 255), b = lin((n & 255) / 255)
  const X = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b
  const Y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b
  const Z = 0.0193339 * r + 0.119192 * g + 0.9503041 * b
  const fx = f(X / Xn), fy = f(Y / Yn), fz = f(Z / Zn)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

function labToRgb(L: number, a: number, b: number): [number, number, number] {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200
  const X = Xn * fi(fx), Y = Yn * fi(fy), Z = Zn * fi(fz)
  const r = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z
  const g = -0.969266 * X + 1.8760108 * Y + 0.041556 * Z
  const bb = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(gam(Math.max(0, Math.min(1, v))) * 255)))
  return [c(r), c(g), c(bb)]
}

function strength(L: number) {
  const xs = [0, 15, 30, 85, 100], ys = [1.0, 1.15, 1.6, 1.5, 0.9]
  for (let i = 0; i < xs.length - 1; i++) if (L <= xs[i + 1]) return ys[i] + ((L - xs[i]) / (xs[i + 1] - xs[i])) * (ys[i + 1] - ys[i])
  return ys[ys.length - 1]
}

const cache = new Map<string, { garment: HTMLCanvasElement; shade: HTMLCanvasElement }>()

/**
 * Garment in any Gildan color, plus a shade layer (black with alpha from the
 * folds) used to press the print into the fabric.
 */
export async function recolorGarment(src: string, hex: string) {
  const key = src + hex
  const hit = cache.get(key)
  if (hit) return hit
  const img = await loadImage(src)
  const w = img.naturalWidth, h = img.naturalHeight
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0)
  const data = ctx.getImageData(0, 0, w, h)
  const d = data.data
  const [Lt, at, bt] = hexToLab(hex)
  const k = strength(Lt)
  const lut: [number, number, number][] = []
  for (let g = 0; g < 256; g++) lut.push(labToRgb(Math.max(0, Math.min(100, Lt + ((g - 200) / 5) * k)), at, bt))
  const shade = document.createElement('canvas')
  shade.width = w
  shade.height = h
  const sctx = shade.getContext('2d')!
  const sdata = sctx.createImageData(w, h)
  const s = sdata.data
  for (let i = 0; i < d.length; i += 4) {
    const g = d[i]
    const [r, gg, b] = lut[g]
    const fold = (g - 200) / 5
    d[i] = r
    d[i + 1] = gg
    d[i + 2] = b
    s[i + 3] = d[i + 3] > 0 ? Math.max(0, Math.min(150, -fold * 9)) : 0
  }
  ctx.putImageData(data, 0, 0)
  sctx.putImageData(sdata, 0, 0)
  const out = { garment: c, shade }
  cache.set(key, out)
  return out
}
