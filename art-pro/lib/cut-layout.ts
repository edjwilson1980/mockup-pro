/**
 * Teneth CCD cutter core, ported from southside-dtf lib/cut-layout.ts
 * (main @ 9cc9bdb, app v2.5.0) via docs/CUTTER_FILES_HANDOFF.md.
 *
 * Same 22.3 in sheet width as the source (lib/sheet-size.ts); units, header,
 * TB26 window, axis mapping, section blocks and tail are unchanged.
 * scripts/verify-plt.mjs checks this file against the handoff doc output.
 * Do not change any of it without running a physical cutter test sheet.
 */
import { SHEET_WIDTH_IN } from './sheet-size'

export type PlacedSheetPiece = {
  xIn: number
  yIn: number
  widthIn: number
  heightIn: number
}

/** Header label + margin before artwork on pre-cut sheets (compose-sheet.ts). */
export const LABEL_PT = 72
export const LABEL_MARGIN_IN = 0.75
export const LABEL_HEIGHT_IN = LABEL_PT / 72
export const LABEL_PAD_IN = 0.125
export const CUT_ART_START_IN = LABEL_PAD_IN + LABEL_HEIGHT_IN + LABEL_MARGIN_IN

/** Cut contour is the printed image plus this much on every side (2.5 mm). */
export const CUT_MARGIN_IN = 2.5 / 25.4
/** Neighbouring designs need this much between them or their cut boxes overlap. */
export const CUT_GUTTER_IN = CUT_MARGIN_IN * 2
/** Most the cutter can take in one pass before it must advance to the next mark pair. */
export const MARK_SECTION_IN = 20
/** Teneth CCD cameras lock onto filled 5 mm circles, not squares or L marks. */
export const MARK_SIZE_IN = 5 / 25.4
/** Gap kept between mark rows so neighbouring black circles do not touch. */
export const MARK_PAD_IN = 2 / 25.4
/** Marks sit hard against both film edges. */
export const MARK_EDGE_IN = 0.003
export const MARK_GAP_X_IN = SHEET_WIDTH_IN - MARK_SIZE_IN - MARK_EDGE_IN * 2
/** Clear film between the two printed circles: everything has to fit in here. */
export const MARK_CLEAR_SPAN_IN = MARK_GAP_X_IN - MARK_SIZE_IN
/** Widest design that must still fit two-up between the crop marks. */
export const MAX_TWO_UP_WIDTH_IN = 10.75
export const MAX_CUT_MARGIN_IN = (MARK_CLEAR_SPAN_IN - MAX_TWO_UP_WIDTH_IN * 2) / 4
/** How far artwork sits in from the film edge so its cut box clears the circle. */
export const MARK_CLEARANCE_IN = MARK_EDGE_IN + MARK_SIZE_IN + CUT_MARGIN_IN
const MARK_ROW_GAP_IN = MARK_SIZE_IN + MARK_PAD_IN * 2
/** First crop-mark row, measured from the leading edge of the film. */
export const MARK_LEAD_IN = 10 / 25.4
/** Film after the last mark. */
export const MARK_TRAIL_IN = 0.75
export const START_ARROW_LENGTH_IN = 8 / 25.4
export const START_ARROW_WIDTH_IN = 6 / 25.4
export const PLT_UNITS_PER_IN = 1016

export type CutBox = { xIn: number; yIn: number; widthIn: number; heightIn: number }

export function cutBoxForPiece(piece: PlacedSheetPiece, sheetWidthIn: number, sheetHeightIn: number): CutBox {
  const widthIn = piece.widthIn + CUT_MARGIN_IN * 2
  const heightIn = piece.heightIn + CUT_MARGIN_IN * 2
  let xIn = piece.xIn - CUT_MARGIN_IN
  let yIn = piece.yIn - CUT_MARGIN_IN
  if (xIn < 0) xIn = 0
  else if (xIn + widthIn > sheetWidthIn) xIn = Math.max(0, sheetWidthIn - widthIn)
  if (yIn < 0) yIn = 0
  else if (yIn + heightIn > sheetHeightIn) yIn = Math.max(0, sheetHeightIn - heightIn)
  return { xIn, yIn, widthIn, heightIn }
}

export function cutPreviewBoxes(pieces: PlacedSheetPiece[], sheetWidthIn = SHEET_WIDTH_IN, sheetHeightIn: number) {
  return pieces.map((piece) => cutBoxForPiece(piece, sheetWidthIn, sheetHeightIn))
}

function markYs(sheetHeightIn: number) {
  if (sheetHeightIn <= 0) return []
  const first = MARK_LEAD_IN
  const last = sheetHeightIn - MARK_TRAIL_IN - MARK_SIZE_IN
  const span = last - first
  if (span < MARK_ROW_GAP_IN) return [first]
  const steps = Math.max(1, Math.ceil(span / MARK_SECTION_IN - 1e-9))
  const pitch = span / steps
  return Array.from({ length: steps + 1 }, (_, index) => first + index * pitch)
}

