'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { analyzeArt, pngDpi, type Background } from '@/lib/autoprep'
import { PLACEMENT_BOX, VIEWS, type Placement } from '@/lib/garments'
import { recolorGarment } from '@/lib/recolor'
import { packGang } from '@/lib/pack'
import { drawSheet } from '@/lib/compose'
import { canvasToBlob, downloadBlob, loadImage } from '@/lib/image'
import { SHEET_WIDTH_IN } from '@/lib/sheet-size'
import { JOB_TYPES, STATION_LABEL, createJob, listJobs, nextStation, pxOf, saveJob, srcOf, thumbFrom, uploadImage, type Job, type JobData, type JobDesign, type JobRow, type JobType, type Media } from '@/lib/jobs'
import { aiStatus, type AiTools } from '@/lib/ai-image'
import { autofix } from '@/lib/autofix'
import type { HalftoneOptions } from '@/lib/halftone'
import type { Knockout } from '@/lib/knockout'
import { renderArt, sharpWidth } from '@/lib/render'
import { PRESETS as MEDIA } from './LayoutStation'
import { uid } from '../store'
import ProofTools, { bgName } from './ProofTools'
import { softProofUrl } from '@/lib/cmyk'
import { cmykTiffFromUrl } from '@/lib/tiff'
import { jobFromOrder, mpOrders } from '@/lib/mp-client'
import type { MpOrderRow } from '@/lib/mp-types'

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`
}

type Pipeline = { clean: boolean; knockout: boolean; halftone: boolean }

/** Builds job designs from dropped files: uploads the originals and reads size + background. */
export async function designsFromFiles(jobId: string, type: JobType, files: File[], startN: number, onStatus: (s: string) => void, opts: { pipeline?: Pipeline; widthIn?: number; place?: Placement; qty?: number | null; knockoutWhite?: boolean } = {}) {
  const pl = opts.pipeline || { clean: true, knockout: true, halftone: true }
  const out: JobDesign[] = []
  for (const [i, f] of files.entries()) {
    onStatus(`Saving ${f.name} (${i + 1} of ${files.length})…`)
    const local = URL.createObjectURL(f)
    const info = await analyzeArt(local).catch(() => null)
    if (!info) continue
    const fileDpi = await pngDpi(f)
    const url = await uploadImage(jobId, f.name.replace(/\.[^.]+$/, ''), f)
    const px: [number, number] = [info.w, info.h]
    const target = opts.widthIn || Math.min(JOB_TYPES[type].defaultWidth, 10.5)
    const sharp = sharpWidth(px) >= target || (fileDpi != null && fileDpi >= 150 && type === 'dtf')
    const fileWidth = fileDpi && fileDpi >= 150 && fileDpi <= 1200 ? Math.min(21.7, Math.round((info.w / fileDpi) * 100) / 100) : undefined
    out.push({
      id: uid(), n: startN + out.length, name: f.name.replace(/\.[^.]+$/, ''), original: url, originalPx: px, bg: info.bg,
      knockout: opts.knockoutWhite ? 'white' : info.bg === 'white' ? 'white' : info.bg === 'black' ? 'black' : 'none',
      halftone: null,
      steps: {
        fix: !pl.clean || sharp ? 'done' : 'todo',
        background: !pl.knockout || info.bg === 'transparent' ? 'done' : 'todo',
        halftone: pl.halftone ? 'todo' : 'skipped',
      },
      widthIn: opts.widthIn ?? fileWidth,
      place: opts.place,
      qty: opts.qty ?? null,
    })
  }
  return out
}

// ---------- product presets ----------
type SizeOpt = { label: string; sheet?: number | null; width?: number; place?: Placement; media?: Omit<Media, 'bg' | 'fill' | 'design'> }
function sizesFor(t: JobType): SizeOpt[] {
  if (t === 'dtf') return [{ label: '22.3″ × 24″', sheet: 24 }, { label: '22.3″ × 60″', sheet: 60 }, { label: '22.3″ × 120″', sheet: 120 }, { label: 'Custom length', sheet: null }]
  if (t === 'sticker') return [{ label: '2″ stickers', width: 2 }, { label: '3″ stickers', width: 3 }, { label: '4″ stickers', width: 4 }, { label: 'Custom size', width: 0 }]
  if (t === 'tee') return [{ label: 'Full front 10.5″', width: 10.5, place: 'Front' }, { label: 'Oversized 12″', width: 12, place: 'Front' }, { label: 'Left chest 3.75″', width: 3.75, place: 'Left chest' }, { label: 'Youth 8″', width: 8, place: 'Front' }, { label: 'Full back 12″', width: 12, place: 'Back' }]
  if (t === 'hoodie') return [{ label: 'Full front 10.5″', width: 10.5, place: 'Front' }, { label: 'Left chest 3.75″', width: 3.75, place: 'Left chest' }, { label: 'Full back 12″', width: 12, place: 'Back' }]
  return [...(MEDIA[t] || MEDIA.other).map((m) => ({ label: m.label, media: { w: m.w, h: m.h, dpi: m.dpi, bleed: m.bleed } })), { label: 'Custom size', media: { w: 0, h: 0, dpi: 300, bleed: 0.125 } }]
}
const CHIPS: Record<'apparel' | 'dtf' | 'print', string[]> = {
  dtf: ['Fill the sheet', 'Knock out white', 'Clean edges'],
  apparel: ['Halftone for a black shirt', 'Knock out white', 'Clean edges'],
  print: ['White background', 'Make the art fill it', 'Clean edges'],
}
const BUILD: Record<string, string> = { dtf: 'Build gang sheet', sticker: 'Build sticker sheet', tee: 'Build T-shirt job', hoodie: 'Build hoodie job', cards: 'Build business cards', flyer: 'Build flyer', banner: 'Build banner', other: 'Build job' }
const BG_LABEL: Record<Background, string> = { transparent: 'transparent', white: 'white background', black: 'black background', photo: 'photo background' }

type Picked = { file: File; url: string; w: number; h: number; bg: Background; dpi: number | null }
/** One piece of art for the preview: a dropped file (before the fix) or a fixed job design (after). */
type Art = { key: string; name: string; src: string; w: number; h: number; dpi: number | null; ko: Knockout; ht: HalftoneOptions | null; widthIn?: number }

export default function JobsHome({ onOpen }: { onOpen: (id: string) => void }) {
  const [type, setType] = useState<JobType>('dtf')
  const [sizeIdx, setSizeIdx] = useState(0)
  const [custom, setCustom] = useState<{ len: number; w: number; h: number; width: number }>({ len: 36, w: 24, h: 18, width: 3 })
  const [qty, setQty] = useState<number | ''>(12)
  const [customer, setCustomer] = useState('')
  const [files, setFiles] = useState<Picked[]>([])
  const [note, setNote] = useState('')
  const [pipe, setPipe] = useState<Pipeline>({ clean: true, knockout: true, halftone: true })
  const [tab, setTab] = useState<'proof' | 'print' | 'mockup'>('proof')
  const [busy, setBusy] = useState('')
  const [bg, setBg] = useState('#ffffff')
  const [zoom, setZoom] = useState(1)
  const [dl, setDl] = useState('')
  const [err, setErr] = useState('')
  const [jobs, setJobs] = useState<JobRow[] | null>(null)
  const [mp, setMp] = useState<MpOrderRow[] | null>(null)
  const [tools, setTools] = useState<AiTools>({ create: false, upscale: false })
  const [fixed, setFixed] = useState<{ job: Job; log: string[]; reply: string } | null>(null)
  const jobRef = useRef<Job | null>(null)
  const dropRef = useRef<HTMLLabelElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const info = JOB_TYPES[type]
  const group = info.group
  const sizes = sizesFor(type)
  const size = sizes[Math.min(sizeIdx, sizes.length - 1)]
  const isCustom = size.label.startsWith('Custom')
  const sheetLen = type === 'dtf' ? (isCustom ? custom.len : size.sheet ?? null) : null
  const printWidth = size.width === 0 ? custom.width : size.width
  const media = size.media ? (isCustom ? { ...size.media, w: custom.w, h: custom.h } : size.media) : undefined
  const sizeChip = type === 'dtf' ? `${SHEET_WIDTH_IN}″ × ${sheetLen}″` : media ? `${media.w}″ × ${media.h}″` : `${printWidth}″ wide`

  useEffect(() => {
    listJobs('open').then(setJobs).catch(() => setJobs([]))
    aiStatus().then(setTools)
    mpOrders().then(setMp).catch(() => setMp(null))
  }, [])
  // Any change to the inputs means the art needs fixing again.
  useEffect(() => { setFixed(null) }, [type, sizeIdx, files.length, pipe.clean, pipe.knockout, pipe.halftone])
  useEffect(() => { setSizeIdx(0); setBg(JOB_TYPES[type].group === 'apparel' ? '#808080' : '#ffffff'); if (JOB_TYPES[type].group !== 'apparel' && tab === 'mockup') setTab('proof') }, [type]) // eslint-disable-line react-hooks/exhaustive-deps

  async function add(list: File[]) {
    const imgs = list.filter((f) => f.type.startsWith('image/'))
    for (const f of imgs) {
      const url = URL.createObjectURL(f)
      const a = await analyzeArt(url).catch(() => null)
      if (!a) continue
      const dpi = await pngDpi(f)
      setFiles((fs) => [...fs, { file: f, url, w: a.w, h: a.h, bg: a.bg, dpi }])
    }
  }

  // Width each file would print at for this product (for the status line and the proof).
  const widthFor = (p: { w: number; h: number; dpi: number | null; widthIn?: number }) => {
    if (p.widthIn) return p.widthIn
    if (group === 'apparel' || type === 'sticker') return printWidth || 10.5
    if (media) return Math.min(media.w * 0.9, (media.h * 0.9 * p.w) / p.h)
    if (p.dpi && p.dpi >= 150 && p.dpi <= 1200) return Math.min(21.7, p.w / p.dpi)
    return Math.min(10.5, 21.7)
  }
  const statusOf = (p: Picked) => {
    const dpi = Math.round(p.w / widthFor(p))
    if (dpi >= 150) return { label: 'Print-ready', cls: 'ok', dpi }
    if (dpi >= 100) return { label: pipe.clean ? 'Soft · will upscale' : 'Prints soft', cls: 'warn', dpi }
    return { label: pipe.clean ? 'Low-res · will upscale' : 'Too low-res', cls: 'warn', dpi }
  }

  // Preview art with the background already knocked out (when that step is on).
  const ko = (p: Picked) => (!pipe.knockout ? 'none' : p.bg === 'white' || /knock ?out white/i.test(note) ? 'white' : p.bg === 'black' ? 'black' : 'none') as 'none' | 'white' | 'black'
  const arts: Art[] = fixed
    ? fixed.job.data.designs.map((d) => ({ key: d.id + (d.fixed || ''), name: d.name, src: srcOf(d), w: pxOf(d)[0], h: pxOf(d)[1], dpi: null, ko: d.knockout, ht: d.halftone, widthIn: d.widthIn }))
    : files.map((f) => ({ key: f.url, name: f.file.name, src: f.url, w: f.w, h: f.h, dpi: f.dpi, ko: ko(f), ht: null }))
  const prev = (a: Art, widthIn: number, dpi: number) => renderArt(a.src, [a.w, a.h], { widthIn, dpi, knockout: a.ko, halftone: a.ht, hardAlpha: false }).then((r) => softProofUrl(r.url))

  // ---------- proof / print file / mockup preview ----------
  const sig = JSON.stringify([type, sizeChip, qty, tab, arts.map((a) => [a.key, a.ko, a.ht?.mode, a.ht?.lpi]), printWidth, bg, zoom])
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    let off = false
    ;(async () => {
      const ctx = c.getContext('2d')!
      const checker = tab === 'print'
      if (group === 'dtf') {
        if (!arts.length) return placeholder(c, SHEET_WIDTH_IN, sheetLen || 24)
        const items = await Promise.all(arts.map(async (f, i) => { const w = widthFor(f); return { id: String(i), label: f.name, src: await prev(f, w, Math.min(300, 40 * zoom)), widthIn: w, heightIn: (w * f.h) / f.w, qty: Number(qty) || 1 } }))
        const r = packGang(items, { precut: type === 'sticker', gapIn: 0.25, spares: false, rotate: true, maxLengthIn: sheetLen || undefined })
        const s = r.sheets[0]
        if (!s || off) return
        const k = Math.min(30, 560 / Math.max(SHEET_WIDTH_IN, s.lengthIn)) * zoom
        await drawSheet(c, s, { pxPerIn: k, precut: type === 'sticker', label: `${customer || 'Customer'} · proof`, preview: true })
        if (!checker) { ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height); ctx.globalCompositeOperation = 'source-over' }
        return
      }
      if (group === 'apparel' && tab === 'mockup') {
        const garment = type === 'hoodie' ? 'hoodie' : 'tee'
        const view = size.place === 'Back' ? VIEWS[garment].back || VIEWS[garment].front! : VIEWS[garment].front!
        const { garment: g, shade } = await recolorGarment(view.src, bg)
        if (off) return
        c.width = Math.round(g.width * zoom)
        c.height = Math.round(g.height * zoom)
        ctx.setTransform(zoom, 0, 0, zoom, 0, 0)
        ctx.fillStyle = '#ECECEA'
        ctx.fillRect(0, 0, c.width, c.height)
        ctx.drawImage(g, 0, 0)
        const f = arts[0]
        if (f) {
          const img = await loadImage(await prev(f, printWidth || 10.5, Math.min(300, 60 * zoom)))
          const w = (printWidth || 10.5) * view.ppi, h = (w * f.h) / f.w
          const cx = size.place === 'Left chest' ? view.cx + 4 * view.ppi : view.cx
          const art = document.createElement('canvas')
          art.width = g.width
          art.height = g.height
          const a = art.getContext('2d')!
          a.drawImage(img, cx - w / 2, view.topY, w, h)
          a.globalCompositeOperation = 'source-atop'
          a.drawImage(shade, 0, 0)
          ctx.drawImage(art, 0, 0)
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        return
      }
      // Apparel print box or printed media page, at scale.
      const W = media ? media.w : (PLACEMENT_BOX[type === 'hoodie' ? 'hoodie' : 'tee'][size.place || 'Front'] || [10.5, 12])[0] + 2
      const H = media ? media.h : (PLACEMENT_BOX[type === 'hoodie' ? 'hoodie' : 'tee'][size.place || 'Front'] || [10.5, 12])[1] + 2
      if (!arts.length) return placeholder(c, W || 10, H || 10)
      const k = Math.min(60, 560 / Math.max(W, H)) * zoom
      c.width = Math.round(W * k)
      c.height = Math.round(H * k)
      if (checker) drawChecker(ctx, c.width, c.height)
      else { ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height) }
      const f = arts[0]
      const img = await loadImage(await prev(f, widthFor(f), Math.min(300, k * 2)))
      if (off) return
      const w = widthFor(f) * k, h = (w * f.h) / f.w
      ctx.drawImage(img, (c.width - w) / 2, media ? (c.height - h) / 2 : k, w, h)
    })().then(() => { const st = c.parentElement; if (st && !off) { st.scrollLeft = (st.scrollWidth - st.clientWidth) / 2; st.scrollTop = (st.scrollHeight - st.clientHeight) / 2 } }).catch(() => {})
    return () => { off = true }
  }, [sig]) // eslint-disable-line react-hooks/exhaustive-deps

  async function downloadProof() {
    const c = canvasRef.current
    if (!c) return
    downloadBlob(await canvasToBlob(c), `${customer.trim() || 'Customer'} proof ${tab === 'mockup' ? 'mockup on ' + bgName(bg) : tab === 'print' ? 'print file' : 'on ' + bgName(bg)}.png`)
  }
  async function downloadArt() {
    try {
      for (const [i, a] of arts.entries()) {
        setDl(`Art ${i + 1} of ${arts.length}: 300 DPI CMYK…`)
        const w = widthFor(a)
        const r = await renderArt(a.src, [a.w, a.h], { widthIn: w, dpi: 300, knockout: a.ko, halftone: a.ht, hardAlpha: true })
        const blob = await cmykTiffFromUrl(r.url, 300)
        downloadBlob(blob, `${customer.trim() || 'Customer'} #${i + 1} ${a.name.replace(/\.[^.]+$/, '')} ${w.toFixed(2)}in 300dpi CMYK.tif`)
        await new Promise((res) => setTimeout(res, 300))
      }
    } finally {
      setDl('')
    }
  }

  async function openOrder(o: MpOrderRow) {
    const existing = jobs?.find((j) => j.mp === o.orderNo)
    if (existing) return onOpen(existing.id)
    setErr('')
    try {
      const id = await jobFromOrder(o.id, (jobId, t, fs) => designsFromFiles(jobId, t, fs, 1, setBusy, { pipeline: pipe }), setBusy)
      onOpen(id)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not open that order')
    } finally {
      setBusy('')
    }
  }

  const ready = files.length > 0 || note.trim().toLowerCase().startsWith('create')

  function jobData(): JobData {
    const n = note.trim()
    const low = n.toLowerCase()
    return {
      designs: [], chat: [], pipeline: pipe,
      sheetLength: sheetLen, fillSheet: /fill (the )?sheet/.test(low),
      media: media ? { ...media, bg: '#ffffff', fill: /fill it|fill the (page|banner)|make the art fill/.test(low) ? 100 : 90, design: 1 } : undefined,
      qty: group === 'print' && qty !== '' ? Number(qty) : undefined,
      createPrompt: low.startsWith('create art') ? n.replace(/^create art:?\s*/i, '') : undefined,
    }
  }

  /** Step 3 submit: save the files to a job, then Art Pro fixes every design. */
  async function submit() {
    if (!ready) return
    setErr('')
    try {
      setBusy('Saving the job…')
      const base = jobData()
      const job = jobRef.current || (await createJob(customer.trim(), type, base))
      jobRef.current = job
      if (!files.length) {
        // "Create art: …" — the job view makes the art.
        await saveJob(job.id, { customer: customer.trim(), job_type: type, data: base })
        onOpen(job.id)
        return
      }
      const designs = await designsFromFiles(job.id, type, files.map((f) => f.file), 1, setBusy, {
        pipeline: pipe,
        widthIn: group === 'apparel' || type === 'sticker' ? printWidth : undefined,
        place: size.place,
        qty: group === 'print' || qty === '' || base.fillSheet ? null : Number(qty),
      })
      const thumb = await thumbFrom(files[0].url).catch(() => undefined)
      const j0: Job = { ...job, customer: customer.trim(), job_type: type, data: { ...base, designs, thumb } }
      await saveJob(job.id, { customer: j0.customer, job_type: type, data: j0.data })
      const res = await autofix(j0, note.trim(), tools, setBusy)
      const said = note.trim() || 'Fix the artwork.'
      const data: JobData = { ...j0.data, designs: res.designs, noteSent: true, chat: [{ from: 'you', text: said }, { from: 'bot', text: [res.reply, ...res.log].filter(Boolean).join('\n') }] }
      setBusy('Saving the fixed art…')
      await saveJob(job.id, { data })
      setFixed({ job: { ...j0, data }, log: res.log, reply: res.reply })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not fix the artwork')
    } finally {
      setBusy('')
    }
  }

  async function goNext(review: boolean) {
    const j = fixed?.job
    if (!j) return
    if (!review) await saveJob(j.id, { station: nextStation({ job_type: j.job_type, station: 'artwork' }) })
    onOpen(j.id)
  }

  const steps = useMemo(() => {
    const base = [
      { key: 'clean' as const, title: 'Clean up', sub: 'AI upscale, redraw, de-noise' },
      { key: 'knockout' as const, title: 'Knock out', sub: 'Remove background / shirt color' },
      { key: 'halftone' as const, title: 'Halftone fade', sub: 'Dots for fades & dark shirts' },
    ]
    const fixed = [{ title: 'Size to print', sub: '300 DPI at inches' }]
    if (group === 'apparel') fixed.push({ title: 'Mockup', sub: 'Gildan garment, color, placement' }, { title: 'Gang / nest', sub: 'Fill sheet, cut file' })
    else if (group === 'dtf') fixed.push({ title: 'Gang / nest', sub: `Fill sheet, 0.25″ gaps${type === 'sticker' ? ', cut file' : ''}` })
    else fixed.push({ title: 'Layout', sub: 'Page, bleed, background' })
    return { base, fixed }
  }, [group, type])

  const specs: [string, string][] =
    group === 'print' && media
      ? [['Size', `${media.w}″ × ${media.h}″`], ['Bleed', media.bleed ? `${media.bleed} in` : 'none'], ['Resolution', `${media.dpi} DPI`], ['Color', 'CMYK · GRACoL 2013'], ['Background', 'White (changeable)'], ['Format', 'TIFF']]
      : [
          ['Size', sizeChip],
          ['Width', group === 'apparel' ? `${printWidth} in print` : `${SHEET_WIDTH_IN} in (standard)`],
          ['Resolution', '300 DPI'],
          ['Color', 'CMYK · GRACoL 2013'],
          ['Background', 'Transparent'],
          ['Spacing', type === 'sticker' ? 'Cut box + 2.5 mm' : '0.25 in between'],
          ['Format', 'TIFF (CMYK + transparency)'],
        ]
  const gets: [string, string][] =
    group === 'print' ? [['TIF', 'CMYK print file with bleed']] : group === 'apparel' ? [['PNG', 'Mockup for the customer'], ['TIF', 'CMYK gang sheet, RIP-ready'], ['PLT', 'Cut file (if pre-cut)']] : [['TIF', 'CMYK gang sheet, RIP-ready'], ['PLT', type === 'sticker' ? 'Teneth cut file' : 'Cut file (if pre-cut)']]

  return (
    <div className="startwrap">
      {jobs && jobs.length > 0 && (
        <div className="openstrip">
          <span className="lbl">Open jobs</span>
          {jobs.slice(0, 8).map((j) => (
            <button key={j.id} type="button" className="openchip" onClick={() => onOpen(j.id)}>
              {j.thumb ? <img src={j.thumb} alt="" /> : null}
              <span><strong>#{j.number} {j.customer || 'No name'}</strong><span className="muted small">{JOB_TYPES[j.job_type]?.label} · {STATION_LABEL[j.station]} · {ago(j.updated_at)}</span></span>
            </button>
          ))}
        </div>
      )}

      {mp && mp.length > 0 && (
        <div className="openstrip mpstrip">
          <span className="lbl">Mockup Pro orders</span>
          {mp.slice(0, 10).map((o) => {
            const inArt = jobs?.some((j) => j.mp === o.orderNo)
            return (
              <button key={o.id} type="button" className="openchip" disabled={!!busy} onClick={() => openOrder(o)} title={inArt ? 'Open the Art Pro job for this order' : 'Bring this order into Art Pro to fix the art'}>
                <span><strong>{o.orderNo} · {o.customer}</strong><span className="muted small">{o.status} · {o.designs} art{o.color ? ` · ${o.color}` : ''}{inArt ? ' · in Art Pro' : o.needsArt ? '' : ' · art looks OK'}{!inArt && o.needsArt ? <span className="need"> · {o.needsArt} need{o.needsArt > 1 ? '' : 's'} art work</span> : null}</span></span>
              </button>
            )
          })}
        </div>
      )}
      {busy && !files.length && <p className="working"><span className="spin" aria-hidden="true" />{busy}</p>}
      {err && !files.length && <p className="err">{err}</p>}

      <div className="startgrid">
        {/* LEFT */}
        <div className="startcol">
          <section className="card">
            <h3><span className="step">1</span>What are you building?</h3>
            <label className="field"><span className="lbl">Product</span>
              <select className="select big" value={type} onChange={(e) => setType(e.target.value as JobType)}>
                {(Object.keys(JOB_TYPES) as JobType[]).map((t) => <option key={t} value={t}>{t === 'dtf' ? 'DTF gang sheet' : JOB_TYPES[t].label}</option>)}
              </select>
            </label>
            <span className="lbl">Size</span>
            <div className="pills">
              {sizes.map((s, i) => <button key={s.label} type="button" className={`pill ${i === sizeIdx ? 'on' : ''}`} onClick={() => setSizeIdx(i)}>{s.label}</button>)}
            </div>
            {isCustom && (
              <div className="row3">
                {type === 'dtf' && <label className="field"><span className="lbl">Length (in)</span><input className="input" type="number" min="6" max="200" value={custom.len} onChange={(e) => setCustom({ ...custom, len: Math.max(6, Math.min(200, Number(e.target.value) || 6)) })} /></label>}
                {type === 'sticker' && <label className="field"><span className="lbl">Sticker width (in)</span><input className="input" type="number" min="0.5" step="0.25" value={custom.width} onChange={(e) => setCustom({ ...custom, width: Math.max(0.5, Number(e.target.value) || 1) })} /></label>}
                {group === 'print' && <><label className="field"><span className="lbl">Width (in)</span><input className="input" type="number" min="1" value={custom.w} onChange={(e) => setCustom({ ...custom, w: Math.max(1, Number(e.target.value) || 1) })} /></label>
                  <label className="field"><span className="lbl">Height (in)</span><input className="input" type="number" min="1" value={custom.h} onChange={(e) => setCustom({ ...custom, h: Math.max(1, Number(e.target.value) || 1) })} /></label></>}
              </div>
            )}
            <div className="row3">
              <label className="field"><span className="lbl">{group === 'print' ? 'Quantity' : 'Quantity (each design)'}</span><input className="input" type="number" min="0" value={qty} onChange={(e) => setQty(e.target.value === '' ? '' : Math.max(0, Math.round(Number(e.target.value))))} placeholder={group === 'dtf' ? 'or Fill the sheet' : '?'} /></label>
              <label className="field"><span className="lbl">Customer</span><input className="input" value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Walk-in" /></label>
            </div>
          </section>

          <section className="card">
            <h3><span className="step">2</span>Drop the files</h3>
            <label
              ref={dropRef}
              className="drop big"
              onDragOver={(e) => { e.preventDefault(); dropRef.current?.classList.add('over') }}
              onDragLeave={() => dropRef.current?.classList.remove('over')}
              onDrop={(e) => { e.preventDefault(); dropRef.current?.classList.remove('over'); void add(Array.from(e.dataTransfer.files)) }}
            >
              <input type="file" accept="image/*" multiple hidden onChange={(e) => { const picked = Array.from(e.target.files || []); e.target.value = ''; void add(picked) }} />
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#7FCBEE" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></svg>
              <strong>Drag files here or browse</strong>
              <span className="muted small">PNG, JPG, WEBP · phone photos OK · as many as you want</span>
            </label>
            {files.map((f, i) => {
              const st = statusOf(f)
              return (
                <div key={f.url} className="filechip">
                  <img src={f.url} alt="" className="thumb checker" />
                  <span className="dtext grow">
                    <strong className="ellipsis">{f.file.name}</strong>
                    <span className="muted small">{f.w} × {f.h} · {widthFor(f).toFixed(1)}″ at {st.dpi} DPI · {BG_LABEL[f.bg]}</span>
                  </span>
                  <span className={st.cls === 'ok' ? 'ok small strong' : 'warn small strong'}>{st.label}</span>
                  <button type="button" className="x" aria-label={`Remove ${f.file.name}`} onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))}>×</button>
                </div>
              )
            })}
          </section>

          <section className="card">
            <h3><span className="step">3</span>Tell Art Pro what you need</h3>
            <textarea className="input area" rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder={files.length ? 'Anything special? Example: knock out the white, halftone it for black shirts.' : 'No art? Start with “Create art:” and describe it.'} />
            <div className="pills">
              {[...CHIPS[group], ...(files.length ? [] : ['Create art: '])].map((c) => (
                <button key={c} type="button" className="pill sm ghost" onClick={() => setNote((n) => (c.startsWith('Create') ? c : n ? `${n.replace(/\.?\s*$/, '')}. ${c}` : c))}>+ {c.replace(': ', '')}</button>
              ))}
            </div>
            {err && <p className="err">{err}</p>}
            {busy && <p className="working"><span className="spin" aria-hidden="true" />{busy}</p>}
            {fixed && !busy && (
              <div className="fixlog">
                <strong>Art Pro fixed the artwork</strong>
                {fixed.log.map((l) => <span key={l} className="fixline">✓ {l}</span>)}
                {fixed.reply && <span className="muted small">{fixed.reply}</span>}
              </div>
            )}
            {!fixed ? (
              <button type="button" className="btn primary" disabled={!ready || !!busy} onClick={submit}>
                {busy ? 'Working…' : files.length ? 'Submit · Art Pro fixes the artwork' : 'Submit · create the art'}
              </button>
            ) : (
              <>
                <button type="button" className="btn primary" disabled={!!busy} onClick={() => goNext(false)}>{BUILD[type]} · Next: {STATION_LABEL[nextStation({ job_type: type, station: 'artwork' })]} ▸</button>
                <div className="actions">
                  <button type="button" className="btn small" disabled={!!busy} onClick={() => goNext(true)}>Adjust in Artwork</button>
                  <button type="button" className="btn small" disabled={!!busy} onClick={submit}>Fix again with these notes</button>
                </div>
              </>
            )}
          </section>
        </div>

        {/* CENTER */}
        <div className="startmain">
          <section className="card">
            <div className="prevhead">
              <h3>{type === 'dtf' ? 'DTF gang sheet' : info.label}</h3>
              <span className="sizechip">{sizeChip}</span>
              <div className="seg">
                <button type="button" className={tab === 'proof' ? 'on' : ''} onClick={() => setTab('proof')}>Proof</button>
                <button type="button" className={tab === 'print' ? 'on' : ''} onClick={() => setTab('print')}>Print file</button>
                {group === 'apparel' && <button type="button" className={tab === 'mockup' ? 'on' : ''} onClick={() => setTab('mockup')}>Mockup</button>}
              </div>
            </div>
            <div className={`proofstage ${zoom > 1 ? 'zoomed' : ''}`}>
              <canvas ref={canvasRef} className="proofcanvas" aria-label="Proof preview" />
              <span className="proofnote left">{fixed ? 'After Art Pro · ' : ''}{tab === 'mockup' ? `Mockup on ${bgName(bg)}` : tab === 'print' ? 'Print file · transparent' : 'Proof at scale'}</span>
              <span className="proofnote right">{sizeChip} · {group === 'print' && media ? media.dpi : 300} DPI</span>
            </div>
            <ProofTools
              bg={bg}
              setBg={tab === 'print' ? undefined : setBg}
              bgLabel={tab === 'mockup' ? 'Shirt color' : 'Background'}
              zoom={zoom}
              setZoom={setZoom}
              busy={dl}
              downloads={arts.length ? [{ label: 'Download proof', run: downloadProof }, { label: 'Download art (CMYK TIFF)', run: downloadArt }] : []}
            />
          </section>

          <section className="card">
            <h3>Art Pro pipeline for this product</h3>
            <div className="pipegrid">
              {steps.base.map((s, i) => (
                <button key={s.key} type="button" className={`pipecard ${pipe[s.key] ? 'on' : 'off'}`} onClick={() => setPipe((p) => ({ ...p, [s.key]: !p[s.key] }))} aria-pressed={pipe[s.key]}>
                  <span className="mono">{String(i + 1).padStart(2, '0')} · {pipe[s.key] ? 'on' : 'off'}</span>
                  <strong>{s.title}</strong>
                  <span className="muted small">{s.sub}</span>
                </button>
              ))}
              {steps.fixed.map((s, i) => (
                <div key={s.title} className="pipecard on fixed">
                  <span className="mono">{String(i + 4).padStart(2, '0')} · on</span>
                  <strong>{s.title}</strong>
                  <span className="muted small">{s.sub}</span>
                </div>
              ))}
            </div>
            <span className="muted small">Steps 1–3 happen in Artwork on a neutral gray; tap a step to turn it off for this job.</span>
          </section>
        </div>

        {/* RIGHT */}
        <div className="startside">
          <section className="card">
            <h3>Print specs</h3>
            <dl className="specs">{specs.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
            <span className="muted small">Specs load from the product preset.</span>
          </section>
          <section className="card">
            <h3>You’ll get</h3>
            {gets.map(([t, l]) => <div key={l} className="getrow"><span className="tag">{t}</span>{l}</div>)}
          </section>
          <section className="card">
            <h3>Send to</h3>
            <label className="check"><input type="checkbox" checked readOnly /> Art Pro job list</label>
            <label className="check"><input type="checkbox" checked readOnly /> Mockup Pro customer orders <span className="muted small">· from the job</span></label>
            <label className="check dim"><input type="checkbox" disabled /> Shop job board <span className="muted small">· connecting next</span></label>
          </section>
        </div>
      </div>
    </div>
  )
}

function drawChecker(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const s = 12
  for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) { ctx.fillStyle = ((x + y) / s) % 2 ? '#2a2f38' : '#1e222a'; ctx.fillRect(x, y, s, s) }
}

function placeholder(c: HTMLCanvasElement, wIn: number, hIn: number) {
  const k = Math.min(30, 520 / Math.max(wIn, hIn))
  c.width = Math.round(wIn * k) + 28
  c.height = Math.round(hIn * k) + 28
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.save()
  ctx.beginPath()
  ctx.rect(14, 14, c.width - 28, c.height - 28)
  ctx.clip()
  ctx.fillStyle = '#c8202f'
  ctx.fillRect(14, 14, c.width - 28, c.height - 28)
  ctx.strokeStyle = 'rgba(0,0,0,0.13)'
  ctx.lineWidth = 16
  for (let x = -c.height; x < c.width; x += 40) { ctx.beginPath(); ctx.moveTo(x, c.height); ctx.lineTo(x + c.height, 0); ctx.stroke() }
  ctx.restore()
  ctx.fillStyle = '#fff'
  ctx.font = '800 18px Archivo, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('YOUR ART', c.width / 2, c.height / 2 + 6)
}
