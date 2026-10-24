// Browser side of the Mockup Pro link.
import { at } from './base'
import { JOB_TYPES, createJob, getJob, localUrl, pxOf, saveJob, srcOf, uploadImage, type Job, type JobDesign } from './jobs'
import { GARMENT_OF_TYPE, PLACE_OF_SPOT, SPOT_OF_PLACE, widthFromLabel, type MpAsset, type MpCustomer, type MpCustomerOrder, type MpOrder, type MpOrderRow } from './mp-types'
import { renderArt } from './render'
import { PLACEMENT_BOX } from './garments'
import { cmykTiffFromUrl } from './tiff'

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(at(path), { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`)
  return j as T
}

export const mpOrders = () => call<{ orders: MpOrderRow[] }>('/api/mp?view=orders').then((r) => r.orders)
export const mpCustomers = (q: string) => call<{ customers: MpCustomer[] }>(`/api/mp?view=customers&q=${encodeURIComponent(q)}`).then((r) => r.customers)
export const mpCustomer = (id: string) => call<{ customer: MpCustomer; orders: MpCustomerOrder[] }>(`/api/mp?view=customer&id=${encodeURIComponent(id)}`)
export const shopCustomerUrl = (fileNo: string) => `/shop/customers/${encodeURIComponent(fileNo)}`

type MakeDesigns = (jobId: string, type: Job['job_type'], files: File[]) => Promise<JobDesign[]>
type OrderBundle = { order: MpOrder; customer: MpCustomer | null; assets: MpAsset[] }

const mpLink = (order: MpOrder, customer: MpCustomer | null): NonNullable<Job['data']['mp']> =>
  ({ orderId: order.id, orderNo: order.orderNo, customerId: order.customerId, customer: customer?.name || '', fileNo: customer?.fileNo || '', status: order.status })

/** Loads the order's art into an Art Pro job (one design per art spot). */
async function fillJob(job: Job, { order, customer, assets }: OrderBundle, makeDesigns: MakeDesigns, status: (s: string) => void) {
  const type = job.job_type
  const spots = order.designs.flatMap((d) => d.spots.map((s) => ({ d, s, a: assets.find((x) => x.id === s.assetId) }))).filter((x) => x.a)
  const files: File[] = []
  for (const [i, x] of spots.entries()) {
    status(`Loading art ${i + 1} of ${spots.length}…`)
    const blob = await (await fetch(await localUrl(x.a!.originalSrc || x.a!.src))).blob()
    files.push(new File([blob], `${x.a!.name || 'art'}.${blob.type.includes('png') ? 'png' : 'jpg'}`, { type: blob.type || 'image/png' }))
  }
  const designs = (await makeDesigns(job.id, type, files)).map((d, i) => {
    const { d: md, s } = spots[i]
    const qty = Object.values(md.sizeCounts || {}).reduce((a, b) => a + (Number(b) || 0), 0)
    return { ...d, mp: { assetId: s.assetId, spotId: s.spotId, designId: md.id, spotRowId: s.id }, place: PLACE_OF_SPOT[s.spotId] || 'Front', widthIn: s.widthIn || widthFromLabel(s.sizeLabel) || d.widthIn, qty: qty || null }
  })
  const lines = spots.map((x, i) => `#${i + 1} ${x.a!.name}: ${x.a!.checks.filter((c) => !c.ok).map((c) => c.text).join(' ') || 'no problems reported'}`)
  const data = { ...job.data, designs, pending: undefined, color: job.data.color || order.designs[0]?.color || null, mp: mpLink(order, customer), chat: [{ from: 'bot' as const, text: `From Mockup Pro order ${order.orderNo} (${customer?.name || 'customer'}). What the customer upload check found:\n${lines.join('\n')}` }] }
  await saveJob(job.id, { customer: job.customer || customer?.name || '', data })
  return job.id
}

/** Brings a Mockup Pro order into Art Pro as a new job (one design per art spot). */
export async function jobFromOrder(orderId: string, makeDesigns: MakeDesigns, status: (s: string) => void) {
  status('Opening the Mockup Pro order…')
  const b = await call<OrderBundle>(`/api/mp/order/${orderId}`)
  const type: Job['job_type'] = b.order.designs.some((d) => d.garmentId === 'gildan-18500') ? 'hoodie' : 'tee'
  const job = await createJob(b.customer?.name || '', type, { designs: [], chat: [], color: b.order.designs[0]?.color || null, mp: mpLink(b.order, b.customer) })
  return fillJob(job, b, makeDesigns, status)
}

/**
 * Opens a Mockup Pro order (by ord- id or MP- number) in its own Art Pro project:
 * the job linked on the order (made automatically when the customer submitted), else an open job for it, else a new one.
 */
export async function openOrderJob(ref: string, openJobs: { id: string; mp?: string | null }[], makeDesigns: MakeDesigns, status: (s: string) => void) {
  status('Opening the Mockup Pro order…')
  const b = await call<OrderBundle>(`/api/mp/order/${encodeURIComponent(ref)}`)
  // The order's job: linked on the order, or made by the database when the customer submitted.
  const linkedId = (b.order.artPro as { jobId?: string } | undefined)?.jobId || openJobs.find((j) => j.mp === b.order.orderNo)?.id
  const linked = linkedId ? await getJob(linkedId).catch(() => null) : null
  if (!linked) return jobFromOrder(b.order.id, makeDesigns, status)
  // A job made automatically starts empty: load the customer's art into it the first time it opens.
  if (!linked.data.designs.length) return fillJob(linked, b, makeDesigns, status)
  // Keep the order's current status on the job.
  if (linked.data.mp?.status !== b.order.status) await saveJob(linked.id, { data: { ...linked.data, mp: mpLink(b.order, b.customer) } })
  return linked.id
}

const placeOf = (d: JobDesign) => d.place || (d.n === 2 ? 'Back' : 'Front')

/** Print width in inches, same rule as the gang sheet station. */
function printWidth(d: JobDesign, job: Job) {
  if (d.widthIn) return d.widthIn
  if (JOB_TYPES[job.job_type].group !== 'apparel') return Math.min(JOB_TYPES[job.job_type].defaultWidth, 21.7)
  const [bw, bh] = (PLACEMENT_BOX[job.job_type === 'hoodie' ? 'hoodie' : 'tee'] || PLACEMENT_BOX.tee)[placeOf(d)]
  const [w, h] = pxOf(d)
  return Math.round(Math.min(bw, (bh * w) / h) * 100) / 100
}

const noteOf = (d: JobDesign) => [d.knockout !== 'none' ? `${d.knockout.replace('-all', '')} background removed` : '', d.halftone ? `halftone ${d.halftone.lpi} LPI` : '', d.fixed ? 'cleaned up / upscaled' : ''].filter(Boolean).join(' · ')

/** Renders every design at print size (PNG for Mockup Pro + CMYK TIFF), uploads both, and updates/creates the Mockup Pro order. */
export async function sendToMockupPro(job: Job, customerId: string | null, status: (s: string) => void) {
  const out = []
  for (const [i, d] of job.data.designs.entries()) {
    const w = printWidth(d, job)
    status(`#${d.n}: building the 300 DPI print file (${i + 1} of ${job.data.designs.length})…`)
    const r = await renderArt(srcOf(d), pxOf(d), { widthIn: w, dpi: 300, knockout: d.knockout, halftone: d.halftone, hardAlpha: true })
    const png = await (await fetch(r.url)).blob()
    const src = await uploadImage(job.id, `${d.name}-print`, png)
    status(`#${d.n}: converting to CMYK (GRACoL 2013)…`)
    const tif = await cmykTiffFromUrl(r.url, 300)
    const cmykSrc = await uploadImage(job.id, `${d.name}-cmyk`, tif)
    out.push({ assetId: d.mp?.assetId, designId: d.mp?.designId, spotRowId: d.mp?.spotRowId, name: d.name, src, cmykSrc, widthPx: r.px[0], heightPx: r.px[1], widthIn: r.widthIn, heightIn: r.heightIn, spotId: SPOT_OF_PLACE[placeOf(d)] || 'full-front', note: noteOf(d) })
  }
  status('Sending to Mockup Pro…')
  const qty = job.data.designs.reduce((a, d) => a + (d.qty || 0), 0) || job.data.qty || null
  return call<{ orderId: string; orderNo: string; status: string; fileNo: string; customer: string; fixed: number; added: number }>('/api/mp/push', {
    method: 'POST',
    body: JSON.stringify({ jobId: job.id, jobNo: job.number, orderId: job.data.mp?.orderId, customerId, garmentId: GARMENT_OF_TYPE[job.job_type] || 'gildan-5000', color: job.data.color || 'Black', qty, designs: out }),
  })
}

export const canSendToMockupPro = (job: Job) => !!job.data.mp || JOB_TYPES[job.job_type].group === 'apparel'
