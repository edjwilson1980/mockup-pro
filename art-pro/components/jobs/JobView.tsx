'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { aiCreate, aiRedraw, aiStatus, aiUpscale, type AiTools } from '@/lib/ai-image'
import { GILDAN_COLORS, QUICK_COLORS, findColor, type Placement } from '@/lib/garments'
import { JOB_TYPES, STATION_LABEL, getJob, localUrl, nextStation, pxOf, saveJob, srcOf, thumbFrom, uploadImage, type ChatMsg, type Job, type JobDesign, type JobType, type Station, type Step } from '@/lib/jobs'
import { sharpWidth } from '@/lib/render'
import { at as withBase } from '@/lib/base'
import type { Knockout } from '@/lib/knockout'
import type { HalftoneMode } from '@/lib/halftone'
import { uid } from '../store'
import ArtworkStation from './ArtworkStation'
import MockupStation, { widthOf } from './MockupStation'
import GangStation, { gangWidth } from './GangStation'
import LayoutStation from './LayoutStation'
import { designsFromFiles } from './JobsHome'
import SendToShop from './SendToShop'
import { canSendToMockupPro, shopCustomerUrl } from '@/lib/mp-client'

type Action = { name: string; input: Record<string, unknown> }

async function blobOf(url: string) {
  return (await fetch(url)).blob()
}

