import { aiRedraw, aiUpscale, type AiTools } from './ai-image'
import { JOB_TYPES, localUrl, pxOf, srcOf, uploadImage, type Job, type JobDesign } from './jobs'
import { sharpWidth } from './render'
import { at } from './base'
import type { Knockout } from './knockout'
import type { HalftoneMode } from './halftone'
import type { Placement } from './garments'

type Action = { name: string; input: Record<string, unknown> }
export type FixResult = { designs: JobDesign[]; log: string[]; reply: string }

const targetWidth = (d: JobDesign, job: Job) => d.widthIn || Math.min(JOB_TYPES[job.job_type].defaultWidth, 21.7)

/** Asks Art Pro (Claude) how to fix every design, following the staff instructions. */
async function plan(job: Job, note: string, tools: AiTools): Promise<{ actions: Action[]; reply: string }> {
  const summary = {
    jobNumber: job.number, customer: job.customer, jobType: JOB_TYPES[job.job_type].label, station: 'artwork', route: JOB_TYPES[job.job_type].route,
    pipeline: job.data.pipeline,
    designs: job.data.designs.map((d) => ({ n: d.n, name: d.name, background: d.bg, px: pxOf(d), printWidthIn: targetWidth(d, job), sharpUpToIn: sharpWidth(pxOf(d)) })),
    aiTools: { createAndRedraw: tools.create, upscale: tools.upscale, halftone: true },
  }
  const msg =
    `AUTO-FIX REQUEST. Fix the artwork for every design right now by calling tools; do not ask questions. ` +
    `Only use steps that are on in job.pipeline (clean = upscale/redraw, knockout = background removal, halftone). ` +
    `Upscale any design whose sharpUpToIn is below its printWidthIn. Staff instructions: "${note || 'none, use shop standards'}". ` +
    `Then reply with one short line per design saying what you did.`
  try {
    const r = await fetch(at('/api/chat'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ job: summary, messages: [{ role: 'user', content: msg }] }) })
    if (!r.ok) return { actions: [], reply: '' }
    const j = (await r.json()) as { reply?: string; actions?: Action[] }
    return { actions: j.actions || [], reply: j.reply || '' }
  } catch {
    return { actions: [], reply: '' }
  }
}

/**
 * One-button artwork fix: shop-standard baseline (background removal, upscale when too small,
 * halftone when asked) plus whatever Art Pro decides from the instructions. Runs the AI tools,
 * saves the results to the job's files, and marks every Artwork step finished.
 */