function markXs(sheetWidthIn: number) {
  const left = Math.max(0, (sheetWidthIn - MARK_GAP_X_IN - MARK_SIZE_IN) / 2)
  const right = left + MARK_GAP_X_IN
  return { left, right }
}

export type MarkBounds = CutBox & { first: boolean }

export function registrationMarkBounds(sheetHeightIn: number, sheetWidthIn = SHEET_WIDTH_IN): MarkBounds[] {
  const { left, right } = markXs(sheetWidthIn)
  const ys = markYs(sheetHeightIn)
  // The sheet goes on the bed upside down, so the bottom-right circle is first.
  const startRow = ys.length - 1
  return ys.flatMap((yIn, row) => [
    { xIn: left, yIn, widthIn: MARK_SIZE_IN, heightIn: MARK_SIZE_IN, first: false },
    { xIn: right, yIn, widthIn: MARK_SIZE_IN, heightIn: MARK_SIZE_IN, first: row === startRow },
  ])
}

export type ArrowPoint = { xIn: number; yIn: number }

/** Triangle inboard of the start mark (bottom-right), pointing at it. */
export function startMarkArrowPoints(mark: CutBox): ArrowPoint[] {
  const cy = mark.yIn + mark.heightIn / 2
  const tipX = mark.xIn - MARK_PAD_IN - 0.6 / 25.4
  const length = START_ARROW_LENGTH_IN
  const half = START_ARROW_WIDTH_IN / 2
  return [
    { xIn: tipX, yIn: cy },
    { xIn: tipX - length, yIn: cy - half },
    { xIn: tipX - length, yIn: cy + half },
  ]
}

function toUnits(inches: number) {
  return Math.round(inches * PLT_UNITS_PER_IN)
}

function rectanglePath(x1: number, y1: number, x2: number, y2: number) {
  return `U${x1},${y1};D${x1},${y1};D${x1},${y2};D${x2},${y2};D${x2},${y1};D${x1},${y1};U${x1},${y1};`
}

function markCenterInches(mark: CutBox) {
  return { xIn: mark.xIn + mark.widthIn / 2, yIn: mark.yIn + mark.heightIn / 2 }
}

function marksFromStart(marks: CutBox[]) {
  return [...marks].sort((a, b) => {
    const ac = markCenterInches(a)
    const bc = markCenterInches(b)
    if (Math.abs(ac.yIn - bc.yIn) > 1e-9) return bc.yIn - ac.yIn
    return bc.xIn - ac.xIn
  })
}

function markRowsFromStart(marks: CutBox[]) {
  const rows: CutBox[][] = []
  for (const mark of marksFromStart(marks)) {
    const row = rows[rows.length - 1]
    if (row && Math.abs(markCenterInches(row[0]).yIn - markCenterInches(mark).yIn) < 0.05) row.push(mark)
    else rows.push([mark])
  }
  return rows
}

/** X = feed (up the sheet from the start mark), Y = carriage (to the left). */
function toPlt(xIn: number, yIn: number, origin: { xIn: number; yIn: number }) {
  return { x: toUnits(origin.yIn - yIn), y: toUnits(origin.xIn - xIn) }
}

function scanWindow(frame: CutBox[], origin: { xIn: number; yIn: number }) {
  let feed = 0
  let carriage = 0
  for (const mark of frame) {
    const center = markCenterInches(mark)
    const point = toPlt(center.xIn, center.yIn, origin)
    feed = Math.max(feed, point.x)
    carriage = Math.max(carriage, point.y)
  }
  return { feed, carriage }
}

const ORIGIN_TICK = 'U-7,8;D-7,8;D-7,0;U-7,0;'
const ROW_OVERLAP_IN = toUnits(0.25)

type PltBox = { x1: number; y1: number; x2: number; y2: number }

function boxesFromStart(boxes: CutBox[], origin: { xIn: number; yIn: number }): PltBox[] {
  const remaining: PltBox[] = boxes
    .map((box) => {
      const a = toPlt(box.xIn, box.yIn, origin)
      const b = toPlt(box.xIn + box.widthIn, box.yIn + box.heightIn, origin)
      return { x1: Math.min(a.x, b.x), y1: Math.min(a.y, b.y), x2: Math.max(a.x, b.x), y2: Math.max(a.y, b.y) }
    })
    .sort((a, b) => a.x1 - b.x1 || a.y1 - b.y1)

  const order: PltBox[] = []
  while (remaining.length > 0) {
    const seed = remaining.shift() as PltBox
    const row = [seed]
    for (let i = 0; i < remaining.length; ) {
      if (remaining[i].x1 + ROW_OVERLAP_IN < seed.x2) row.push(remaining.splice(i, 1)[0])
      else i += 1
    }
    row.sort((a, b) => a.y1 - b.y1)
    order.push(...row)
  }
  return order
}

