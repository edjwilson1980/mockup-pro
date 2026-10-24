'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { packGang, type GangItem, type Sheet } from '@/lib/pack'
import { drawSheet, sheetTiff } from '@/lib/compose'
import { tifName } from '@/lib/tiff'
import { downloadBlob } from '@/lib/image'
import { cutPlt } from '@/lib/cut-layout'
import { sheetCutFileName, sheetFileName, sheetJobName, sheetStamp } from '@/lib/sheet-name'
import { DPI, MAX_SHEET_LENGTH_IN, SHEET_WIDTH_IN } from '@/lib/sheet-size'
import { uid, useStore } from './store'

const PREVIEW_PX_PER_IN = 14
/** Widest a design can be on a 22.3 in sheet with the edge margins. */
const MAX_DESIGN_W = Math.floor((SHEET_WIDTH_IN - 0.6) * 100) / 100

function SheetPreview({ sheet, precut, label }: { sheet: Sheet; precut: boolean; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (ref.current) drawSheet(ref.current, sheet, { pxPerIn: PREVIEW_PX_PER_IN, precut, label, preview: true }).catch(() => {})
  }, [sheet, precut, label])
  return <canvas ref={ref} className="sheetcanvas checker" />
}

/** DPI stored in a PNG's pHYs chunk, if any. */
async function pngDpi(file: File): Promise<number | null> {
  if (file.type !== 'image/png') return null
  const head = new Uint8Array(await file.slice(0, 65536).arrayBuffer())
  for (let i = 8; i + 12 <= head.length; ) {
    const view = new DataView(head.buffer, i)
    const len = view.getUint32(0)
    const type = String.fromCharCode(head[i + 4], head[i + 5], head[i + 6], head[i + 7])
    if (type === 'pHYs' && i + 17 <= head.length) {
      if (head[i + 16] !== 1) return null
      return Math.round(view.getUint32(8) * 0.0254)
    }
    if (type === 'IDAT' || type === 'IEND') return null
    i += 12 + len
  }
  return null
}

function round(n: number) {
  return Math.round(n * 100) / 100
}

