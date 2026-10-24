'use client'
import { useEffect, useRef, useState } from 'react'
import { GILDAN_COLORS, PLACEMENT_BOX, QUICK_COLORS, VIEWS, type Placement } from '@/lib/garments'
import { recolorGarment } from '@/lib/recolor'
import { canvasToBlob, downloadBlob, withDpi } from '@/lib/image'
import { pxOf, srcOf, type Job, type JobDesign } from '@/lib/jobs'
import { renderArt } from '@/lib/render'

type Props = {
  job: Job
  patchDesign: (id: string, p: Partial<JobDesign>) => void
  setColor: (c: string) => void
  goBack: () => void
  next: () => void
  nextLabel: string
}

const PLACES: Placement[] = ['Front', 'Back', 'Left chest', 'Sleeve']
const PRESETS: Record<Placement, number[]> = { Front: [12, 11, 10.5, 9, 8], Back: [12, 11, 10.5, 9], 'Left chest': [4, 3.75, 3.5, 3], Sleeve: [3.5, 3, 2.5] }

export const placeOf = (d: JobDesign): Placement => d.place || (d.n === 2 ? 'Back' : 'Front')
/** Width in inches for a design at its placement: saved width, else fit the placement box. */
export function widthOf(d: JobDesign, garment: string): number {
  if (d.widthIn) return d.widthIn
  const [bw, bh] = (PLACEMENT_BOX[garment] || PLACEMENT_BOX.tee)[placeOf(d)]
  const [w, h] = pxOf(d)
  return Math.round(Math.min(bw, (bh * w) / h) * 100) / 100
}