export default function JobView({ id, onClose }: { id: string; onClose: () => void }) {
  const [job, setJob] = useState<Job | null>(null)
  const [err, setErr] = useState('')
  const [working, setWorking] = useState<Record<string, string>>({})
  const [tools, setTools] = useState<AiTools>({ create: false, upscale: false })
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved')
  const [chips, setChips] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [thinking, setThinking] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)
  const ref = useRef<Job | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const started = useRef(false)

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const j = ref.current
    if (!j) return
    setSaveState('saving')
    try {
      await saveJob(j.id, { customer: j.customer, job_type: j.job_type, station: j.station, status: j.status, data: j.data })
      setSaveState('saved')
    } catch {
      setSaveState('error')
    }
  }, [])
  const commit = (n: Job) => {
    ref.current = n
    setJob(n)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, 700)
  }
  const mutate = (fn: (j: Job) => Job) => ref.current && commit(fn(ref.current))
  const mutateData = (fn: (d: Job['data']) => Job['data']) => mutate((j) => ({ ...j, data: fn(j.data) }))
  const patchDesign = (did: string, p: Partial<JobDesign>) => mutateData((d) => ({ ...d, designs: d.designs.map((x) => (x.id === did ? { ...x, ...p } : x)) }))
  const setStep = (did: string, s: keyof JobDesign['steps'], v: Step) => mutateData((d) => ({ ...d, designs: d.designs.map((x) => (x.id === did ? { ...x, steps: { ...x.steps, [s]: v } } : x)) }))
  const say = (text: string, c: string[] = []) => {
    mutateData((d) => ({ ...d, chat: [...(d.chat || []), { from: 'bot' as const, text }].slice(-60) }))
    setChips(c)
  }
  const work = (k: string, note: string | null) => setWorking((w) => { const n = { ...w }; if (note) n[k] = note; else delete n[k]; return n })

  useEffect(() => {
    getJob(id).then((j) => { ref.current = j; setJob(j) }).catch((e) => setErr(e.message))
    aiStatus().then(setTools)
    return () => { if (timer.current) { clearTimeout(timer.current); void flush() } }
  }, [id, flush])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
  }, [job?.data.chat?.length, chips, thinking])

  // A job started with "have AI create it": run once tools are known.
  useEffect(() => {
    const j = ref.current
    if (!j || started.current || !j.data.createPrompt || j.data.designs.length) return
    if (!tools.create) return
    started.current = true
    const prompt = j.data.createPrompt
    mutateData((d) => ({ ...d, createPrompt: undefined }))
    void createArt(prompt)
  }, [job?.id, tools.create]) // eslint-disable-line react-hooks/exhaustive-deps

  // Instructions typed on the start screen go to Art Pro once, when the job first opens.
  const noteSent = useRef(false)
  useEffect(() => {
    const j = ref.current
    if (!j || noteSent.current || !j.data.note || j.data.noteSent) return
    noteSent.current = true
    mutateData((d) => ({ ...d, noteSent: true }))
    void send(j.data.note)
  }, [job?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- art actions ----------
  async function addFiles(files: File[]) {
    const j = ref.current
    const imgs = files.filter((f) => f.type.startsWith('image/'))
    if (!j || !imgs.length) return
    work('__add', 'Saving files…')
    try {
      const fresh = await designsFromFiles(j.id, j.job_type, imgs, j.data.designs.length + 1, (s) => work('__add', s))
      const thumb = j.data.thumb || (await thumbFrom(URL.createObjectURL(imgs[0])).catch(() => undefined))
      mutateData((d) => ({ ...d, thumb, designs: [...d.designs, ...fresh] }))
    } catch (e) {
      say('Could not save that file: ' + (e instanceof Error ? e.message : ''))
    } finally {
      work('__add', null)
    }
  }

  async function createArt(prompt: string) {
    const j = ref.current
    if (!j) return
    if (!tools.create) return say('AI art creation is not switched on yet.')
    work('__create', 'Creating art… (1–3 minutes, keep this page open)')
    try {
      let res = await aiCreate(prompt, true, 'portrait')
      if (tools.upscaleVia === 'replicate') {
        work('__create', 'Upscaling for print…')
        res = await aiUpscale(res.url).catch(() => res)
      }
      work('__create', 'Saving…')
      const url = await uploadImage(j.id, prompt.slice(0, 30) || 'ai-art', await blobOf(res.url))
      const thumb = ref.current?.data.thumb || (await thumbFrom(res.url).catch(() => undefined))
      mutateData((d) => ({
        ...d, thumb,
        designs: [...d.designs, { id: uid(), n: d.designs.length + 1, name: prompt.slice(0, 40), original: url, originalPx: [res.w, res.h], bg: 'transparent', knockout: 'none', halftone: null, steps: { fix: 'done', background: 'done', halftone: 'todo' } }],
      }))
      say('New art is in. Check it on the gray, then pick a halftone option (or “No halftone”).')
    } catch (e) {
      say('The AI could not create that: ' + (e instanceof Error ? e.message : ''))
    } finally {
      work('__create', null)
    }
  }

  async function aiFix(did: string, kind: 'upscale' | 'redraw', instructions = '') {
    const j = ref.current
    const d = j?.data.designs.find((x) => x.id === did)
    if (!j || !d) return
    if (kind === 'upscale' && !tools.upscale) return say('AI upscaling is not switched on yet.')
    if (kind === 'redraw' && !tools.create) return say('AI redraw is not switched on yet.')
    const slow = kind === 'redraw' || tools.upscaleVia === 'openai'
    work(did, `${kind === 'upscale' ? 'AI upscaling' : 'AI redrawing'}… (${slow ? '1–4 minutes, keep this page open' : 'up to a minute'})`)
    try {
      const local = await localUrl(srcOf(d))
      let res = kind === 'upscale' ? await aiUpscale(local) : await aiRedraw(local, instructions, true)
      // Only a real upscaler (Replicate) after a redraw; the redraw is already enlarged to print size.
      if (kind === 'redraw' && tools.upscaleVia === 'replicate') {
        work(did, 'Upscaling the redraw for print…')
        res = await aiUpscale(res.url).catch(() => res)
      }
      work(did, 'Saving…')
      const url = await uploadImage(j.id, `${d.name}-${kind}`, await blobOf(res.url))
      const p: Partial<JobDesign> = { fixed: url, fixedPx: [res.w, res.h], acceptLow: false, steps: { ...d.steps, fix: 'done' } }
      if (kind === 'redraw') Object.assign(p, { bg: 'transparent', knockout: 'none', steps: { ...d.steps, fix: 'done', background: 'done' } })
      patchDesign(did, p)
      say(`#${d.n} ${kind === 'upscale' ? 'upscaled' : 'redrawn'}: now sharp up to ${sharpWidth([res.w, res.h])}″ wide.`)
    } catch (e) {
      say(`The AI ${kind} did not work: ${e instanceof Error ? e.message : ''}`)
    } finally {
      work(did, null)
    }
  }

  const removeDesign = (did: string) => mutateData((d) => ({ ...d, designs: d.designs.filter((x) => x.id !== did).map((x, i) => ({ ...x, n: i + 1 })) }))
  const goTo = (s: Station) => mutate((j) => ({ ...j, station: s, status: s === 'done' ? 'done' : 'open' }))
  const next = () => ref.current && goTo(nextStation(ref.current))
  const finish = async () => { goTo('done'); await flush() }

  // ---------- chat ----------
  function summary() {
    const j = ref.current!
    return {
      jobNumber: j.number, customer: j.customer, jobType: JOB_TYPES[j.job_type].label, station: j.station, route: JOB_TYPES[j.job_type].route,
      garmentColor: j.data.color || null,
      designs: j.data.designs.map((d) => ({
        n: d.n, name: d.name, steps: d.steps, background: d.bg, knockout: d.knockout, halftone: d.halftone, px: pxOf(d), sharpUpToIn: sharpWidth(pxOf(d)),
        placement: d.place, widthIn: JOB_TYPES[j.job_type].group === 'print' ? undefined : gangWidth(d, j), qty: d.qty,
        working: working[d.id],
      })),
      aiTools: { createAndRedraw: tools.create, upscale: tools.upscale, halftone: true },
    }
  }

  function applyActions(actions: Action[]) {
    const j = ref.current
    if (!j) return null
    let newChips: string[] | null = null
    const hit = (t: unknown) => (d: JobDesign) => t === 'all' || t == null || (Array.isArray(t) && (t as number[]).includes(d.n))
    for (const a of actions) {
      const inp = a.input || {}
      if (a.name === 'update_designs') {
        if (inp.remove) { mutateData((d) => ({ ...d, designs: d.designs.filter((x) => !hit(inp.targets)(x)).map((x, i) => ({ ...x, n: i + 1 })) })); continue }
        mutateData((dd) => ({
          ...dd,
          designs: dd.designs.map((d) => {
            if (!hit(inp.targets)(d)) return d
            const n = { ...d }
            if (typeof inp.qty === 'number') n.qty = Math.max(0, Math.round(inp.qty))
            if (typeof inp.placement === 'string') { n.place = inp.placement as Placement; n.widthIn = undefined }
            if (typeof inp.width_in === 'number') n.widthIn = Math.min(21.7, Math.max(0.5, inp.width_in))
            if (typeof inp.knockout === 'string') { n.knockout = inp.knockout as Knockout; n.steps = { ...n.steps, background: 'done' } }
            if (inp.shrink_to_sharp) n.widthIn = Math.max(0.5, Math.floor((pxOf(d)[0] / 150) * 4) / 4)
            if (inp.accept_low_res) { n.acceptLow = true; n.steps = { ...n.steps, fix: 'done' } }
            return n
          }),
        }))
      } else if (a.name === 'halftone') {
        mutateData((dd) => ({
          ...dd,
          designs: dd.designs.map((d) => {
            if (!hit(inp.targets)(d)) return d
            if (inp.off) return { ...d, halftone: null, steps: { ...d.steps, halftone: 'skipped' as Step } }
            const c = dd.color ? GILDAN_COLORS.find((x) => x.name === dd.color) : undefined
            const dark = c ? parseInt(c.hex.slice(1, 3), 16) + parseInt(c.hex.slice(3, 5), 16) + parseInt(c.hex.slice(5, 7), 16) < 300 : true
            const mode = (typeof inp.mode === 'string' ? inp.mode : d.halftone?.mode || (dark ? 'dark' : 'light')) as HalftoneMode
            const lpi = typeof inp.lpi === 'number' ? Math.round(Math.min(85, Math.max(15, inp.lpi))) : d.halftone?.lpi || 45
            return { ...d, halftone: { mode, lpi, angle: typeof inp.angle === 'number' ? inp.angle : 22.5 }, steps: { ...d.steps, halftone: 'done' as Step } }
          }),
        }))
      } else if (a.name === 'upscale_design' || a.name === 'redraw_design') {
        for (const d of j.data.designs.filter(hit(inp.targets))) void aiFix(d.id, a.name === 'upscale_design' ? 'upscale' : 'redraw', String(inp.instructions || ''))
      } else if (a.name === 'create_image') {
        void createArt(String(inp.prompt || ''))
      } else if (a.name === 'set_garment_color') {
        const c = findColor(String(inp.color || ''))
        if (c) mutateData((d) => ({ ...d, color: c.name }))
      } else if (a.name === 'set_sheet_options') {
        mutateData((d) => ({ ...d, ...(typeof inp.precut === 'boolean' ? { precut: inp.precut } : {}), ...(typeof inp.spares === 'boolean' ? { spares: inp.spares } : {}) }))
      } else if (a.name === 'go_to_station') {
        const s = String(inp.station || '') as Station
        if (JOB_TYPES[j.job_type].route.includes(s)) goTo(s)
      } else if (a.name === 'quick_replies') {
        newChips = ((inp.options as string[]) || []).slice(0, 6)
      }
    }
    return newChips
  }

  function localParse(text: string): Action[] | null {
    const t = text.toLowerCase().trim()
    const hashes = Array.from(t.matchAll(/#\s*(\d+)/g)).map((m) => parseInt(m[1], 10))
    const targets = hashes.length ? hashes : 'all'
    const qc = QUICK_COLORS.find((c) => c.toLowerCase() === t)
    if (qc) return [{ name: 'set_garment_color', input: { color: qc } }]
    const m = t.match(/^(\d{1,4})( each)?$/)
    if (m) return [{ name: 'update_designs', input: { targets, qty: parseInt(m[1], 10) } }]
    const ht = t.match(/^halftone( it| (?:#\s*\d+[ ,]*)+)?( (?:at )?(\d{2}) ?lpi)?$/)
    if (ht) return [{ name: 'halftone', input: { targets, ...(ht[3] ? { lpi: parseInt(ht[3], 10) } : {}) } }]
    if (/^(ai )?upscale( it| #\s*\d+)*$/.test(t)) return [{ name: 'upscale_design', input: { targets } }]
    const cr = text.trim().match(/^create(?: new)? art:\s*(.{3,})$/i)
    if (cr) return [{ name: 'create_image', input: { prompt: cr[1] } }]
    return null
  }

  /**
   * When the chat AI can't be reached, still do the two things the old "Fix with AI" and
   * "Create new art" boxes did: new art from a description, or a redraw with the instructions.
   */
  function fallbackActions(text: string): Action[] | string {
    const j = ref.current!
    const designs = j.data.designs
    const hashes = Array.from(text.matchAll(/#\s*(\d+)/g)).map((m) => parseInt(m[1], 10))
    const wantsNew = /^\s*(create|generate|draw|design)\b/i.test(text) || /\bnew (art|artwork|logo|design|image)\b/i.test(text)
    if (!designs.length || wantsNew) return [{ name: 'create_image', input: { prompt: text.replace(/^\s*create(?: new)?(?: art)?:?\s*/i, '') || text } }]
    if (hashes.length) return [{ name: 'redraw_design', input: { targets: hashes, instructions: text } }]
    if (designs.length === 1) return [{ name: 'redraw_design', input: { targets: [designs[0].n], instructions: text } }]
    return `Which design should I change? Say it with the number, e.g. "#1 ${text}".`
  }

  async function send(text: string) {
    const v = text.trim()
    const j = ref.current
    if (!v || thinking || !j) return
    setDraft('')
    setChips([])
    mutateData((d) => ({ ...d, chat: [...(d.chat || []), { from: 'you' as const, text: v }].slice(-60) }))
    const quick = localParse(v)
    if (quick) { applyActions(quick); return }
    setThinking(true)
    try {
      const history = [...(j.data.chat || []), { from: 'you', text: v } as ChatMsg].slice(-12).map((m) => ({ role: m.from === 'you' ? 'user' : 'assistant', content: m.text }))
      const r = await fetch(withBase('/api/chat'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ job: summary(), messages: history }) })
      if (!r.ok) {
        const fb = fallbackActions(v)
        if (typeof fb === 'string') say(fb)
        else if (!tools.create) say('The AI chat and the AI image tools are both off right now. The buttons on the left still work.')
        else { say('The AI chat is offline, so I sent this straight to the image AI.'); applyActions(fb) }
        return
      }
      const data = (await r.json()) as { reply?: string; actions?: Action[] }
      const c = applyActions(data.actions || [])
      if (data.reply) say(data.reply, c || [])
      else if (c) setChips(c)
    } catch {
      say('I could not reach the AI chat right now. The buttons on the left still work.')
    } finally {
      setThinking(false)
    }
  }

  // ---------- render ----------
  if (err) return <div className="card"><p className="err">{err}</p><button type="button" className="btn" onClick={onClose}>Back to jobs</button></div>
  if (!job) return <p className="muted">Loading job…</p>
  const info = JOB_TYPES[job.job_type]
  const route = info.route
  const at = route.indexOf(job.station)
  const nxt = nextStation(job)
  const nextLabel = `Next: ${STATION_LABEL[nxt]} ▸`
  const banner = working.__create || working.__add

  return (
    <div className="jobview">
      <div className="jobhead">
        <button type="button" className="btn small" onClick={async () => { await flush(); onClose() }}>‹ Jobs</button>
        <strong className="jobno">#{job.number}</strong>
        <input className="input custin" value={job.customer} onChange={(e) => mutate((j) => ({ ...j, customer: e.target.value }))} placeholder="Customer" aria-label="Customer" />
        <select className="select typesel" value={job.job_type} aria-label="Job type" onChange={(e) => mutate((j) => { const t = e.target.value as JobType; return { ...j, job_type: t, station: JOB_TYPES[t].route.includes(j.station) ? j.station : 'artwork' } })}>
          {(Object.keys(JOB_TYPES) as JobType[]).map((t) => <option key={t} value={t}>{JOB_TYPES[t].label}</option>)}
        </select>
        {job.data.mp && <a className="mplink" href={shopCustomerUrl(job.data.mp.fileNo)} title="Open the customer file in Mockup Pro">Mockup Pro {job.data.mp.orderNo} · {job.data.mp.customer}</a>}
        {canSendToMockupPro(job) && <button type="button" className="btn small primary" onClick={() => setSendOpen((v) => !v)}>{job.data.mp?.sentAt ? 'Send again to Mockup Pro' : 'Send to Mockup Pro ▸'}</button>}
        <span className={`savestate ${saveState}`}>{saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Not saved: retrying on next change' : 'Saved'}</span>
      </div>

      <nav className="progress" aria-label="Job stations">
        {route.map((s, i) => (
          <button key={s} type="button" className={`pstep ${s === job.station ? 'on' : i < at || job.station === 'done' ? 'past' : ''}`} disabled={job.station !== 'done' && i > at} onClick={() => goTo(s)}>
            <i>{i < at || job.station === 'done' ? '✓' : i + 1}</i>{STATION_LABEL[s]}
          </button>
        ))}
        <span className={`pstep ${job.station === 'done' ? 'on' : ''}`}><i>✓</i>Done</span>
      </nav>

      {banner && <p className="notice card">{banner}</p>}
      {sendOpen && <SendToShop job={job} flush={flush} onClose={() => setSendOpen(false)} onSent={(mp, msg) => { mutateData((d) => ({ ...d, mp })); say(msg) }} />}

      <div className="jobgrid">
        <section className="card stationcard">
          {job.station === 'artwork' && (
            <ArtworkStation job={job} working={working} tools={tools} patchDesign={patchDesign} setStep={setStep} removeDesign={removeDesign}
              addFiles={addFiles} upscale={(d) => aiFix(d, 'upscale')} next={next} nextLabel={nextLabel} />
          )}
          {job.station === 'mockup' && (
            <MockupStation job={job} patchDesign={patchDesign} setColor={(c) => mutateData((d) => ({ ...d, color: c }))} goBack={() => goTo('artwork')} next={next} nextLabel={nextLabel} />
          )}
          {job.station === 'gang' && (
            <GangStation job={job} patchDesign={patchDesign} setOpt={(o) => mutateData((d) => ({ ...d, ...o }))} goBack={() => goTo('artwork')} finish={finish} />
          )}
          {job.station === 'layout' && (
            <LayoutStation job={job} setMedia={(m) => mutateData((d) => ({ ...d, media: m }))} setQty={(q) => mutateData((d) => ({ ...d, qty: q }))} goBack={() => goTo('artwork')} finish={finish} />
          )}
          {job.station === 'done' && (
            <div className="donebox">
              <h3>Job #{job.number} is done ✓</h3>
              <p className="muted">{job.data.designs.length} design{job.data.designs.length === 1 ? '' : 's'} · {info.label}{job.data.color ? ` · ${job.data.color}` : ''}</p>
              <div className="actions">
                <button type="button" className="btn" onClick={() => goTo(route[route.length - 1])}>Reopen at {STATION_LABEL[route[route.length - 1]]}</button>
                <button type="button" className="btn primary" onClick={async () => { await flush(); onClose() }}>Back to jobs</button>
              </div>
            </div>
          )}
        </section>

        <aside className="card chatcard">
          <h3>Art Pro <span className="muted small">· {STATION_LABEL[job.station]}</span></h3>
          <div className="chatlog" ref={logRef}>
            {(job.data.chat || []).length === 0 && <div className="brow bot"><div className="bubble bot">Tell me anything about this job. Fix art: “fix the spelling on #1”, “make #1 sharper”, “upscale #2”. New art: “create a lion logo that says “Lions Football” in red and black”. Also: “halftone at 35 lpi”, “make #2 left chest”, “24 black shirts”.</div></div>}
            {(job.data.chat || []).map((m, i) => <div key={i} className={`brow ${m.from}`}><div className={`bubble ${m.from}`}>{m.text}</div></div>)}
            {thinking && <div className="brow bot"><div className="bubble bot muted">Art Pro is thinking…</div></div>}
            {chips.length > 0 && !thinking && <div className="chips">{chips.map((c) => <button key={c} type="button" className="chip" onClick={() => send(c)}>{c}</button>)}</div>}
          </div>
          <form className="askrow" onSubmit={(e) => { e.preventDefault(); void send(draft) }}>
            <label htmlFor="ask" className="sr-only">Message Art Pro</label>
            <input id="ask" className="input askinput" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Fix, create, size, halftone… tell Art Pro" autoComplete="off" />
            <button type="submit" className="btn primary" disabled={thinking}>Send</button>
          </form>
        </aside>
      </div>
    </div>
  )
}

export { widthOf }
