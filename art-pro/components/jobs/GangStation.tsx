'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { packGang, type GangItem, type Sheet } from '@/lib/pack'
import { drawSheet, sheetTiff } from '@/lib/compose'
import { tifName } from '@/lib/tiff'
import { downloadBlob } from '@/lib/image'
import { cutPlt } from '@/lib/cut-layout'
import { sheetCutFileName, sheetFileName, sheetJobName, sheetStamp } from '@/lib/sheet-name'
import { DPI, SHEET_WIDTH_IN } from '@/lib/sheet-size'
import { JOB_TYPES, pxOf, srcOf, type Job, type JobDesign } from '@/lib/jobs'
import { renderArt, type Rendered } from '@/lib/render'
import { widthOf } from './MockupStation'

const TIERS: [number, number][] = [[12, 8], [24, 15], [36, 24], [48, 30], [60, 40], [72, 48], [100, 60], [120, 70], [150, 90], [200, 115]]
const DTF_PRESETS = [3, 3.5, 4, 5, 8, 10.5, 12]

type Props = {
  job: Job
  patchDesign: (id: string, p: Partial<JobDesign>) => void
  setOpt: (o: { precut?: boolean; spares?: boolean }) => void
  goBack: () => void
  finish: () => void
}

export function gangWidth(d: JobDesign, job: Job) {
  if (JOB_TYPES[job.job_type].group === 'apparel') return widthOf(d, job.job_type === 'hoodie' ? 'hoodie' : 'tee')
  return d.widthIn ?? Math.min(JOB_TYPES[job.job_type].defaultWidth, 21.7)
}

function SheetPreview({ sheet, precut, label }: { sheet: Sheet; precut: boolean; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (ref.current) drawSheet(ref.current, sheet, { pxPerIn: 14, precut, label, preview: true }).catch(() => {})
  }, [sheet, precut, label])
  return <canvas ref={ref} className="sheetcanvas checker" />
}

