'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { packGang } from '@/lib/pack'
import { drawSheet } from '@/lib/compose'
import { downloadBlob } from '@/lib/image'
import {
  CUT_MARGIN_IN, MARK_CLEAR_SPAN_IN, MARK_GAP_X_IN, MAX_TWO_UP_WIDTH_IN, cutOrder, cutPlt, cutPreviewBoxes, cutSections, registrationMarkBounds,
} from '@/lib/cut-layout'
import { sheetCutFileName, sheetJobName, sheetStamp } from '@/lib/sheet-name'
import { SHEET_WIDTH_IN } from '@/lib/sheet-size'
import { uid, useStore } from './store'

const K = 16

function sampleArt(color: string) {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')!
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 64, 64)
  return c.toDataURL()
}

export default function CutterTab() {
  const { gang, setGang, opts, setOpts, customer, setTab } = useStore()
  const result = useMemo(() => packGang(gang, { ...opts, precut: true }), [gang, opts])
  const [idx, setIdx] = useState(0)
  const [showOrder, setShowOrder] = useState(true)
  const [showPasses, setShowPasses] = useState(true)
  const sheet = result.sheets[Math.min(idx, Math.max(0, result.sheets.length - 1))]
  const stamp = useMemo(() => sheetStamp(), [])
  const ref = useRef<HTMLCanvasElement>(null)

  const plt = useMemo(() => (sheet ? cutPlt(sheet.pieces, sheet.lengthIn) : ''), [sheet])
  const marks = useMemo(() => (sheet ? registrationMarkBounds(sheet.lengthIn) : []), [sheet])
  const boxes = useMemo(() => (sheet ? cutPreviewBoxes(sheet.pieces, SHEET_WIDTH_IN, sheet.lengthIn) : []), [sheet])
  const order = useMemo(() => (sheet ? cutOrder(sheet.pieces, sheet.lengthIn) : []), [sheet])
  const sections = useMemo(() => (sheet ? cutSections(sheet.pieces, sheet.lengthIn) : []), [sheet])
  const rowYs = useMemo(() => Array.from(new Set(marks.map((m) => +(m.yIn + m.heightIn / 2).toFixed(4)))).sort((a, b) => a - b), [marks])
  const label = sheet ? sheetJobName(customer, sheet.artLengthIn, stamp, { index: sheet.index - 1, count: sheet.count }) : ''

  useEffect(() => {
    if (ref.current && sheet) drawSheet(ref.current, sheet, { pxPerIn: K, precut: true, label }).catch(() => {})
  }, [sheet, label])

  function loadSample() {
    const red = sampleArt('#C8202F')
    const blue = sampleArt('#2F6FB0')
    setOpts({ precut: true, spares: false })
    setGang(() => [
      { id: uid(), label: 'Sample front 10.75 × 12', src: red, widthIn: 10.75, heightIn: 12, qty: 3 },
      { id: uid(), label: 'Sample 4 × 4', src: blue, widthIn: 4, heightIn: 4, qty: 2 },
    ])
  }

  if (!sheet) {
    return (
      <div className="card narrow">
        <h3>Cutter</h3>
        <p className="muted">No sheet yet. Approve a job or add prints on the gang sheet, then turn on Pre-cut.</p>
        <div className="actions">
          <button type="button" className="btn" onClick={() => setTab('gang')}>Go to gang sheet</button>
          <button type="button" className="btn" onClick={loadSample}>Load a sample layout</button>
        </div>
      </div>
    )
  }

  const passes = Math.max(1, rowYs.length - 1)
  const W = SHEET_WIDTH_IN
  const H = sheet.lengthIn

  return (
    <div className="grid3">
      <section className="col">
        <div className="card">
          <h3>Cut job</h3>
          {!opts.precut && (
            <p className="warn">Pre-cut is off on the gang sheet, so the downloaded PNG won&apos;t have marks. <button type="button" className="link" onClick={() => setOpts({ precut: true })}>Turn it on</button></p>
          )}
          <label className="lbl" htmlFor="sheetsel">Sheet</label>
          <select id="sheetsel" className="select" value={idx} onChange={(e) => setIdx(Number(e.target.value))}>
            {result.sheets.map((s, i) => (
              <option key={s.index} value={i}>{W} × {s.lengthIn} · {s.index} of {s.count}</option>
            ))}
          </select>
          <div className="stats">
            <div><span>Passes</span><strong>{passes}</strong></div>
            <div><span>Cuts</span><strong>{sheet.pieces.length}</strong></div>
            <div><span>Mark rows</span><strong>{rowYs.length}</strong></div>
          </div>
        </div>
        <div className="card">
          <h3>Locked cutter rules</h3>
          <dl className="specs">
            <div><dt>Cutter</dt><dd>Teneth CCD, roll-fed</dd></div>
            <div><dt>File</dt><dd>.plt · DMPL/HPGL</dd></div>
            <div><dt>Units</dt><dd>1016 per inch</dd></div>
            <div><dt>Sheet width</dt><dd>{W} in on 24 in film</dd></div>
            <div><dt>Mark gap</dt><dd>{MARK_GAP_X_IN.toFixed(3)} in</dd></div>
            <div><dt>Clear span</dt><dd>{MARK_CLEAR_SPAN_IN.toFixed(3)} in</dd></div>
            <div><dt>Reg marks</dt><dd>5 mm black circles</dd></div>
            <div><dt>Mark rows</dt><dd>Even, ≤ 20 in apart</dd></div>
            <div><dt>Cut margin</dt><dd>{(CUT_MARGIN_IN * 25.4).toFixed(1)} mm</dd></div>
            <div><dt>Two-up max</dt><dd>{MAX_TWO_UP_WIDTH_IN} in designs</dd></div>
          </dl>
        </div>
        <div className="card notice">
          <strong>Operator</strong>
          <span>Load the sheet upside down. Park the camera on the bottom-right circle, the one with the arrow.</span>
        </div>
      </section>

      <section className="col wide">
        <div className="card">
          <div className="bar">
            <h3 className="nomargin">Cut preview</h3>
            <span className="legend"><i className="lcut" />Cut box</span>
            <span className="legend"><i className="lmark" />Reg mark</span>
            <div className="seg">
              <button type="button" className={showOrder ? 'on' : ''} onClick={() => setShowOrder(!showOrder)}>Cut order</button>
              <button type="button" className={showPasses ? 'on' : ''} onClick={() => setShowPasses(!showPasses)}>Passes</button>
            </div>
          </div>
          <div className="cutstage">
            <div className="cutwrap" style={{ width: W * K, height: H * K }}>
              <canvas ref={ref} className="cutcanvas" />
              <svg className="overlay" viewBox={`0 0 ${W} ${H}`} width={W * K} height={H * K} aria-label="Cut boxes and order">
                {showPasses && rowYs.slice(0, -1).map((y, i) => {
                  const passNo = rowYs.length - 1 - i
                  return (
                    <g key={y}>
                      <rect x={0} y={y} width={W} height={rowYs[i + 1] - y} fill={passNo % 2 ? 'rgba(65,182,230,0.10)' : 'rgba(65,182,230,0.04)'} />
                      <line x1={0} x2={W} y1={y} y2={y} stroke="#7FB8D6" strokeWidth={0.04} strokeDasharray="0.3 0.2" />
                      <title>{`Pass ${passNo}`}</title>
                    </g>
                  )
                })}
                {boxes.map((b, i) => (
                  <g key={i}>
                    <rect x={b.xIn} y={b.yIn} width={b.widthIn} height={b.heightIn} fill="none" stroke="#FF2BD6" strokeWidth={0.06} />
                    {showOrder && (
                      <g>
                        <circle cx={b.xIn + b.widthIn / 2} cy={b.yIn + b.heightIn / 2} r={0.55} fill="#fff" stroke="#FF2BD6" strokeWidth={0.08} />
                        <text x={b.xIn + b.widthIn / 2} y={b.yIn + b.heightIn / 2 + 0.22} textAnchor="middle" fontSize={0.62} fontWeight={700} fill="#111" fontFamily="monospace">{order[i]}</text>
                      </g>
                    )}
                    <title>{`Cut ${order[i]} · pass ${sections[i] + 1}`}</title>
                  </g>
                ))}
                {marks.filter((m) => m.first).map((m) => (
                  <circle key="start" cx={m.xIn + m.widthIn / 2} cy={m.yIn + m.heightIn / 2} r={0.26} fill="none" stroke="#3FB97A" strokeWidth={0.07} />
                ))}
              </svg>
            </div>
          </div>
          <p className="muted small">Shaded bands are passes; pass 1 is the bottom band, at the start mark. Cut order: nearest the start mark first, across the film, then up. Each pass re-registers on its own pair of mark rows.</p>
        </div>
      </section>

      <aside className="col">
        <div className="card">
          <h3>Cut file</h3>
          <div className="filechip"><span className="tag pink">PLT</span><span className="small wrap">{sheetCutFileName(customer, sheet.artLengthIn, stamp, { index: sheet.index - 1, count: sheet.count })}</span></div>
          <pre className="plt">{plt.length > 520 ? `${plt.slice(0, 520)}…` : plt}</pre>
          <span className="muted small">{plt.length.toLocaleString()} characters</span>
          <button type="button" className="btn primary" onClick={() => downloadBlob(new Blob([plt], { type: 'text/plain' }), sheetCutFileName(customer, sheet.artLengthIn, stamp, { index: sheet.index - 1, count: sheet.count }))}>Download cut.plt</button>
          <p className="muted small">Download the matching PNG from the gang sheet with Pre-cut on. They&apos;re named alike so the press and cutter stay matched.</p>
        </div>
        <div className="card">
          <h3>Checks</h3>
          <ul className="checks">
            <li className={result.tooTallToCut.length ? 'bad' : ''}>Every design ≤ 20" tall</li>
            <li>Two {MAX_TWO_UP_WIDTH_IN}" designs fit between marks</li>
            <li>Cut boxes clear the circles</li>
            <li>Gutters ≥ 5 mm, no overlapping cuts</li>
          </ul>
        </div>
      </aside>
    </div>
  )
}