export default function MockupStation(p: Props) {
  const { job } = p
  const designs = job.data.designs
  const garment = job.job_type === 'hoodie' ? 'hoodie' : 'tee'
  const color = GILDAN_COLORS.find((c) => c.name === job.data.color)
  const [view, setView] = useState<'front' | 'back'>('front')
  const ref = useRef<HTMLCanvasElement>(null)
  const views = VIEWS[garment]
  const hasBack = designs.some((d) => placeOf(d) === 'Back')

  useEffect(() => {
    const v = (views && (views[view] || views.front)) || null
    const canvas = ref.current
    if (!v || !canvas) return
    let off = false
    ;(async () => {
      const { garment: g, shade } = await recolorGarment(v.src, color?.hex || '#25282A')
      const arts = await Promise.all(
        designs
          .filter((d) => (view === 'back' ? placeOf(d) === 'Back' : placeOf(d) !== 'Back' && placeOf(d) !== 'Sleeve'))
          .map(async (d) => ({ d, r: await renderArt(srcOf(d), pxOf(d), { widthIn: widthOf(d, garment), dpi: 100, knockout: d.knockout, halftone: d.halftone, hardAlpha: true }) })),
      )
      if (off) return
      const S = 1.5
      canvas.width = g.width * S
      canvas.height = g.height * S
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#ECECEA'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(g, 0, 0, canvas.width, canvas.height)
      const art = document.createElement('canvas')
      art.width = canvas.width
      art.height = canvas.height
      const actx = art.getContext('2d')!
      for (const { d, r } of arts) {
        const img = new Image()
        img.src = r.url
        await img.decode().catch(() => {})
        if (off) return
        const w = r.widthIn * v.ppi * S, h = r.heightIn * v.ppi * S
        const cx = placeOf(d) === 'Left chest' ? (v.cx + 4 * v.ppi) * S : v.cx * S
        actx.drawImage(img, cx - w / 2, v.topY * S, w, h)
      }
      actx.globalCompositeOperation = 'source-atop'
      actx.drawImage(shade, 0, 0, art.width, art.height)
      ctx.globalAlpha = 0.97
      ctx.drawImage(art, 0, 0)
      ctx.globalAlpha = 1
    })().catch(() => {})
    return () => { off = true }
  }, [designs, color?.hex, view, garment]) // eslint-disable-line react-hooks/exhaustive-deps

  const missingQty = designs.some((d) => d.qty == null)
  const ready = !!color && !missingQty

  return (
    <div className="mockup">
      <div className="mockgrid">
        <div className="mockstage">
          {hasBack && views?.back && (
            <div className="seg">
              <button type="button" className={view === 'front' ? 'on' : ''} onClick={() => setView('front')}>Front</button>
              <button type="button" className={view === 'back' ? 'on' : ''} onClick={() => setView('back')}>Back</button>
            </div>
          )}
          <canvas ref={ref} className="mock" aria-label="Mockup" />
          <span className="muted small center">Gildan {garment === 'hoodie' ? '18500' : '5000'} · {color?.name || 'pick a color'} · shown at true print size</span>
          <button type="button" className="btn small" disabled={!color} onClick={async () => ref.current && downloadBlob(await withDpi(await canvasToBlob(ref.current), 150), `${job.customer || 'Customer'} #${job.number} mockup.png`)}>Download mockup</button>
        </div>

        <div className="stepsbox">
          <div className="astep">
            <h4><i>1</i>{garment === 'hoodie' ? 'Hoodie' : 'Shirt'} color</h4>
            <div className="pills">
              {QUICK_COLORS.map((c) => {
                const hex = GILDAN_COLORS.find((x) => x.name === c)!.hex
                return <button key={c} type="button" className={`pill sm ${job.data.color === c ? 'on' : ''}`} onClick={() => p.setColor(c)}><span className="sw" style={{ background: hex }} />{c}</button>
              })}
            </div>
            <select className="select" value={job.data.color || ''} onChange={(e) => p.setColor(e.target.value)} aria-label="All Gildan colors">
              <option value="" disabled>All 87 Gildan colors…</option>
              {GILDAN_COLORS.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </div>

          {designs.map((d) => {
            const place = placeOf(d)
            const w = widthOf(d, garment)
            const [pw, ph] = pxOf(d)
            const h = Math.round(((w * ph) / pw) * 100) / 100
            const dpi = Math.round(pw / w)
            return (
              <div key={d.id} className="astep">
                <h4><i>#{d.n}</i>{d.name}</h4>
                <div className="pills">
                  {PLACES.map((pl) => <button key={pl} type="button" className={`pill sm ${place === pl ? 'on' : ''}`} onClick={() => p.patchDesign(d.id, { place: pl, widthIn: undefined })}>{pl}</button>)}
                </div>
                <div className="row3">
                  <label className="field"><span className="lbl">Width (in)</span>
                    <input className="input" type="number" step="0.25" min="0.5" max="21.7" value={w} onChange={(e) => p.patchDesign(d.id, { place, widthIn: Math.max(0.5, Math.min(21.7, Number(e.target.value) || w)) })} />
                  </label>
                  <label className="field"><span className="lbl">How many</span>
                    <input className="input" type="number" min="0" value={d.qty ?? ''} placeholder="?" onChange={(e) => p.patchDesign(d.id, { qty: e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value))) })} />
                  </label>
                </div>
                <div className="pills">{PRESETS[place].map((x) => <button key={x} type="button" className={`pill sm ${w === x ? 'on' : ''}`} onClick={() => p.patchDesign(d.id, { place, widthIn: x })}>{x}″</button>)}</div>
                <p className={dpi >= 150 ? 'ok' : 'warn'}>{w}″ × {h}″ · {dpi} DPI {dpi >= 150 ? '· prints sharp' : dpi >= 100 ? '· prints soft' : '· too low-res'}{dpi < 150 && <> · <button type="button" className="link" onClick={p.goBack}>back to Artwork to upscale</button></>}</p>
              </div>
            )
          })}
        </div>
      </div>
      <div className="nextbar">
        <span className="muted">{!color ? 'Pick the garment color.' : missingQty ? 'Enter how many of each design.' : 'Mockup is ready.'}</span>
        <button type="button" className="btn primary" disabled={!ready} onClick={p.next}>{p.nextLabel}</button>
      </div>
    </div>
  )
}
