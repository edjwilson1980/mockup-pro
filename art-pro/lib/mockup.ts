import type { Product } from './catalog'
import { loadImage } from './image'

const SIZE = 1200

// Flat-lay tee outline on a 1200 px square (same shape as the first Venom mockup).
const TEE: [number, number][] = [
  [452, 150], [515, 172], [600, 182], [685, 172], [748, 150],
  [880, 197], [1000, 280], [1060, 380], [965, 450], [885, 390],
  [877, 550], [880, 800], [887, 1060], [600, 1075], [313, 1060],
  [320, 800], [322, 550], [315, 390], [235, 450], [140, 380], [200, 280], [320, 197],
]
// Chest: body is ~560 px across = 20 in on an adult L.
const PX_PER_IN = 28
const COLLAR_BOTTOM = 235

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16)
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt * 255)))
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`
}

/** Renders a customer mockup. Apparel: art on the garment at true scale. Print: art on the sheet with trim. */
export async function drawMockup(
  canvas: HTMLCanvasElement,
  o: { product: Product; garmentHex: string; artSrc?: string; widthIn: number; heightIn: number },
) {
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#DCDCD8'
  ctx.fillRect(0, 0, SIZE, SIZE)
  const bg = ctx.createRadialGradient(600, 520, 100, 600, 600, 900)
  bg.addColorStop(0, 'rgba(255,255,255,0.35)')
  bg.addColorStop(1, 'rgba(0,0,0,0.12)')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, SIZE, SIZE)

  const art = o.artSrc ? await loadImage(o.artSrc) : null

  if (o.product.apparel) {
    const path = new Path2D()
    TEE.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y)))
    path.closePath()
    const neck = new Path2D()
    neck.ellipse(600, 172, 112, 63, 0, 0, Math.PI * 2)

    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.28)'
    ctx.shadowBlur = 30
    ctx.shadowOffsetY = 12
    ctx.fillStyle = o.garmentHex
    ctx.fill(path)
    ctx.restore()

    ctx.save()
    ctx.clip(path)
    const g = ctx.createLinearGradient(0, 150, 0, 1080)
    g.addColorStop(0, 'rgba(255,255,255,0.06)')
    g.addColorStop(0.5, 'rgba(0,0,0,0)')
    g.addColorStop(1, 'rgba(0,0,0,0.14)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, SIZE, SIZE)
    ctx.strokeStyle = 'rgba(0,0,0,0.10)'
    ctx.lineWidth = 6
    for (const [x1, y1, x2, y2] of [[360, 620, 520, 980], [840, 600, 720, 1000], [430, 300, 560, 520]]) {
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.quadraticCurveTo((x1 + x2) / 2 + 30, (y1 + y2) / 2, x2, y2)
      ctx.stroke()
    }
    if (o.product.id === 'hoodie') {
      ctx.fillStyle = shade(o.garmentHex, -0.05)
      ctx.beginPath()
      ctx.roundRect(440, 740, 320, 190, 30)
      ctx.fill()
      ctx.strokeStyle = shade(o.garmentHex, -0.12)
      ctx.lineWidth = 4
      ctx.stroke()
    }
    ctx.restore()

    // Collar rib + neck opening
    ctx.fillStyle = shade(o.garmentHex, -0.06)
    ctx.beginPath()
    ctx.ellipse(600, 175, 128, 76, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = shade(o.garmentHex, -0.18)
    ctx.fill(neck)

    if (art) {
      const s = Math.min((o.widthIn * PX_PER_IN) / art.width, (o.heightIn * PX_PER_IN) / art.height)
      const w = art.width * s
      const h = art.height * s
      const y = COLLAR_BOTTOM + 3 * PX_PER_IN
      ctx.save()
      ctx.clip(path)
      ctx.globalAlpha = 0.97
      ctx.drawImage(art, 600 - w / 2, y, w, h)
      ctx.restore()
    }
    return canvas
  }

  // Print products: the piece on a table, with its trim line.
  const max = 880
  const s = Math.min(max / o.widthIn, max / o.heightIn)
  const w = o.widthIn * s
  const h = o.heightIn * s
  const x = (SIZE - w) / 2
  const y = (SIZE - h) / 2
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.25)'
  ctx.shadowBlur = 28
  ctx.shadowOffsetY = 10
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(x, y, w, h)
  ctx.restore()
  if (art) {
    const a = Math.min((w * 0.9) / art.width, (h * 0.9) / art.height)
    ctx.drawImage(art, x + (w - art.width * a) / 2, y + (h - art.height * a) / 2, art.width * a, art.height * a)
  }
  if (o.product.bleed) {
    ctx.setLineDash([10, 8])
    ctx.strokeStyle = '#E04B55'
    ctx.lineWidth = 2
    const b = 0.125 * s
    ctx.strokeRect(x + b, y + b, w - 2 * b, h - 2 * b)
    ctx.setLineDash([])
  }
  return canvas
}
