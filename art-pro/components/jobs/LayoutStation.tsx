'use client'
import { useEffect, useRef, useState } from 'react'
import { downloadBlob, loadImage } from '@/lib/image'
import { softProofCanvas } from '@/lib/cmyk'
import { cmykTiffFromCanvas } from '@/lib/tiff'
import { pxOf, srcOf, type Job, type Media } from '@/lib/jobs'
import { renderArt } from '@/lib/render'

export type Preset = { label: string; w: number; h: number; dpi: number; bleed: number }
export const PRESETS: Record<string, Preset[]> = {
  cards: [{ label: 'Business card 3.5×2', w: 3.5, h: 2, dpi: 300, bleed: 0.125 }, { label: 'Vertical 2×3.5', w: 2, h: 3.5, dpi: 300, bleed: 0.125 }],
  flyer: [{ label: 'Letter 8.5×11', w: 8.5, h: 11, dpi: 300, bleed: 0.125 }, { label: 'Half 5.5×8.5', w: 5.5, h: 8.5, dpi: 300, bleed: 0.125 }, { label: 'Tabloid 11×17', w: 11, h: 17, dpi: 300, bleed: 0.125 }],
  banner: [{ label: "2×4 ft", w: 48, h: 24, dpi: 100, bleed: 0 }, { label: "3×6 ft", w: 72, h: 36, dpi: 100, bleed: 0 }, { label: "4×8 ft", w: 96, h: 48, dpi: 100, bleed: 0 }, { label: "3×10 ft", w: 120, h: 36, dpi: 80, bleed: 0 }],
  other: [{ label: '8×10', w: 8, h: 10, dpi: 300, bleed: 0.125 }, { label: '11×14', w: 11, h: 14, dpi: 300, bleed: 0.125 }, { label: '18×24 poster', w: 18, h: 24, dpi: 150, bleed: 0.125 }],
}

type Props = { job: Job; setMedia: (m: Media) => void; setQty: (q: number | null) => void; goBack: () => void; finish: () => void }

export default function LayoutStation(p: Props) {
  const { job } = p
  const presets = PRESETS[job.job_type] || PRESETS.other
  const m: Media = job.data.media || { ...presets[0], bg: '#ffffff', fill: 90, design: 1 }
  const d = job.data.designs.find((x) => x.n === m.design) || job.data.designs[0]
  const ref = useRef<HTMLCanvasElement>(null)
  const [busy, setBusy] = useState('')
  const set = (patch: Partial<Media>) => p.setMedia({ ...m, ...patch })

  // Art box inside the safe area, keeping the art's proportions.
  const [pw, ph] = d ? pxOf(d) : [1, 1]
  const boxW = (m.w * m.fill) / 100, boxH = (m.h * m.fill) / 100
  const artW = Math.min(boxW, (boxH * pw) / ph)
  const artDpi = Math.round(pw / artW)
  const need = m.dpi >= 300 ? 150 : 72

  async function compose(dpi: number, withBleed: boolean) {
    const bleed = withBleed ? m.bleed : 0
    const W = Math.round((m.w + 2 * bleed) * dpi), H = Math.round((m.h + 2 * bleed) * dpi)
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const ctx = c.getContext('2d')!
    ctx.fillStyle = m.bg
    ctx.fillRect(0, 0, W, H)
    if (d) {
      const r = await renderArt(srcOf(d), pxOf(d), { widthIn: artW, dpi, knockout: d.knockout, halftone: d.halftone, hardAlpha: false })
      const img = await loadImage(r.url)
      ctx.drawImage(img, (W - r.px[0]) / 2, (H - r.px[1]) / 2)
    }
    return c
  }

  useEffect(() => {
    let off = false
    const dpi = Math.min(m.dpi, 700 / Math.max(m.w, m.h))
    compose(dpi, false).then(async (c) => {
      await softProofCanvas(c)
      if (off || !ref.current) return
      ref.current.width = c.width
      ref.current.height = c.height
      ref.current.getContext('2d')!.drawImage(c, 0, 0)
    }).catch(() => {})
    return () => { off = true }
  }, [JSON.stringify(m), d?.fixed, d?.knockout, d?.halftone?.mode]) // eslint-disable-line react-hooks/exhaustive-deps

  async function download() {
    try {
      setBusy('Building the print file…')
      const c = await compose(m.dpi, true)
      const blob = await cmykTiffFromCanvas(c, m.dpi, false, (f) => setBusy(`Converting to CMYK… ${Math.round(f * 100)}%`))
      downloadBlob(blob, `${job.customer || 'Customer'} #${job.number} ${m.w}x${m.h}${m.bleed ? ' bleed' : ''} CMYK.tif`)
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="layout">
      <div className="mockgrid">
        <div className="mockstage">
          <canvas ref={ref} className="layoutcanvas" aria-label="Layout preview" />
          <span className="muted small center">{m.w}″ × {m.h}″{m.bleed ? ` + ${m.bleed}″ bleed` : ''} · prints at {m.dpi} DPI · CMYK GRACoL 2013</span>
        </div>
        <div className="stepsbox">
          <div className="astep">
            <h4><i>1</i>Size</h4>
            <div className="pills">{presets.map((x) => <button key={x.label} type="button" className={`pill sm ${m.w === x.w && m.h === x.h ? 'on' : ''}`} onClick={() => set({ w: x.w, h: x.h, dpi: x.dpi, bleed: x.bleed })}>{x.label}</button>)}</div>
            <div className="row3">
              <label className="field"><span className="lbl">Width (in)</span><input className="input" type="number" min="1" step="0.5" value={m.w} onChange={(e) => set({ w: Math.max(1, Number(e.target.value) || m.w) })} /></label>
              <label className="field"><span className="lbl">Height (in)</span><input className="input" type="number" min="1" step="0.5" value={m.h} onChange={(e) => set({ h: Math.max(1, Number(e.target.value) || m.h) })} /></label>
            </div>
          </div>
          <div className="astep">
            <h4><i>2</i>Art</h4>
            {job.data.designs.length > 1 && (
              <div className="pills">{job.data.designs.map((x) => <button key={x.id} type="button" className={`pill sm ${x.n === d?.n ? 'on' : ''}`} onClick={() => set({ design: x.n })}>#{x.n}</button>)}</div>
            )}
            <label className="field"><span className="lbl">Art size: {m.fill}% of the {job.job_type === 'banner' ? 'banner' : 'page'}</span><input type="range" min={30} max={100} step={5} value={m.fill} onChange={(e) => set({ fill: Number(e.target.value) })} /></label>
            <label className="field"><span className="lbl">Background color</span><input className="input" type="color" value={m.bg} onChange={(e) => set({ bg: e.target.value })} /></label>
            <p className={artDpi >= need ? 'ok' : 'warn'}>Art prints {artW.toFixed(1)}″ wide at {artDpi} DPI{artDpi < need && <> · <button type="button" className="link" onClick={p.goBack}>back to Artwork to upscale</button></>}</p>
          </div>
          <div className="astep">
            <h4><i>3</i>Quantity</h4>
            <input className="input" type="number" min="0" value={job.data.qty ?? ''} placeholder="How many?" onChange={(e) => p.setQty(e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value))))} />
          </div>
          {busy && <p className="muted small">{busy}</p>}
          <button type="button" className="btn primary" disabled={!d || !!busy} onClick={download}>Download print file (CMYK TIFF)</button>
        </div>
      </div>
      <div className="nextbar">
        <span className="muted">Download the print file, then mark the job done.</span>
        <button type="button" className="btn" onClick={p.finish}>Mark job done ✓</button>
      </div>
    </div>
  )
}
