'use client'
import { useEffect, useRef, useState } from 'react'
import { JOB_TYPES, artworkDone, pxOf, srcOf, type Job, type JobDesign, type Step } from '@/lib/jobs'
import { renderArt, sharpWidth } from '@/lib/render'
import type { Knockout } from '@/lib/knockout'
import type { HalftoneMode } from '@/lib/halftone'
import type { AiTools } from '@/lib/ai-image'
import { downloadBlob } from '@/lib/image'
import { softProofUrl } from '@/lib/cmyk'
import { cmykTiffFromUrl } from '@/lib/tiff'
import ProofTools, { bgName } from './ProofTools'

type Props = {
  job: Job
  working: Record<string, string>
  tools: AiTools
  patchDesign: (id: string, p: Partial<JobDesign>) => void
  setStep: (id: string, step: keyof JobDesign['steps'], v: Step) => void
  removeDesign: (id: string) => void
  addFiles: (files: File[]) => void
  createArt: (prompt: string) => void
  upscale: (id: string) => void
  redraw: (id: string, instructions: string) => void
  next: () => void
  nextLabel: string
}

const KO: { v: Knockout; label: string }[] = [
  { v: 'none', label: 'Keep background' },
  { v: 'white', label: 'Remove white (outside)' },
  { v: 'black', label: 'Remove black (outside)' },
  { v: 'white-all', label: 'Remove all white' },
  { v: 'black-all', label: 'Remove all black' },
]
const HT: { v: HalftoneMode | 'off'; label: string; hint: string }[] = [
  { v: 'off', label: 'No halftone', hint: 'Solid print' },
  { v: 'dark', label: 'Dark shirts', hint: 'Darks drop into the shirt' },
  { v: 'light', label: 'Light shirts', hint: 'Lights drop out' },
  { v: 'fade', label: 'Soft edges only', hint: 'Glows & shadows to dots' },
]
const BG_LABEL = { transparent: 'already transparent', white: 'white background', black: 'black background', photo: 'photo / busy background' }