const DMPL_HEADER = ';:H A L0 ECN U '
const PLT_TAIL = '@'.repeat(21)

function sectionBlock(boxes: CutBox[], frame: CutBox[], origin: { xIn: number; yIn: number }) {
  const { feed, carriage } = scanWindow(frame, origin)
  const paths = boxesFromStart(boxes, origin)
    .map((box) => rectanglePath(box.x1, box.y1, box.x2, box.y2))
    .join('')
  return `TB26,0,${feed},${carriage};CT1;${DMPL_HEADER}${ORIGIN_TICK}${paths}U${feed},0;PG;`
}

export function buildTenethPlt(boxes: CutBox[], marks: CutBox[] = []) {
  const rows = markRowsFromStart(marks)
  if (rows.length === 0) {
    const paths = boxesFromStart(boxes, { xIn: 0, yIn: 0 })
      .map((box) => rectanglePath(box.x1, box.y1, box.x2, box.y2))
      .join('')
    return `${DMPL_HEADER}${paths}U @`
  }
  const rowY = rows.map((row) => markCenterInches(row[0]).yIn)
  if (rows.length === 1) return sectionBlock(boxes, rows[0], markCenterInches(rows[0][0])) + PLT_TAIL

  const sectionOf = (box: CutBox) => {
    const leadingEdge = box.yIn + box.heightIn
    for (let i = 0; i < rowY.length - 1; i += 1) {
      if (leadingEdge > rowY[i + 1]) return i
    }
    return rowY.length - 2
  }
  const perSection: CutBox[][] = Array.from({ length: rows.length - 1 }, () => [])
  for (const box of boxes) perSection[sectionOf(box)].push(box)
  return (
    perSection
      .map((sectionBoxes, index) =>
        sectionBlock(sectionBoxes, [...rows[index], ...rows[index + 1]], markCenterInches(rows[index][0])),
      )
      .join('') + PLT_TAIL
  )
}

/** Section index (0 = first pass, nearest the start mark) for each piece, for the preview. */
export function cutSections(pieces: PlacedSheetPiece[], sheetHeightIn: number) {
  const ys = markYs(sheetHeightIn).map((y) => y + MARK_SIZE_IN / 2).reverse()
  return pieces.map((p) => {
    const lead = p.yIn + p.heightIn + CUT_MARGIN_IN
    for (let i = 0; i < ys.length - 1; i += 1) if (lead > ys[i + 1]) return i
    return Math.max(0, ys.length - 2)
  })
}

/** Cut order (1-based) of each piece, matching the order written into the PLT. */
export function cutOrder(pieces: PlacedSheetPiece[], sheetHeightIn: number, sheetWidthIn = SHEET_WIDTH_IN) {
  const sections = cutSections(pieces, sheetHeightIn)
  const sectionCount = sections.reduce((m, s) => Math.max(m, s), 0) + 1
  const marks = registrationMarkBounds(sheetHeightIn, sheetWidthIn)
  const rows = markRowsFromStart(marks)
  const order: number[] = new Array(pieces.length).fill(0)
  let n = 1
  for (let s = 0; s < sectionCount; s += 1) {
    const idx = pieces.map((_, i) => i).filter((i) => sections[i] === s)
    const origin = rows[s] ? markCenterInches(rows[s][0]) : { xIn: 0, yIn: 0 }
    const boxes = idx.map((i) => cutBoxForPiece(pieces[i], sheetWidthIn, sheetHeightIn))
    const sorted = boxesFromStart(boxes, origin)
    const keyed = boxes.map((b, j) => {
      const a = toPlt(b.xIn, b.yIn, origin)
      const c = toPlt(b.xIn + b.widthIn, b.yIn + b.heightIn, origin)
      return { j, x1: Math.min(a.x, c.x), y1: Math.min(a.y, c.y) }
    })
    for (const box of sorted) {
      const hit = keyed.find((k) => k.x1 === box.x1 && k.y1 === box.y1 && order[idx[k.j]] === 0)
      if (hit) order[idx[hit.j]] = n++
    }
  }
  return order
}

export function cutPlt(pieces: PlacedSheetPiece[], sheetHeightIn: number, sheetWidthIn = SHEET_WIDTH_IN) {
  const boxes = pieces
    .map((piece) => cutBoxForPiece(piece, sheetWidthIn, sheetHeightIn))
    .filter((box) => box.widthIn > 0 && box.heightIn > 0)
  if (boxes.length === 0) return ''
  return buildTenethPlt(boxes, registrationMarkBounds(sheetHeightIn, sheetWidthIn))
}