export async function autofix(job: Job, note: string, tools: AiTools, progress: (msg: string) => void): Promise<FixResult> {
  const pl = job.data.pipeline || { clean: true, knockout: true, halftone: true }
  const low = note.toLowerCase()
  progress('Art Pro is reading your instructions…')
  const { actions, reply } = await plan(job, note, tools)

  const hit = (t: unknown, d: JobDesign) => t === 'all' || t == null || (Array.isArray(t) && (t as number[]).includes(d.n))
  const wantUpscale = new Set<string>()
  const wantRedraw = new Map<string, string>()
  const touchedKo = new Set<string>()
  const touchedHt = new Set<string>()

  let designs = job.data.designs.map((d) => ({ ...d, steps: { ...d.steps } }))

  // 1) What Art Pro decided.
  for (const a of actions) {
    const inp = a.input || {}
    designs = designs.map((d) => {
      if (!hit(inp.targets, d) && a.name !== 'create_image') return d
      const n = { ...d }
      if (a.name === 'update_designs') {
        if (typeof inp.knockout === 'string' && pl.knockout) { n.knockout = inp.knockout as Knockout; touchedKo.add(d.id) }
        if (typeof inp.width_in === 'number') n.widthIn = Math.min(21.7, Math.max(0.5, inp.width_in))
        if (typeof inp.qty === 'number') n.qty = Math.max(0, Math.round(inp.qty))
        if (typeof inp.placement === 'string') n.place = inp.placement as Placement
      } else if (a.name === 'halftone' && pl.halftone) {
        touchedHt.add(d.id)
        n.halftone = inp.off ? null : { mode: (typeof inp.mode === 'string' ? inp.mode : 'dark') as HalftoneMode, lpi: typeof inp.lpi === 'number' ? Math.round(inp.lpi) : 45, angle: typeof inp.angle === 'number' ? inp.angle : 22.5 }
      } else if (a.name === 'upscale_design' && pl.clean) wantUpscale.add(d.id)
      else if (a.name === 'redraw_design' && pl.clean) wantRedraw.set(d.id, String(inp.instructions || ''))
      return n
    })
  }

  // 2) Shop-standard baseline for anything Art Pro didn't cover.
  designs = designs.map((d) => {
    const n = { ...d }
    if (pl.knockout && !touchedKo.has(d.id)) {
      if (/remove all white|all the white/.test(low)) n.knockout = 'white-all'
      else if (/knock ?out (the )?white|remove (the )?white/.test(low) || d.bg === 'white') n.knockout = 'white'
      else if (/knock ?out (the )?black|remove (the )?black/.test(low) || d.bg === 'black') n.knockout = 'black'
    }
    if (pl.halftone && !touchedHt.has(d.id) && /halftone|half tone|fade/.test(low)) {
      const mode: HalftoneMode = /white shirt|light shirt|light garment/.test(low) ? 'light' : /soft edge|fade only|glow/.test(low) ? 'fade' : 'dark'
      const lpi = Number(/(\d{2})\s*lpi/.exec(low)?.[1]) || 45
      n.halftone = { mode, lpi, angle: 22.5 }
    }
    if (pl.clean && !wantRedraw.has(d.id) && /redraw|vector|clean (it )?up the (art|text)|recreate/.test(low)) wantRedraw.set(d.id, note)
    if (pl.clean && sharpWidth(pxOf(d)) < targetWidth(d, job)) wantUpscale.add(d.id)
    return n
  })

  // 3) Run the AI tools (redraw first, then upscale) and save the results.
  const log: string[] = []
  for (const d0 of designs) {
    let d = d0
    const did: string[] = []
    try {
      if (wantRedraw.has(d.id)) {
        if (!tools.create) did.push('redraw not switched on yet')
        else {
          progress(`#${d.n}: AI redrawing… (up to a minute)`)
          const r = await aiRedraw(await localUrl(srcOf(d)), wantRedraw.get(d.id) || '', true)
          const url = await uploadImage(job.id, `${d.name}-redraw`, await (await fetch(r.url)).blob())
          d = { ...d, fixed: url, fixedPx: [r.w, r.h], bg: 'transparent', knockout: 'none' }
          did.push('redrawn clean')
          wantUpscale.add(d.id)
        }
      }
      if (wantUpscale.has(d.id) && sharpWidth(pxOf(d)) < targetWidth(d, job)) {
        if (!tools.upscale) did.push(`only sharp to ${sharpWidth(pxOf(d))}″ (AI upscale not switched on yet)`)
        else {
          progress(`#${d.n}: AI upscaling… (up to a minute)`)
          const r = await aiUpscale(await localUrl(srcOf(d)))
          const url = await uploadImage(job.id, `${d.name}-upscaled`, await (await fetch(r.url)).blob())
          d = { ...d, fixed: url, fixedPx: [r.w, r.h] }
          did.push(`upscaled, sharp to ${sharpWidth([r.w, r.h])}″`)
        }
      }
    } catch (e) {
      did.push(`AI step failed: ${e instanceof Error ? e.message : 'error'}`)
    }
    if (d.knockout !== 'none') did.push(d.knockout.includes('all') ? `all ${d.knockout.split('-')[0]} removed` : `${d.knockout} background removed`)
    if (d.halftone) did.push(`halftone ${d.halftone.lpi} LPI (${d.halftone.mode === 'dark' ? 'dark shirts' : d.halftone.mode === 'light' ? 'light shirts' : 'soft edges'})`)
    if (!did.length) did.push('already print-ready')
    d = {
      ...d,
      steps: {
        fix: pl.clean ? 'done' : 'skipped',
        background: pl.knockout ? 'done' : 'skipped',
        halftone: pl.halftone && d.halftone ? 'done' : 'skipped',
      },
    }
    log.push(`#${d.n} ${d.name}: ${did.join(' · ')}`)
    designs = designs.map((x) => (x.id === d.id ? d : x))
  }
  return { designs, log, reply }
}
