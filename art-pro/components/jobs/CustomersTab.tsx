'use client'
import { useEffect, useState } from 'react'
import { listJobs } from '@/lib/jobs'
import type { MpCustomer, MpCustomerOrder } from '@/lib/mp-types'
import { CLOSED, EDITABLE } from '@/lib/mp-types'
import { mpCustomer, openOrderJob, shopCustomerUrl } from '@/lib/mp-client'
import { designsFromFiles } from './JobsHome'
import '../../app/customers.css'

const SPOT: Record<string, string> = { 'full-front': 'Front', 'full-back': 'Back', 'left-chest': 'Left chest', 'right-chest': 'Right chest', 'left-sleeve': 'Sleeve', 'right-sleeve': 'Sleeve', 'names-numbers': 'Names & numbers' }
const GARMENT: Record<string, string> = { 'gildan-5000': 'Gildan 5000 tee', 'gildan-18500': 'Gildan 18500 hoodie' }

export type CurrentCustomer = { name: string; fileNo: string }
/** The customer file being worked on (shown in the header) — kept for this browser tab. */
export function rememberCustomer(c: CurrentCustomer | null) {
  try {
    if (c) sessionStorage.setItem('artpro.customer', JSON.stringify({ name: c.name, fileNo: c.fileNo }))
    else sessionStorage.removeItem('artpro.customer')
  } catch {}
  window.dispatchEvent(new Event('artpro-customer'))
}
export function currentCustomer(): CurrentCustomer | null {
  try { return JSON.parse(sessionStorage.getItem('artpro.customer') || 'null') } catch { return null }
}

/** Opens one Mockup Pro order in Art Pro (used by the #order= link and the Edit buttons). */
export function useOrderOpener(onOpen: (id: string) => void) {
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  async function open(ref: string) {
    setErr('')
    try {
      const jobs = await listJobs('open').catch(() => [])
      onOpen(await openOrderJob(ref, jobs, (jobId, t, fs) => designsFromFiles(jobId, t, fs, 1, setBusy), setBusy))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not open that order')
    } finally {
      setBusy('')
    }
  }
  return { open, busy, err }
}

/** Opens the order named in the link (#order=MP-1056) as soon as the page loads. */
export function OrderLink({ orderRef, onOpen, onCancel }: { orderRef: string; onOpen: (id: string) => void; onCancel: () => void }) {
  const { open, busy, err } = useOrderOpener(onOpen)
  useEffect(() => { void open(orderRef) }, [orderRef]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className="card">
      <h3>Opening Mockup Pro order {orderRef}</h3>
      {busy && <p className="working"><span className="spin" aria-hidden="true" />{busy}</p>}
      {err && <><p className="err">{err}</p><button type="button" className="btn" onClick={onCancel}>Back to jobs</button></>}
    </section>
  )
}

/** One customer's profile inside Mockup Studio, opened from their Mockup Pro customer file. */
export default function CustomerProfile({ fileRef, onOpen }: { fileRef: string; onOpen: (id: string) => void }) {
  const [sel, setSel] = useState<{ customer: MpCustomer; orders: MpCustomerOrder[] } | null>(null)
  const [msg, setMsg] = useState('')
  const opener = useOrderOpener(onOpen)

  useEffect(() => {
    let off = false
    setSel(null)
    setMsg('')
    mpCustomer(fileRef).then((r) => { if (!off) { setSel(r); rememberCustomer(r.customer) } }).catch((e) => { if (!off) setMsg(e instanceof Error ? e.message : 'Could not load') })
    return () => { off = true }
  }, [fileRef])

  if (msg) return <section className="card"><p className="err">{msg}</p><a className="btn" href="/shop">‹ Back to customers</a></section>
  if (!sel) return <section className="card"><p className="working"><span className="spin" aria-hidden="true" />Opening customer {fileRef}…</p></section>

  return (
    <section className="card">
      <div className="sendhead">
        <h3>{sel.customer.name} <span className="muted small">{sel.customer.fileNo}{sel.customer.org ? ` · ${sel.customer.org}` : ''}</span></h3>
        <a className="mplink" href={shopCustomerUrl(sel.customer.fileNo)}>‹ Back to customer file</a>
      </div>
      <p className="muted small">Pick an order to work on its art. Changes save back to this customer&apos;s file.</p>
      {opener.busy && <p className="working"><span className="spin" aria-hidden="true" />{opener.busy}</p>}
      {opener.err && <p className="err">{opener.err}</p>}
      {!sel.orders.length && <p className="muted">No orders yet. Start one from the customer file.</p>}
      <div className="orderlist">
        {sel.orders.map((o) => {
          const editable = EDITABLE.includes(o.status)
          const need = o.designs.flatMap((d) => d.spots).filter((s) => s.needsArt).length
          return (
            <div key={o.id} className="ordercard">
              <div className="orderhead">
                <strong>{o.orderNo}</strong>
                <span className={`stat ${o.status}`}>{o.status.replace('_', ' ')}</span>
                {need > 0 && <span className="need small">{need} need{need > 1 ? '' : 's'} art work</span>}
                <span className="muted small">{new Date(o.createdAt).toLocaleDateString()}</span>
                <button type="button" className={`btn small ${editable ? 'primary' : ''}`} disabled={!!opener.busy} onClick={() => opener.open(o.orderNo)}>
                  {editable ? 'Edit art ▸' : 'View (locked)'}
                </button>
              </div>
              {o.designs.map((d, i) => (
                <div key={i} className="orderdesign">
                  {d.spots.map((s, k) => (s.src ? <img key={k} src={s.src} alt="" className="thumb checker" /> : null))}
                  <span>{d.name} · {GARMENT[d.garmentId] || d.garmentId} · {d.color} · {d.spots.map((s) => `${SPOT[s.spotId] || s.spotId}${s.sizeLabel ? ` ${s.sizeLabel}` : ''}`).join(', ')}</span>
                </div>
              ))}
              {CLOSED.includes(o.status) && <p className="muted small">Closed out ({o.status}). You can still fix the art; rebuild the gang sheet before reprinting.</p>}
            </div>
          )
        })}
      </div>
    </section>
  )
}