export default function ArtworkStation(p: Props) {
  const { job } = p
  const designs = job.data.designs
  const [selId, setSelId] = useState<string | null>(designs[0]?.id || null)
  const sel = designs.find((d) => d.id === selId) || designs[0]
  const [preview, setPreview] = useState<{ url: string; key: string } | null>(null)
  const [rendering, setRendering] = useState(false)
  const [bg, setBg] = useState('#808080')
  const [zoom, setZoom] = useState(1)
  const [dl, setDl] = useState('')
  const [instr, setInstr] = useState('')
  const [prompt, setPrompt] = useState('')
  const dropRef = useRef<HTMLLabelElement>(null)
  const info = JOB_TYPES[job.job_type]
  const previewWidth = Math.min(info.defaultWidth, 24)
  const busyNote = sel ? p.working[sel.id] : undefined

  useEffect(() => {
    if (!sel || busyNote) return
    let off = false
    const dpi = Math.max(20, Math.min(300, (1400 / previewWidth) * zoom))
    setRendering(true)
    renderArt(srcOf(sel), pxOf(sel), { widthIn: previewWidth, dpi, knockout: sel.knockout, halftone: sel.halftone, hardAlpha: false })
      .then(async (r) => { const u = await softProofUrl(r.url); if (!off) setPreview({ url: u, key: sel.id }) })
      .catch(() => {})
      .finally(() => { if (!off) setRendering(false) })
    return () => { off = true }
  }, [sel?.id, sel?.fixed, sel?.knockout, sel?.halftone?.mode, sel?.halftone?.lpi, busyNote, previewWidth, zoom]) // eslint-disable-line react-hooks/exhaustive-deps

  async function download(onBg: boolean) {
    if (!sel) return
    try {
      setDl('Building the 300 DPI file…')
      const w = sel.widthIn || previewWidth
      const r = await renderArt(srcOf(sel), pxOf(sel), { widthIn: w, dpi: 300, knockout: sel.knockout, halftone: sel.halftone, hardAlpha: !onBg })
      setDl('Converting to CMYK (GRACoL 2013)…')
      const blob = await cmykTiffFromUrl(r.url, 300, { background: onBg ? bg : undefined, onProgress: (f) => setDl(`Converting to CMYK… ${Math.round(f * 100)}%`) })
      const name = `${job.customer || 'Customer'} #${job.number} design ${sel.n} ${sel.name} ${w}in CMYK${onBg ? ' on ' + bgName(bg) : ''}.tif`
      downloadBlob(blob, name)
    } finally {
      setDl('')
    }
  }

  const allDone = designs.length > 0 && designs.every(artworkDone)
  const firstOpen = designs.find((d) => !artworkDone(d))
  const px = sel ? pxOf(sel) : ([0, 0] as [number, number])
  const sharp = sel ? sharpWidth(px) : 0
  const sharpEnough = sharp >= Math.min(previewWidth, 10.5)

  return (
    <div className="artwork">
      <div className="strip">
        {designs.map((d) => (
          <button key={d.id} type="button" className={`chipd ${d.id === sel?.id ? 'sel' : ''}`} onClick={() => setSelId(d.id)}>
            <span className={`dot ${p.working[d.id] ? 'work' : artworkDone(d) ? 'ok' : ''}`} />#{d.n} {d.name}
          </button>
        ))}
        <label
          ref={dropRef}
          className="chipd add"
          onDragOver={(e) => { e.preventDefault(); dropRef.current?.classList.add('over') }}
          onDragLeave={() => dropRef.current?.classList.remove('over')}
          onDrop={(e) => { e.preventDefault(); dropRef.current?.classList.remove('over'); p.addFiles(Array.from(e.dataTransfer.files)) }}
        >
          <input type="file" accept="image/*" multiple hidden onChange={(e) => { p.addFiles(Array.from(e.target.files || [])); e.target.value = '' }} />
          + Add art
        </label>
      </div>

      <div className="artgrid">
        <div className="stagecol">
        <div className={`graystage ${zoom > 1 ? 'zoomed' : ''}`} style={{ background: bg }}>
          {!sel && <p className="muted center">No art yet. Drop a file above, or describe new art on the right.</p>}
          {sel && (busyNote ? <p className="center strong">{busyNote}</p> : preview?.key === sel.id ? <img src={preview.url} alt={`Design ${sel.n}`} onLoad={(e) => { const st = e.currentTarget.parentElement; if (st) { st.scrollLeft = (st.scrollWidth - st.clientWidth) / 2; st.scrollTop = (st.scrollHeight - st.clientHeight) / 2 } }} /> : <p className="muted">Loading…</p>)}
          {sel && rendering && !busyNote && <span className="rendering">Updating…</span>}
          {sel && <span className="stageinfo">#{sel.n} · {px[0]}×{px[1]} px · shown at {previewWidth}″ wide on {bgName(bg)} · CMYK view</span>}
        </div>
        {sel && (
          <ProofTools bg={bg} setBg={setBg} zoom={zoom} setZoom={setZoom} busy={dl}
            downloads={[{ label: 'Download art (CMYK TIFF)', run: () => download(false) }, { label: 'Download on this background', run: () => download(true) }]} />
        )}
        </div>

        <div className="stepsbox">
          {sel ? (
            <>
              <div className={`astep ${sel.steps.fix !== 'todo' ? 'done' : ''}`}>
                <h4><i>1</i>Fix the art {sel.steps.fix !== 'todo' && <span className="okmark">✓</span>}</h4>
                <p className={sharpEnough ? 'ok' : 'warn'}>{sharpEnough ? `Sharp up to ${sharp}″ wide. Good for ${info.label.toLowerCase()}.` : `Only sharp up to ${sharp}″ wide. ${info.label} usually print ${previewWidth}″. Upscale it.`}</p>
                <div className="actions">
                  <button type="button" className="tool" disabled={!!busyNote || !p.tools.upscale} title={p.tools.upscale ? '' : 'Not switched on yet'} onClick={() => p.upscale(sel.id)}>AI upscale</button>
                  <button type="button" className="btn small" disabled={!!busyNote} onClick={() => p.setStep(sel.id, 'fix', 'done')}>Looks good</button>
                </div>
                <form className="aifix" onSubmit={(e) => { e.preventDefault(); if (busyNote || !p.tools.create) return; p.redraw(sel.id, instr.trim()); setInstr('') }}>
                  <label htmlFor="aifix-notes" className="small"><strong>Fix with AI (OpenAI)</strong></label>
                  <textarea id="aifix-notes" className="input" rows={3} value={instr} disabled={!!busyNote}
                    onChange={(e) => setInstr(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit() } }}
                    placeholder="What should it fix? e.g. fix the spelling, make the lines sharper, change red to blue. Leave empty for a clean redraw." />
                  <button type="submit" className="btn primary small" disabled={!!busyNote || !p.tools.create} title={p.tools.create ? '' : 'Not switched on yet'}>
                    {busyNote ? 'Working…' : 'Submit to OpenAI ▸'}
                  </button>
                </form>
              </div>

              <div className={`astep ${sel.steps.background !== 'todo' ? 'done' : ''}`}>
                <h4><i>2</i>Background {sel.steps.background !== 'todo' && <span className="okmark">✓</span>}</h4>
                <p className="muted small">Found: {BG_LABEL[sel.bg]}.</p>
                <div className="pills">
                  {KO.map((k) => (
                    <button key={k.v} type="button" className={`pill sm ${sel.knockout === k.v && sel.steps.background !== 'todo' ? 'on' : ''}`} disabled={!!busyNote} onClick={() => { p.patchDesign(sel.id, { knockout: k.v }); p.setStep(sel.id, 'background', 'done') }}>{k.label}</button>
                  ))}
                </div>
              </div>

              <div className={`astep ${sel.steps.halftone !== 'todo' ? 'done' : ''}`}>
                <h4><i>3</i>Halftone {sel.steps.halftone !== 'todo' && <span className="okmark">✓</span>}</h4>
                <div className="pills">
                  {HT.map((h) => {
                    const on = sel.steps.halftone !== 'todo' && (h.v === 'off' ? !sel.halftone : sel.halftone?.mode === h.v)
                    return (
                      <button key={h.v} type="button" className={`pill sm ${on ? 'on' : ''}`} title={h.hint} disabled={!!busyNote}
                        onClick={() => {
                          if (h.v === 'off') { p.patchDesign(sel.id, { halftone: null }); p.setStep(sel.id, 'halftone', 'skipped') }
                          else { p.patchDesign(sel.id, { halftone: { mode: h.v, lpi: sel.halftone?.lpi || 45, angle: 22.5 } }); p.setStep(sel.id, 'halftone', 'done') }
                        }}>{h.label}</button>
                    )
                  })}
                </div>
                {sel.halftone && (
                  <label className="field"><span className="lbl">Dot size: {sel.halftone.lpi} LPI (lower = bigger dots)</span>
                    <input type="range" min={25} max={65} step={5} value={sel.halftone.lpi} onChange={(e) => p.patchDesign(sel.id, { halftone: { ...sel.halftone!, lpi: Number(e.target.value) } })} />
                  </label>
                )}
              </div>
              <button type="button" className="link" onClick={() => { if (confirmRemove(sel.n)) { p.removeDesign(sel.id); setSelId(null) } }}>Remove #{sel.n}</button>
            </>
          ) : null}

          <div className="astep">
            <h4><i>+</i>Create new art with AI</h4>
            <input className="input" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder='Describe it. Put exact text in "quotes".' />
            <button type="button" className="tool" disabled={!p.tools.create || prompt.trim().length < 3} title={p.tools.create ? '' : 'Not switched on yet'} onClick={() => { p.createArt(prompt.trim()); setPrompt('') }}>Create art</button>
          </div>
        </div>
      </div>

      <div className="nextbar">
        <span className="muted">{allDone ? 'Artwork is ready.' : firstOpen ? `#${firstOpen.n} still needs: ${(['fix', 'background', 'halftone'] as const).filter((s) => firstOpen.steps[s] === 'todo').join(', ')}` : 'Add art to continue.'}</span>
        <button type="button" className="btn primary" disabled={!allDone || Object.keys(p.working).length > 0} onClick={p.next}>{p.nextLabel}</button>
      </div>
    </div>
  )
}

function confirmRemove(n: number) {
  return typeof window !== 'undefined' ? window.confirm(`Remove design #${n} from this job?`) : false
}
