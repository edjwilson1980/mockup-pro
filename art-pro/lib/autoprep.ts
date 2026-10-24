import { loadImage, preparePrint } from './image'

export type Background = 'transparent' | 'white' | 'black' | 'photo'

/** DPI stored in a PNG's pHYs chunk, if any. */
export async function pngDpi(file: File): Promise<number | null> {
  if (file.type !== 'image/png') return null
  const head = new Uint8Array(await file.slice(0, 65536).arrayBuffer())
  for (let i = 8; i + 12 <= head.length; ) {
    const view = new DataView(head.buffer, i)
    const len = view.getUint32(0)
    const type = String.fromCharCode(head[i + 4], head[i + 5], head[i + 6], head[i + 7])
    if (type === 'pHYs' && i + 17 <= head.length) return head[i + 16] === 1 ? Math.round(view.getUint32(8) * 0.0254) : null
    if (type === 'IDAT' || type === 'IEND') return null
    i += 12 + len
  }
  return null
}

/** Looks at the edges of the art to decide what background it has. */
export async function analyzeArt(url: string): Promise<{ w: number; h: number; bg: Background }> {
  const img = await loadImage(url)
  const w = img.naturalWidth, h = img.naturalHeight
  const s = 200
  const c = document.createElement('canvas')
  c.width = s
  c.height = s
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, s, s)
  const d = ctx.getImageData(0, 0, s, s).data
  let n = 0, clear = 0, white = 0, black = 0
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      if (x > 3 && x < s - 4 && y > 3 && y < s - 4) continue // border ring only
      const i = (y * s + x) * 4
      n++
      if (d[i + 3] < 200) clear++
      else if (d[i] > 232 && d[i + 1] > 232 && d[i + 2] > 232) white++
      else if (d[i] < 28 && d[i + 1] < 28 && d[i + 2] < 28) black++
    }
  }
  const bg: Background = clear / n > 0.5 ? 'transparent' : white / n > 0.8 ? 'white' : black / n > 0.8 ? 'black' : 'photo'
  return { w, h, bg }
}

export type Prepared = { url: string; blob: Blob; widthIn: number; heightIn: number; dpi: number }

/** Knock out (if asked), clean the alpha, size into the box at 300 DPI. */
export async function prepareDesign(src: string, srcW: number, boxW: number, boxH: number, knockout: 'none' | 'white' | 'black', cleanAlpha = true): Promise<Prepared> {
  const out = await preparePrint(src, { widthIn: boxW, heightIn: boxH, knockout, tolerance: 28, cleanAlpha })
  return { url: out.url, blob: out.blob, widthIn: out.widthIn, heightIn: out.heightIn, dpi: Math.round(srcW / out.widthIn) }
}
