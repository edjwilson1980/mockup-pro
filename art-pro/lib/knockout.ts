/**
 * Background removal, done right for print:
 *  white / black       — flood fill from the edges: only background connected to the border goes.
 *                        White text or black outlines inside the design stay.
 *  white-all / black-all — every pixel of that color goes (letter holes too).
 * Works in place on ImageData. Soft edge pixels next to removed areas get a matching partial alpha.
 */
export type Knockout = 'none' | 'white' | 'black' | 'white-all' | 'black-all'

export function knockout(img: ImageData, mode: Knockout, tolerance = 40) {
  if (mode === 'none') return
  const { width: w, height: h, data: d } = img
  const white = mode.startsWith('white')
  const dist = (i: number) => (white ? 255 - Math.min(d[i], d[i + 1], d[i + 2]) : Math.max(d[i], d[i + 1], d[i + 2]))
  if (mode === 'white-all' || mode === 'black-all') {
    for (let i = 0; i < d.length; i += 4) {
      const k = dist(i)
      if (k <= tolerance) d[i + 3] = 0
      else if (k <= tolerance * 2) d[i + 3] = Math.min(d[i + 3], Math.round(((k - tolerance) / tolerance) * 255))
    }
    return
  }
  const seen = new Uint8Array(w * h)
  const stack = new Int32Array(w * h)
  let sp = 0
  const push = (p: number) => {
    if (seen[p]) return
    const i = p * 4
    if (d[i + 3] < 20 || dist(i) <= tolerance) {
      seen[p] = 1
      stack[sp++] = p
    }
  }
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x) }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1) }
  while (sp) {
    const p = stack[--sp]
    d[p * 4 + 3] = 0
    const x = p % w
    if (x > 0) push(p - 1)
    if (x < w - 1) push(p + 1)
    if (p >= w) push(p - w)
    if (p < w * (h - 1)) push(p + w)
  }
  // Soften the fringe: border pixels that are close to the background color fade out.
  for (let p = 0; p < w * h; p++) {
    if (seen[p]) continue
    const x = p % w
    const nearBg = (x > 0 && seen[p - 1]) || (x < w - 1 && seen[p + 1]) || (p >= w && seen[p - w]) || (p < w * (h - 1) && seen[p + w])
    if (!nearBg) continue
    const i = p * 4
    const k = dist(i)
    if (k < tolerance * 2.5) d[i + 3] = Math.min(d[i + 3], Math.round(Math.max(0, (k - tolerance) / (tolerance * 1.5)) * 255))
  }
}