export default function GangStation(p: Props) {
  const { job } = p
  const designs = job.data.designs
  const editable = JOB_TYPES[job.job_type].group !== 'apparel'
  const precut = job.job_type === 'sticker' || !!job.data.precut
  const spares = !!job.data.spares
  const stamp = useMemo(() => sheetStamp(), [])
  const [prints, setPrints] = useState<Record<string, Rendered>>({})
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')

  // Print-resolution art (300 DPI, halftone at true size). Re-rendered when size or art changes.
  const sig = designs.map((d) => [d.id, srcOf(d), gangWidth(d, job), d.knockout, d.halftone?.mode, d.halftone?.lpi].join('|')).join(';')
  useEffect(() => {
    let off = false
    setBusy('Preparing print-resolution art…')
    Promise.all(designs.map(async (d) => [d.id, await renderArt(srcOf(d), pxOf(d), { widthIn: gangWidth(d, job), dpi: DPI, knockout: d.knockout, halftone: d.halftone, hardAlpha: true })] as const))
      .then((all) => { if (!off) setPrints(Object.fromEntries(all)) })
      .catch((e) => { if (!off) setMsg('Could not prepare art: ' + (e instanceof Error ? e.message : '')) })
      .finally(() => { if (!off) setBusy('') })
    return () => { off = true }
  }, [sig]) // eslint-disable-line react-hooks/exhaustive-deps

  const items: GangItem[] = designs
    .filter((d) => prints[d.id] && (d.qty || 0) > 0)
    .map((d) => ({ id: d.id, label: `#${d.n} ${d.name}`, src: prints[d.id].url, widthIn: prints[d.id].widthIn, heightIn: prints[d.id].heightIn, qty: d.qty || 0 }))
  const sheetLen = job.data.sheetLength || undefined
  const result = useMemo(() => packGang(items, { precut, gapIn: 0.25, spares, rotate: true, maxLengthIn: sheetLen }), [prints, sig, precut, spares, sheetLen, designs.map((d) => d.qty).join()]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Most copies of every design that still fit on one sheet of the bought length. */
  function fillSheet() {
    if (!sheetLen) return
    const base = designs.filter((d) => prints[d.id]).map((d) => ({ id: d.id, label: d.name, src: prints[d.id].url, widthIn: prints[d.id].widthIn, heightIn: prints[d.id].heightIn, qty: 1 }))
    if (!base.length) return
    let best = 0
    for (let k = 1; k <= 500; k++) {
      const r = packGang(base.map((b) => ({ ...b, qty: k })), { precut, gapIn: 0.25, spares: false, rotate: true, maxLengthIn: sheetLen })
      if (r.sheets.length > 1 || r.tooWide.length) break
      best = k
    }
    for (const d of designs) if (prints[d.id]) p.patchDesign(d.id, { qty: best })
    setMsg(best ? `Filled the ${sheetLen}″ sheet: ${best} of each design.` : 'Even one of each does not fit this sheet length.')
  }
  const autoFilled = useRef(false)
  useEffect(() => {
    if (autoFilled.current || !job.data.fillSheet || !sheetLen || busy || !Object.keys(prints).length) return
    if (designs.some((d) => d.qty == null)) { autoFilled.current = true; fillSheet() }
  }, [prints, busy]) // eslint-disable-line react-hooks/exhaustive-deps
  const totalLen = result.sheets.reduce((a, s) => a + s.lengthIn, 0)
  const price = result.sheets.reduce((a, s) => a + (TIERS.find((t) => s.artLengthIn <= t[0]) || TIERS[TIERS.length - 1])[1], 0)
  const nameFor = (s: Sheet) => ({ index: s.index - 1, count: s.count })
  const missingQty = designs.some((d) => d.qty == null)

  async function download() {
    try {
      for (const s of result.sheets) {
        const label = sheetJobName(job.customer, s.artLengthIn, stamp, nameFor(s))
        const tif = await sheetTiff(s, { label, precut, dpi: DPI, onProgress: (f) => setBusy(`Sheet ${s.index} of ${s.count} → CMYK: ${Math.round(f * 100)}%`) })
        downloadBlob(tif, tifName(sheetFileName(job.customer, s.artLengthIn, stamp, nameFor(s))))
        if (precut) {
          await new Promise((r) => setTimeout(r, 300))
          downloadBlob(new Blob([cutPlt(s.pieces, s.lengthIn)], { type: 'text/plain' }), sheetCutFileName(job.customer, s.artLengthIn, stamp, nameFor(s)))
        }
        await new Promise((r) => setTimeout(r, 300))
      }
      setMsg(`Downloaded ${result.sheets.length} CMYK sheet${result.sheets.length > 1 ? 's' : ''} (GRACoL 2013 TIFF)${precut ? ' + cut files' : ''}.`)
    } catch (e) {
      setMsg('Something went wrong: ' + (e instanceof Error ? e.message : ''))
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="gang">
      <div className="mockgrid">
        <div className="stepsbox wide">
          {designs.map((d) => {
            const w = gangWidth(d, job)
            const r = prints[d.id]
            const dpi = Math.round(pxOf(d)[0] / w)
            return (
              <div key={d.id} className="astep">
                <h4><i>#{d.n}</i>{d.name}{d.place ? <span className="muted small"> · {d.place}</span> : null}</h4>
                <div className="row3">
                  <label className="field"><span className="lbl">Width (in)</span>
                    <input className="input" type="number" step="0.25" min="0.5" max="21.7" value={w} disabled={!editable} onChange={(e) => p.patchDesign(d.id, { widthIn: Math.max(0.5, Math.min(21.7, Number(e.target.value) || w)) })} />
                  </label>
                  <label className="field"><span className="lbl">How many</span>
                    <input className="input" type="number" min="0" value={d.qty ?? ''} placeholder="?" onChange={(e) => p.patchDesign(d.id, { qty: e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value))) })} />
                  </label>
                </div>
                {editable && <div className="pills">{DTF_PRESETS.map((x) => <button key={x} type="button" className={`pill sm ${w === x ? 'on' : ''}`} onClick={() => p.patchDesign(d.id, { widthIn: x })}>{x}″</button>)}</div>}
                <p className={dpi >= 150 ? 'ok' : 'warn'}>{r ? `${r.widthIn.toFixed(2)}″ × ${r.heightIn.toFixed(2)}″` : '…'} · {dpi} DPI{d.halftone ? ` · halftone ${d.halftone.lpi} LPI` : ''}{dpi < 150 && <> · <button type="button" className="link" onClick={p.goBack}>back to Artwork to upscale</button></>}</p>
                {!editable && <p className="muted small">Size comes from the mockup. Change it there.</p>}
              </div>
            )
          })}
          {sheetLen && (
            <div className="astep">
              <h4><i>▭</i>Sheet: {SHEET_WIDTH_IN}″ × {sheetLen}″ {result.sheets.length > 1 && <span className="warn small">· needs {result.sheets.length} sheets</span>}</h4>
              <button type="button" className="tool" disabled={!Object.keys(prints).length} onClick={fillSheet}>Fill the sheet</button>
            </div>
          )}
          <div className="opts">
            {job.job_type !== 'sticker' && <button type="button" className={`opt ${precut ? 'on' : ''}`} onClick={() => p.setOpt({ precut: !precut })}><strong>Pre-cut</strong><span>Teneth cut file</span></button>}
            <button type="button" className={`opt ${spares ? 'on' : ''}`} onClick={() => p.setOpt({ spares: !spares })}><strong>+1 spare</strong><span>Per design</span></button>
          </div>
        </div>

        <div className="stepsbox">
          {result.sheets.length > 0 ? (
            <div className="sheets">
              {result.sheets.map((s) => (
                <div key={s.index} className="sheetwrap">
                  <span className="muted small">Sheet {s.index} of {s.count} · {SHEET_WIDTH_IN}″ × {s.lengthIn}″</span>
                  <SheetPreview sheet={s} precut={precut} label={sheetJobName(job.customer, s.artLengthIn, stamp, nameFor(s))} />
                </div>
              ))}
            </div>
          ) : <p className="muted">{busy || (missingQty ? 'Enter how many of each design.' : 'Nothing to print yet.')}</p>}
          <dl className="specs">
            <div><dt>Prints</dt><dd>{result.sheets.reduce((a, s) => a + s.pieces.length, 0) || '—'}</dd></div>
            <div><dt>Gang sheet</dt><dd>{result.sheets.length ? `${SHEET_WIDTH_IN}″ × ${totalLen}″${result.sheets.length > 1 ? ` · ${result.sheets.length} sheets` : ''}` : '—'}</dd></div>
            <div><dt>Price tier</dt><dd>{result.sheets.length ? `$${price}` : '—'}</dd></div>
          </dl>
          {busy && <p className="muted small">{busy}</p>}
          {msg && <p className="ok">{msg}</p>}
          <button type="button" className="btn primary" disabled={!result.sheets.length || !!busy} onClick={download}>Download print files (CMYK TIFF)</button>
        </div>
      </div>
      <div className="nextbar">
        <span className="muted">Download the files, then mark the job done.</span>
        <button type="button" className="btn" onClick={p.finish}>Mark job done ✓</button>
      </div>
    </div>
  )
}
