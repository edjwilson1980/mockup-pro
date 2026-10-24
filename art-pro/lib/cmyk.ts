/**
 * CMYK color for every print file: sRGB art → GRACoL 2013 (CRPC6) CMYK through LittleCMS,
 * relative colorimetric with black point compensation (Photoshop's "Convert to Profile" default).
 * Also gives an on-screen soft proof (sRGB → CMYK → sRGB) so previews show CMYK color.
 */
import { at } from './base'

export const CMYK_PROFILE_NAME = 'GRACoL 2013 (CRPC6)'
export const CMYK_PROFILE_URL = at('/icc/GRACoL2013_CRPC6.icc')

type Lcms = {
  cmsOpenProfileFromMem: (b: Uint8Array, n: number) => number
  cmsCreate_sRGBProfile: () => number
  cmsCreateTransform: (a: number, af: number, b: number, bf: number, intent: number, flags: number) => number
  cmsDoTransform: (t: number, input: Uint8Array, count: number) => Uint8Array
}
type Engine = { icc: Uint8Array; toCmyk: number; toRgb: number; lcms: Lcms }

let engine: Promise<Engine> | null = null

/** Loads LittleCMS and the GRACoL profile once per page. */
export function cmykEngine(): Promise<Engine> {
  if (!engine) {
    engine = (async () => {
      // Loaded straight from /public (the engine's own loader can't go through the bundler).
      const mod = (await import(/* webpackIgnore: true */ at('/lcms.mjs'))) as typeof import('lcms-wasm')
      const lcms = (await mod.instantiate({ locateFile: () => at('/lcms.wasm') })) as unknown as Lcms
      const r = await fetch(CMYK_PROFILE_URL)
      if (!r.ok) throw new Error('Could not load the GRACoL 2013 color profile')
      const icc = new Uint8Array(await r.arrayBuffer())
      const cmyk = lcms.cmsOpenProfileFromMem(icc, icc.byteLength)
      if (!cmyk) throw new Error('The GRACoL 2013 profile could not be read')
      const srgb = lcms.cmsCreate_sRGBProfile()
      const flags = mod.cmsFLAGS_BLACKPOINTCOMPENSATION | mod.cmsFLAGS_HIGHRESPRECALC
      const toCmyk = lcms.cmsCreateTransform(srgb, mod.TYPE_RGB_8, cmyk, mod.TYPE_CMYK_8, mod.INTENT_RELATIVE_COLORIMETRIC, flags)
      const toRgb = lcms.cmsCreateTransform(cmyk, mod.TYPE_CMYK_8, srgb, mod.TYPE_RGB_8, mod.INTENT_RELATIVE_COLORIMETRIC, flags)
      if (!toCmyk || !toRgb) throw new Error('Could not set up the CMYK conversion')
      return { icc, toCmyk, toRgb, lcms }
    })()
    engine.catch(() => { engine = null })
  }
  return engine
}

const CHUNK = 1 << 20 // pixels per engine call

/** Runs only the visible pixels through a transform; returns `outCh` bytes per visible pixel. */
function convertVisible(e: Engine, t: number, src: Uint8Array, inCh: number, idx: Uint32Array, n: number, outCh: number) {
  const out = new Uint8Array(n * outCh)
  for (let s = 0; s < n; s += CHUNK) {
    const m = Math.min(CHUNK, n - s)
    const buf = new Uint8Array(m * inCh)
    for (let i = 0; i < m; i++) {
      const p = idx[s + i]
      for (let c = 0; c < inCh; c++) buf[i * inCh + c] = src[p * (inCh === 3 ? 4 : inCh) + c]
    }
    out.set(e.lcms.cmsDoTransform(t, buf, m), s * outCh)
  }
  return out
}

/**
 * RGBA (canvas order, straight alpha) → CMYK(A) bytes.
 * Clear pixels become 0/0/0/0. With `alpha` false the result has 4 channels (alpha dropped).
 */
export async function rgbaToCmyk(rgba: Uint8ClampedArray | Uint8Array, alpha: boolean): Promise<Uint8Array> {
  const e = await cmykEngine()
  const px = rgba.length / 4
  const src = rgba instanceof Uint8Array ? rgba : new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength)
  const idx = new Uint32Array(px)
  let n = 0
  for (let i = 0; i < px; i++) if (src[i * 4 + 3] !== 0) idx[n++] = i
  const cmyk = convertVisible(e, e.toCmyk, src, 3, idx, n, 4)
  const ch = alpha ? 5 : 4
  const out = new Uint8Array(px * ch)
  for (let j = 0; j < n; j++) {
    const p = idx[j]
    out.set(cmyk.subarray(j * 4, j * 4 + 4), p * ch)
    if (alpha) out[p * ch + 4] = src[p * 4 + 3]
  }
  return out
}

/** Soft proof in place: shows on screen what the art looks like once printed in GRACoL CMYK. */
export async function softProofData(rgba: Uint8ClampedArray) {
  const e = await cmykEngine()
  const src = new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength)
  const px = rgba.length / 4
  const idx = new Uint32Array(px)
  let n = 0
  for (let i = 0; i < px; i++) if (src[i * 4 + 3] !== 0) idx[n++] = i
  const cmyk = convertVisible(e, e.toCmyk, src, 3, idx, n, 4)
  const back = e.lcms.cmsDoTransform(e.toRgb, cmyk, n)
  for (let j = 0; j < n; j++) {
    const p = idx[j] * 4
    src[p] = back[j * 3]
    src[p + 1] = back[j * 3 + 1]
    src[p + 2] = back[j * 3 + 2]
  }
}

/** Soft-proofs a whole canvas in place (falls back silently if the engine can't load). */
export async function softProofCanvas(c: HTMLCanvasElement) {
  try {
    const ctx = c.getContext('2d', { willReadFrequently: true })!
    const d = ctx.getImageData(0, 0, c.width, c.height)
    await softProofData(d.data)
    ctx.putImageData(d, 0, 0)
  } catch {}
}

const proofed = new Map<string, Promise<string>>()
/** Soft-proofed copy of an image URL (cached). */
export function softProofUrl(url: string): Promise<string> {
  let p = proofed.get(url)
  if (!p) {
    p = (async () => {
      const img = new Image()
      img.src = url
      await img.decode()
      const c = document.createElement('canvas')
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      c.getContext('2d')!.drawImage(img, 0, 0)
      await softProofCanvas(c)
      return await new Promise<string>((ok) => c.toBlob((b) => ok(b ? URL.createObjectURL(b) : url), 'image/png'))
    })().catch(() => url)
    proofed.set(url, p)
  }
  return p
}
