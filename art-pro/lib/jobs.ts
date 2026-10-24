import { upload } from '@vercel/blob/client'
import { BASE, at } from './base'
import type { Background } from './autoprep'
import type { HalftoneOptions } from './halftone'
import type { Knockout } from './knockout'
import type { Placement } from './garments'

export type JobType = 'tee' | 'hoodie' | 'dtf' | 'sticker' | 'cards' | 'flyer' | 'banner' | 'other'
export type Station = 'artwork' | 'mockup' | 'gang' | 'layout' | 'done'
export type Step = 'todo' | 'done' | 'skipped'

export const STATION_LABEL: Record<Station, string> = { artwork: 'Artwork', mockup: 'Mockup & size', gang: 'Gang sheet & cut', layout: 'Layout & size', done: 'Done' }

export const JOB_TYPES: Record<JobType, { label: string; icon: string; route: Station[]; group: 'apparel' | 'dtf' | 'print'; defaultWidth: number }> = {
  tee: { label: 'T-shirts', group: 'apparel', route: ['artwork', 'mockup', 'gang'], defaultWidth: 10.5, icon: 'M8 3l-5 3 2 4 3-1v12h8V9l3 1 2-4-5-3a4 4 0 0 1-8 0z' },
  hoodie: { label: 'Hoodies', group: 'apparel', route: ['artwork', 'mockup', 'gang'], defaultWidth: 10.5, icon: 'M8 4a4 4 0 0 1 8 0l5 3-2 4-3-1v11H8V10l-3 1-2-4zM9 15h6v3H9z' },
  dtf: { label: 'DTF transfers', group: 'dtf', route: ['artwork', 'gang'], defaultWidth: 10.5, icon: 'M5 2h14v20H5zM8 5h3v3H8zM13 5h3v3h-3zM8 10h3v3H8zM13 10h3v3h-3zM8 15h3v3H8z' },
  sticker: { label: 'Stickers', group: 'dtf', route: ['artwork', 'gang'], defaultWidth: 3, icon: 'M3 12V3h9l9 9-9 9zM7.5 7.5h.01' },
  cards: { label: 'Business cards', group: 'print', route: ['artwork', 'layout'], defaultWidth: 3.5, icon: 'M3 6h18v12H3zM6 10h6M6 14h4' },
  flyer: { label: 'Flyers', group: 'print', route: ['artwork', 'layout'], defaultWidth: 8.5, icon: 'M6 2h9l4 4v16H6zM15 2v4h4M9 12h7M9 16h7' },
  banner: { label: 'Banner', group: 'print', route: ['artwork', 'layout'], defaultWidth: 72, icon: 'M3 5h18v10H3zM7 15v5M17 15v5M7 10h10' },
  other: { label: 'Something else', group: 'print', route: ['artwork', 'layout'], defaultWidth: 10.5, icon: 'M12 5v14M5 12h14' },
}

export type JobDesign = {
  id: string
  n: number
  name: string
  original: string
  originalPx: [number, number]
  /** Latest fixed source (after AI upscale/redraw). Background removal and halftone are applied on top at render time. */
  fixed?: string
  fixedPx?: [number, number]
  bg: Background
  knockout: Knockout
  halftone: HalftoneOptions | null
  steps: { fix: Step; background: Step; halftone: Step }
  acceptLow?: boolean
  // set at the product station
  place?: Placement
  widthIn?: number
  qty?: number | null
  /** The Mockup Pro art record this design replaces (order came from Mockup Pro). */
  mp?: { assetId: string; spotId: string; designId?: string; spotRowId?: string }
}

export type ChatMsg = { from: 'bot' | 'you'; text: string }
export type Media = { w: number; h: number; dpi: number; bleed: number; bg: string; fill: number; design: number }