export default function GangTab() {
  const { jobs, gang, setGang, customer, setCustomer, opts, setOpts, setTab } = useStore()
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [adding, setAdding] = useState('')
  const [newWidth, setNewWidth] = useState(10)
  const [newQty, setNewQty] = useState(1)
  const [useFileDpi, setUseFileDpi] = useState(true)
  const [bulkWidth, setBulkWidth] = useState('')
  const [bulkQty, setBulkQty] = useState('')
  const dropRef = useRef<HTMLLabelElement>(null)
  const stamp = useMemo(() => sheetStamp(), [])
  const result = useMemo(() => packGang(gang, opts), [gang, opts])
  const totalLen = result.sheets.reduce((a, s) => a + s.lengthIn, 0)
  const used = result.sheets.reduce((a, s) => a + s.pieces.reduce((b, p) => b + p.widthIn * p.heightIn, 0), 0)
  const prints = result.sheets.reduce((a, s) => a + s.pieces.length, 0)

  async function addFiles(list: FileList | File[] | null) {
    if (!list) return
    const files = Array.from(list)
    const images = files.filter((f) => f.type.startsWith('image/'))
    const skipped = files.length - images.length
    setMsg(skipped ? `Skipped ${skipped} file${skipped > 1 ? 's' : ''} that aren't images (PNG, JPG, WEBP).` : '')
    const added: GangItem[] = []
    for (const [i, f] of images.entries()) {
      setAdding(`Adding ${i + 1} of ${images.length}…`)
      const url = URL.createObjectURL(f)
      const img = await new Promise<HTMLImageElement | null>((resolve) => {
        const el = new Image()
        el.onload = () => resolve(el)
        el.onerror = () => resolve(null)
        el.src = url
      })
      if (!img) continue
      const dpi = useFileDpi ? await pngDpi(f) : null
      let w: number
      let h: number
      if (dpi && dpi >= 100 && dpi <= 1200) {
        w = img.width / dpi
        h = img.height / dpi
      } else {
        w = newWidth
        h = (img.height * newWidth) / img.width
      }
      if (w > MAX_DESIGN_W) {
        h = (h * MAX_DESIGN_W) / w
        w = MAX_DESIGN_W
      }
      added.push({ id: uid(), label: f.name.replace(/\.[^.]+$/, ''), src: url, widthIn: round(w), heightIn: round(h), qty: newQty })
    }
    setGang((g) => [...g, ...added])
    setAdding('')
  }

  function update(id: string, patch: Partial<{ widthIn: number; heightIn: number; qty: number }>) {
    setGang((g) =>
      g.map((it) => {
        if (it.id !== id) return it
        const next = { ...it, ...patch }
        // Keep the art's proportions when one side changes.
        if (patch.widthIn && it.widthIn) next.heightIn = round((it.heightIn * patch.widthIn) / it.widthIn)
        if (patch.heightIn && it.heightIn) next.widthIn = round((it.widthIn * patch.heightIn) / it.heightIn)
        return next
      }),
    )
  }

  function applyBulk() {
    const w = Number(bulkWidth)
    const q = Number(bulkQty)
    setGang((g) =>
      g.map((it) => {
        let next = it
        if (w > 0) next = { ...next, widthIn: round(Math.min(w, MAX_DESIGN_W)), heightIn: round((it.heightIn * Math.min(w, MAX_DESIGN_W)) / it.widthIn) }
        if (q >= 0 && bulkQty !== '') next = { ...next, qty: Math.floor(q) }
        return next
      }),
    )
  }

  const nameFor = (s: Sheet) => ({ index: s.index - 1, count: s.count })

  async function downloadAll() {
    setMsg('')
    try {
      for (const s of result.sheets) {
        const label = sheetJobName(customer, s.artLengthIn, stamp, nameFor(s))
        const tif = await sheetTiff(s, {
          label,
          precut: opts.precut,
          dpi: DPI,
          onProgress: (f) => setBusy(`Sheet ${s.index} of ${s.count} (${s.lengthIn}"): ${Math.round(f * 100)}%`),
        })
        downloadBlob(tif, tifName(sheetFileName(customer, s.artLengthIn, stamp, nameFor(s))))
        if (opts.precut) {
          const plt = cutPlt(s.pieces, s.lengthIn)
          await new Promise((r) => setTimeout(r, 300))
          downloadBlob(new Blob([plt], { type: 'text/plain' }), sheetCutFileName(customer, s.artLengthIn, stamp, nameFor(s)))
        }
        await new Promise((r) => setTimeout(r, 300))
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not render the sheet.')
    } finally {
      setBusy('')
    }
  }

  const designCount = gang.length
  const printCount = gang.reduce((a, g) => a + g.qty, 0)

  return (
    <div className="grid2">
      <section className="col wide">
        {jobs.length > 0 && (
          <div className="card">
            <h3>Approved jobs</h3>
            <div className="approved">
              {jobs.map((j) => (
                <div key={j.id} className="ajob">
                  <img src={j.mockupUrl} alt="" />
                  <div>
                    <span className="badge">APPROVED</span>
                    <div className="strong">{j.customer || 'Customer'} · {j.productLabel}</div>
                    <div className="muted small">{j.qty} × {j.widthIn.toFixed(2)}&quot; × {j.heightIn.toFixed(2)}&quot; · {j.approvedAt}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="card">
          <h3>Add designs</h3>
          <label
            ref={dropRef}
            className="drop big"
            onDragOver={(e) => { e.preventDefault(); dropRef.current?.classList.add('over') }}
            onDragLeave={() => dropRef.current?.classList.remove('over')}
            onDrop={(e) => { e.preventDefault(); dropRef.current?.classList.remove('over'); addFiles(e.dataTransfer.files) }}
          >
            <input type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
            <strong>Drop all the designs here, or browse</strong>
            <span className="muted small">Select as many files as you want at once · PNG, JPG, WEBP</span>
          </label>
          <div className="row3">
            <label className="field"><span className="lbl">Width for new designs (in)</span><input className="input" type="number" min="0.5" max={MAX_DESIGN_W} step="0.25" value={newWidth} onChange={(e) => setNewWidth(Math.max(0.5, Number(e.target.value) || 0.5))} /></label>
            <label className="field"><span className="lbl">Copies of each</span><input className="input" type="number" min="1" value={newQty} onChange={(e) => setNewQty(Math.max(1, Number(e.target.value) || 1))} /></label>
            <label className="check"><input type="checkbox" checked={useFileDpi} onChange={(e) => setUseFileDpi(e.target.checked)} />Use the PNG&apos;s own size when it has one</label>
          </div>
          {adding && <p className="muted small">{adding}</p>}
        </div>

        <div className="card">
          <div className="bar">
            <h3 className="nomargin">Designs on this job</h3>
            {designCount > 0 && <span className="muted small">{designCount} design{designCount > 1 ? 's' : ''} · {printCount} prints</span>}
            {designCount > 0 && <button type="button" className="link right" onClick={() => setGang(() => [])}>Clear all</button>}
          </div>
          {designCount === 0 ? (
            <p className="muted">Drop designs above, or approve a job on New job.</p>
          ) : (
            <>
              <div className="bulk">
                <span className="lbl">Change all:</span>
                <input aria-label="Width for all designs" className="input sm" type="number" step="0.25" placeholder="Width" value={bulkWidth} onChange={(e) => setBulkWidth(e.target.value)} />
                <input aria-label="Copies for all designs" className="input sm" type="number" min="0" placeholder="Copies" value={bulkQty} onChange={(e) => setBulkQty(e.target.value)} />
                <button type="button" className="btn small" disabled={!bulkWidth && !bulkQty} onClick={applyBulk}>Apply to all</button>
              </div>
              <div className="table">
                <div className="thead"><span>Design</span><span>Width</span><span>Height</span><span>Copies</span><span /></div>
                {gang.map((it) => (
                  <div className="trow" key={it.id}>
                    <div className="cellprint"><img src={it.src} alt="" className="thumb checker" /><span className="ellipsis">{it.label}</span></div>
                    <input aria-label={`Width of ${it.label} in inches`} className="input sm" type="number" step="0.25" value={it.widthIn} onChange={(e) => update(it.id, { widthIn: Number(e.target.value) || 0.5 })} />
                    <input aria-label={`Height of ${it.label} in inches`} className="input sm" type="number" step="0.25" value={it.heightIn} onChange={(e) => update(it.id, { heightIn: Number(e.target.value) || 0.5 })} />
                    <div className="qty">
                      <button type="button" aria-label="Fewer" onClick={() => update(it.id, { qty: Math.max(0, it.qty - 1) })}>−</button>
                      <span>{it.qty}</span>
                      <button type="button" aria-label="More" onClick={() => update(it.id, { qty: it.qty + 1 })}>+</button>
                    </div>
                    <button type="button" className="link" onClick={() => setGang((g) => g.filter((x) => x.id !== it.id))}>Remove</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="card">
          <h3>Sheet options</h3>
          <div className="opts">
            <button type="button" className={`opt ${opts.spares ? 'on' : ''}`} onClick={() => setOpts({ spares: !opts.spares })}><strong>Add 1 spare per design</strong><span>Covers a misprint</span></button>
            <button type="button" className={`opt ${opts.rotate ? 'on' : ''}`} onClick={() => setOpts({ rotate: !opts.rotate })}><strong>Rotate to fit</strong><span>Turns designs that are too wide</span></button>
            <button type="button" className={`opt ${opts.precut ? 'on' : ''}`} onClick={() => setOpts({ precut: !opts.precut })}><strong>Pre-cut on Teneth</strong><span>Reg marks + cut.plt</span></button>
            <div className="opt static">
              <strong>Space between designs</strong>
              <div className="pills">
                {[0.125, 0.25, 0.5].map((g) => (
                  <button key={g} type="button" className={`pill sm ${opts.gapIn === g ? 'on' : ''}`} onClick={() => setOpts({ gapIn: g })}>{g}&quot;</button>
                ))}
              </div>
            </div>
          </div>
          <label className="field"><span className="lbl">Customer (goes on the sheet label and file names)</span><input className="input" value={customer} placeholder="Customer" onChange={(e) => setCustomer(e.target.value)} /></label>
        </div>
      </section>

      <aside className="col">
        <div className="card">
          <div className="bar">
            <h3 className="nomargin">Gang sheet</h3>
            <span className="mono accent">{SHEET_WIDTH_IN}&quot; wide{result.sheets.length > 1 ? ` · ${result.sheets.length} sheets` : ''}</span>
          </div>
          <p className="muted small nomargin">Up to {MAX_SHEET_LENGTH_IN}&quot; of art per sheet; more starts the next sheet.</p>
          {result.tooWide.length > 0 && <p className="err">Too wide for a {SHEET_WIDTH_IN}&quot; sheet: {result.tooWide.join(', ')}</p>}
          {result.tooTallToCut.length > 0 && <p className="err">Taller than 20&quot;, can&apos;t be cut in one pass: {result.tooTallToCut.join(', ')}</p>}
          <div className="sheets">
            {result.sheets.length === 0 ? <p className="muted">Nothing to lay out yet.</p> : result.sheets.map((s) => (
              <div key={s.index} className="sheetwrap">
                <span className="muted small">Sheet {s.index} of {s.count} · {SHEET_WIDTH_IN}&quot; × {s.lengthIn}&quot; · {s.pieces.length} prints</span>
                <SheetPreview sheet={s} precut={opts.precut} label={sheetJobName(customer, s.artLengthIn, stamp, nameFor(s))} />
              </div>
            ))}
          </div>
          <div className="stats">
            <div><span>Prints</span><strong>{prints}</strong></div>
            <div><span>Total length</span><strong>{totalLen}&quot;</strong></div>
            <div><span>Film used</span><strong>{totalLen ? Math.round((100 * used) / (SHEET_WIDTH_IN * totalLen)) : 0}%</strong></div>
          </div>
          {busy && <p className="muted small">{busy}</p>}
          {msg && <p className="err">{msg}</p>}
          <button type="button" className="btn primary" disabled={!result.sheets.length || !!busy} onClick={downloadAll}>
            Download {opts.precut ? 'CMYK TIFF + cut.plt' : 'CMYK TIFF'}{result.sheets.length > 1 ? ` (${result.sheets.length} sheets)` : ''}
          </button>
          {opts.precut && <button type="button" className="btn" disabled={!result.sheets.length} onClick={() => setTab('cutter')}>Open in cutter</button>}
        </div>
      </aside>
    </div>
  )
}
