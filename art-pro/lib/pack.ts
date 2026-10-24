import { MAX_SHEET_LENGTH_IN, SHEET_WIDTH_IN } from './sheet-size'
import { CUT_ART_START_IN, CUT_GUTTER_IN, MARK_CLEARANCE_IN, MARK_SECTION_IN } from './cut-layout'

export type GangItem = {
  id: string
  label: string
  src: string // object URL or data URL of the print-ready PNG
  widthIn: number
  heightIn: number
  qty: number
  jobId?: string
}

export type Placed = {
  itemId: string
  label: string
  src: string
  xIn: number
  yIn: number
  widthIn: number
  heightIn: number
  rotated: boolean
}

/** lengthIn = printed film length; artLengthIn = artwork length (what the label and file name show). */
export type Sheet = { index: number; count: number; lengthIn: number; artLengthIn: number; pieces: Placed[] }

export type PackOptions = {
  precut: boolean
  gapIn: number
  spares: boolean
  rotate: boolean
  maxLengthIn?: number
}

export type PackResult = { sheets: Sheet[]; tooWide: string[]; tooTallToCut: string[] }

const EDGE_IN = 0.25

type Shelf = { y: number; h: number; x: number }

/**
 * Shelf packer, first-fit decreasing height. Every sheet is 22.3 in wide;
 * a job with more than 200 in of artwork continues on sheet 2, 3…
 * Pre-cut sheets keep artwork clear of the registration circles and use at
 * least the cut gutter between designs, per the Teneth rules.
 */
export function packGang(items: GangItem[], opts: PackOptions): PackResult {
  const inset = opts.precut ? MARK_CLEARANCE_IN : EDGE_IN
  const gap = opts.precut ? Math.max(opts.gapIn, CUT_GUTTER_IN) : opts.gapIn
  const usable = SHEET_WIDTH_IN - inset * 2
  const startY = CUT_ART_START_IN
  const maxLen = opts.maxLengthIn ?? MAX_SHEET_LENGTH_IN
  const tooWide: string[] = []
  const tooTallToCut: string[] = []

  type P = { item: GangItem; w: number; h: number; rotated: boolean }
  const pieces: P[] = []
  for (const item of items) {
    const n = item.qty + (opts.spares && item.qty > 0 ? 1 : 0)
    let w = item.widthIn
    let h = item.heightIn
    let rotated = false
    if (w > usable && opts.rotate && h <= usable) {
      ;[w, h] = [h, w]
      rotated = true
    }
    if (w > usable + 1e-6) {
      tooWide.push(item.label)
      continue
    }
    if (opts.precut && h > MARK_SECTION_IN) tooTallToCut.push(item.label)
    for (let i = 0; i < n; i += 1) pieces.push({ item, w, h, rotated })
  }
  pieces.sort((a, b) => b.h - a.h || b.w - a.w)

  const sheets: Placed[][] = []
  let current: Placed[] = []
  let shelves: Shelf[] = []
  let nextY = startY

  const newSheet = () => {
    if (current.length) sheets.push(current)
    current = []
    shelves = []
    nextY = startY
  }

  for (const p of pieces) {
    let placed = false
    for (const s of shelves) {
      if (p.h <= s.h + 1e-6 && s.x + p.w <= inset + usable + 1e-6) {
        current.push(at(p, s.x, s.y))
        s.x += p.w + gap
        placed = true
        break
      }
    }
    if (placed) continue
    if (nextY + p.h > startY + maxLen && current.length) newSheet()
    const shelf: Shelf = { y: nextY, h: p.h, x: inset }
    shelves.push(shelf)
    current.push(at(p, shelf.x, shelf.y))
    shelf.x += p.w + gap
    nextY += p.h + gap
  }
  if (current.length) sheets.push(current)

  const out: Sheet[] = sheets.map((list, i) => {
    const bottom = list.reduce((m, p) => Math.max(m, p.yIn + p.heightIn), 0)
    return { index: i + 1, count: sheets.length, lengthIn: Math.ceil((bottom + startY) * 2) / 2, artLengthIn: Math.ceil(bottom - startY - 1e-6), pieces: list }
  })
  return { sheets: out, tooWide, tooTallToCut: Array.from(new Set(tooTallToCut)) }

  function at(p: P, x: number, y: number): Placed {
    return { itemId: p.item.id, label: p.item.label, src: p.item.src, xIn: x, yIn: y, widthIn: p.w, heightIn: p.h, rotated: p.rotated }
  }
}