export type JobData = {
  designs: JobDesign[]
  color?: string | null
  precut?: boolean
  spares?: boolean
  media?: Media
  qty?: number | null
  chat?: ChatMsg[]
  thumb?: string
  createPrompt?: string
  /** DTF sheet length the customer bought (inches); the gang sheet fills to this. */
  sheetLength?: number | null
  fillSheet?: boolean
  /** What staff typed in "Tell Art Pro" on the start screen; sent to the chat once. */
  note?: string
  noteSent?: boolean
  /** Which Artwork steps this job runs (off = skipped). */
  pipeline?: { clean: boolean; knockout: boolean; halftone: boolean }
  /** Made automatically for a Mockup Pro order; the order's art loads the first time it is opened. */
  pending?: boolean
  /** Linked Mockup Pro order (set when the job came from, or was sent to, Mockup Pro). */
  mp?: { orderId: string; orderNo: string; customerId: string; customer: string; fileNo: string; sentAt?: string; status?: string }
}

export type Job = {
  id: string
  number: number
  customer: string
  job_type: JobType
  station: Station
  status: 'open' | 'done'
  data: JobData
  created_at: string
  updated_at: string
}
export type JobRow = Omit<Job, 'data'> & { thumb?: string | null; mp?: string | null }

export const srcOf = (d: JobDesign) => d.fixed || d.original
export const pxOf = (d: JobDesign): [number, number] => d.fixedPx || d.originalPx
export const artworkDone = (d: JobDesign) => d.steps.fix !== 'todo' && d.steps.background !== 'todo' && d.steps.halftone !== 'todo'
export const nextStation = (job: Pick<Job, 'job_type' | 'station'>): Station => {
  const r = JOB_TYPES[job.job_type].route
  const i = r.indexOf(job.station)
  return i >= 0 && i < r.length - 1 ? r[i + 1] : 'done'
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`)
  return j as T
}
export const listJobs = (status: 'open' | 'done' = 'open') => api<{ jobs: JobRow[] }>(`${BASE}/api/jobs?status=${status}`).then((r) => r.jobs)
export const getJob = (id: string) => api<{ job: Job }>(`${BASE}/api/jobs/${id}`).then((r) => r.job)
export const createJob = (customer: string, job_type: JobType, data: JobData) =>
  api<{ job: Job }>(at('/api/jobs'), { method: 'POST', body: JSON.stringify({ customer, job_type, data }) }).then((r) => r.job)
export const saveJob = (id: string, patch: Partial<Pick<Job, 'customer' | 'job_type' | 'station' | 'status' | 'data'>>) =>
  api<{ job: Job }>(`${BASE}/api/jobs/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }).then((r) => r.job)

/** Saves an image to the job's file storage and returns its permanent URL. */
export async function uploadImage(jobId: string, name: string, blob: Blob) {
  const hook = (globalThis as { __artProUpload?: (n: string, b: Blob) => Promise<string> }).__artProUpload // test seam
  if (hook) return hook(name, blob)
  const ext = blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : blob.type === 'image/tiff' ? 'tif' : 'png'
  const safe = name.replace(/[^a-z0-9_-]+/gi, '-').slice(0, 40) || 'art'
  const r = await upload(`jobs/${jobId}/${safe}.${ext}`, blob, { access: 'public', handleUploadUrl: at('/api/upload'), multipart: blob.size > 8 * 1024 * 1024, contentType: blob.type || 'image/png' })
  return r.url
}

const local = new Map<string, Promise<string>>()
/** Remote art → same-origin object URL (safe for canvas pixel access). Cached per page load. */
export function localUrl(url: string): Promise<string> {
  if (!/^https?:/.test(url)) return Promise.resolve(url)
  let p = local.get(url)
  if (!p) {
    p = (async () => {
      let r: Response | null = null
      try {
        r = await fetch(url)
      } catch {
        r = null
      }
      if (!r || !r.ok) r = await fetch(at('/api/file?u=') + encodeURIComponent(url))
      if (!r.ok) throw new Error('Could not load saved art')
      return URL.createObjectURL(await r.blob())
    })()
    p.catch(() => local.delete(url))
    local.set(url, p)
  }
  return p
}

/** Tiny preview for the job list. */
export async function thumbFrom(src: string) {
  const img = new Image()
  img.src = src
  await img.decode()
  const s = 160 / Math.max(img.naturalWidth, img.naturalHeight)
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(img.naturalWidth * s))
  c.height = Math.max(1, Math.round(img.naturalHeight * s))
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  return c.toDataURL('image/webp', 0.7)
}
