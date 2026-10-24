'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { GARMENTS, GROUPS, PRODUCTS } from '@/lib/catalog'
import { canvasToBlob, downloadBlob, preparePrint, withDpi } from '@/lib/image'
import { cmykTiffFromUrl } from '@/lib/tiff'
import { drawMockup } from '@/lib/mockup'
import { SHEET_WIDTH_IN } from '@/lib/sheet-size'
import { uid, useStore } from './store'

type Prepared = { url: string; blob: Blob; widthIn: number; heightIn: number; px: [number, number] }

export default function JobTab() {
  const { approve, setTab, customer, setCustomer } = useStore()
  const [productId, setProductId] = useState('tee')
  const product = PRODUCTS.find((p) => p.id === productId)!
  const [sizeIdx, setSizeIdx] = useState(0)
  const [custom, setCustom] = useState<{ w: number; h: number } | null>(null)
  const [garment, setGarment] = useState('black')
  const [qty, setQty] = useState(12)
  const [prompt, setPrompt] = useState('')
  const [file, setFile] = useState<{ name: string; url: string; w: number; h: number } | null>(null)
  const [knockout, setKnockout] = useState<'none' | 'black' | 'white'>('black')
  const [tolerance, setTolerance] = useState(24)
  const [cleanAlpha, setCleanAlpha] = useState(true)
  const [prepared, setPrepared] = useState<Prepared | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [view, setView] = useState<'mockup' | 'print'>('mockup')
  const [approvedNote, setApprovedNote] = useState('')
  const mockRef = useRef<HTMLCanvasElement>(null)
  const dropRef = useRef<HTMLLabelElement>(null)

  const size = custom ?? { w: product.sizes[Math.min(sizeIdx, product.sizes.length - 1)].w, h: product.sizes[Math.min(sizeIdx, product.sizes.length - 1)].h }
  const garmentHex = GARMENTS.find((g) => g.id === garment)?.hex ?? '#111113'

  useEffect(() => {
    setSizeIdx(0)
    setCustom(null)
    setPrepared(null)
    setKnockout(product.apparel ? (garment === 'white' ? 'white' : 'black') : 'none')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId])

  useEffect(() => {
    if (!mockRef.current) return
    drawMockup(mockRef.current, { product, garmentHex, artSrc: prepared?.url ?? file?.url, widthIn: prepared?.widthIn ?? size.w, heightIn: prepared?.heightIn ?? size.h }).catch(() => {})
  }, [product, garmentHex, prepared, file, size.w, size.h, view])

  function onFile(f: File | undefined) {
    if (!f) return
    if (!f.type.startsWith('image/')) {
      setError('Use a PNG, JPG or WEBP image for now. PDF, AI and PSD need the Adobe step (phase 2).')
      return
    }
    setError('')
    const url = URL.createObjectURL(f)
    const img = new Image()
    img.onload = () => setFile({ name: f.name, url, w: img.width, h: img.height })
    img.src = url
    setPrepared(null)
  }

  async function build() {
    if (!file) {
      setError('Drop a file first.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const out = await preparePrint(file.url, { widthIn: size.w, heightIn: size.h, knockout, tolerance, cleanAlpha })
      setPrepared(out)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong building the print file.')
    } finally {
      setBusy(false)
    }
  }

  async function downloadMockup() {
    if (!mockRef.current) return
    downloadBlob(await withDpi(await canvasToBlob(mockRef.current), 150), `${base()} mockup.png`)
  }

  function base() {
    const who = (customer || 'Customer').replace(/[\\/:*?"<>|]+/g, '-')
    return `${who} ${product.label.replace(/[\\/:*?"<>|()]+/g, '')} ${prepared ? `${prepared.widthIn.toFixed(2)}x${prepared.heightIn.toFixed(2)}` : ''}`.trim()
  }

  async function doApprove() {
    if (!prepared || !mockRef.current) return
    const mock = await canvasToBlob(mockRef.current, 'image/jpeg')
    const id = uid()
    approve({
      id,
      customer,
      productLabel: `${product.label}${product.apparel ? ` · ${GARMENTS.find((g) => g.id === garment)?.name}` : ''}`,
      garment,
      mockupUrl: URL.createObjectURL(mock),
      printUrl: prepared.url,
      widthIn: prepared.widthIn,
      heightIn: prepared.heightIn,
      qty,
      approvedAt: new Date().toLocaleString(),
    })
    setApprovedNote(`Approved. ${qty} prints added to the gang sheet.`)
  }

  const dpiNote = useMemo(() => {
    if (!file) return ''
    const dpi = Math.min(file.w / size.w, file.h / size.h)
    return dpi >= 290 ? `${Math.round(dpi)} DPI at this size: good` : `${Math.round(dpi)} DPI at this size: low, will look soft. Upscale before printing.`
  }, [file, size.w, size.h])

  return (
    <div className="grid3">
      <section className="col">
        <div className="card">
          <h3><span className="step">1</span>What are you building?</h3>
          <label className="lbl" htmlFor="product">Product</label>
          <select id="product" className="select" value={productId} onChange={(e) => setProductId(e.target.value)}>
            {GROUPS.map((g) => (
              <optgroup key={g} label={g}>
                {PRODUCTS.filter((p) => p.group === g).map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <span className="lbl">Size</span>
          <div className="pills">
            {product.sizes.map((s, i) => (
              <button key={s.label} type="button" className={`pill ${!custom && i === sizeIdx ? 'on' : ''}`} onClick={() => { setCustom(null); setSizeIdx(i) }}>{s.label}</button>
            ))}
            <button type="button" className={`pill ${custom ? 'on' : ''}`} onClick={() => setCustom({ w: size.w, h: size.h })}>Custom</button>
          </div>
          {custom && (
            <div className="row2">
              <label className="field"><span className="lbl">Max width (in)</span><input className="input" type="number" step="0.25" min="0.5" value={custom.w} onChange={(e) => setCustom({ ...custom, w: Number(e.target.value) || 1 })} /></label>
              <label className="field"><span className="lbl">Max height (in)</span><input className="input" type="number" step="0.25" min="0.5" value={custom.h} onChange={(e) => setCustom({ ...custom, h: Number(e.target.value) || 1 })} /></label>
            </div>
          )}
          {product.apparel && (
            <>
              <span className="lbl">Garment · {GARMENTS.find((g) => g.id === garment)?.name}</span>
              <div className="pills">
                {GARMENTS.map((g) => (
                  <button key={g.id} type="button" aria-label={g.name} className={`swatch ${g.id === garment ? 'on' : ''}`} style={{ background: g.hex }} onClick={() => setGarment(g.id)} />
                ))}
              </div>
            </>
          )}
          <div className="row2">
            <label className="field"><span className="lbl">Quantity</span><input className="input" type="number" min="1" value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} /></label>
            <label className="field"><span className="lbl">Customer</span><input className="input" type="text" value={customer} placeholder="Walk-in" onChange={(e) => setCustomer(e.target.value)} /></label>
          </div>
        </div>

        <div className="card">
          <h3><span className="step">2</span>Drop the files</h3>
          <label
            ref={dropRef}
            className="drop"
            onDragOver={(e) => { e.preventDefault(); dropRef.current?.classList.add('over') }}
            onDragLeave={() => dropRef.current?.classList.remove('over')}
            onDrop={(e) => { e.preventDefault(); dropRef.current?.classList.remove('over'); onFile(e.dataTransfer.files[0]) }}
          >
            <input type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
            <strong>Drag a file here or browse</strong>
            <span className="muted small">PNG, JPG or WEBP · phone photos OK</span>
          </label>
          {file && (
            <div className="filechip">
              <span className="tag">IMG</span>
              <div className="grow">
                <div className="ellipsis">{file.name}</div>
                <div className="muted small">{file.w} × {file.h} px · {dpiNote}</div>
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <h3><span className="step">3</span><label htmlFor="prompt">Tell Art Pro what you need</label></h3>
          <textarea id="prompt" className="input area" rows={3} placeholder={product.ask} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          <span className="lbl">Knock out</span>
          <div className="pills">
            {(['none', 'black', 'white'] as const).map((k) => (
              <button key={k} type="button" className={`pill ${knockout === k ? 'on' : ''}`} onClick={() => setKnockout(k)}>{k === 'none' ? 'Keep background' : `Remove ${k}`}</button>
            ))}
          </div>
          {knockout !== 'none' && (
            <label className="field"><span className="lbl">How close to {knockout} counts: {tolerance}</span><input type="range" min="0" max="120" value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} /></label>
          )}
          <label className="check"><input type="checkbox" checked={cleanAlpha} onChange={(e) => setCleanAlpha(e.target.checked)} />Solid or clear only (no see-through haze)</label>
          {error && <p className="err">{error}</p>}
          <button type="button" className="btn primary" onClick={build} disabled={busy}>{busy ? 'Building…' : `Build ${product.label.toLowerCase()}`}</button>
          <p className="muted small">The prompt is saved with the job. AI and Adobe steps (redraw, upscale, generative fill) are phase 2.</p>
        </div>
      </section>

      <section className="col wide">
        <div className="card">
          <div className="bar">
            <h3 className="nomargin">{product.label}</h3>
            <span className="mono chip">{prepared ? `${prepared.widthIn.toFixed(2)} × ${prepared.heightIn.toFixed(2)} in` : `${size.w} × ${size.h} in`}</span>
            <div className="seg">
              <button type="button" className={view === 'mockup' ? 'on' : ''} onClick={() => setView('mockup')}>Mockup</button>
              <button type="button" className={view === 'print' ? 'on' : ''} onClick={() => setView('print')}>Print file</button>
            </div>
          </div>
          <div className="stage">
            <canvas ref={mockRef} className="mock" style={{ display: view === 'mockup' ? 'block' : 'none' }} />
            {view === 'print' && (prepared ? <img src={prepared.url} alt="Print file" className="checker printimg" /> : <p className="muted">Build the job to see the print file.</p>)}
          </div>
          <div className="actions">
            <button type="button" className="btn" disabled={!prepared} onClick={async () => prepared && downloadBlob(await cmykTiffFromUrl(prepared.url, 300), `${base()} CMYK.tif`)}>Download print file (CMYK TIFF)</button>
            <button type="button" className="btn" onClick={downloadMockup}>Download mockup</button>
            {product.gangable && (
              <button type="button" className="btn primary" disabled={!prepared} onClick={doApprove}>Approve → gang sheet</button>
            )}
          </div>
          {approvedNote && (
            <p className="ok">{approvedNote} <button type="button" className="link" onClick={() => setTab('gang')}>Open gang sheet</button></p>
          )}
        </div>
      </section>

      <aside className="col">
        <div className="card">
          <h3>Print specs</h3>
          <dl className="specs">
            <div><dt>Size</dt><dd>{size.w} × {size.h} in</dd></div>
            {product.specs.map(([k, v]) => (
              <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
        </div>
        <div className="card">
          <h3>Pipeline</h3>
          <ol className="steps">
            <li className={file ? 'done' : ''}>Upload art</li>
            <li className={knockout !== 'none' ? 'done' : ''}>Knock out {knockout === 'none' ? '(off)' : knockout}</li>
            <li className={prepared ? 'done' : ''}>Size to {size.w}" at 300 DPI</li>
            <li className={prepared ? 'done' : ''}>Mockup on {product.apparel ? 'garment' : 'product'}</li>
            {product.gangable && <li>Approve → gang sheet ({SHEET_WIDTH_IN}")</li>}
          </ol>
        </div>
      </aside>
    </div>
  )
}
