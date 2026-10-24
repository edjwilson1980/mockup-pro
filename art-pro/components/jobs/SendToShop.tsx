'use client'
import { useEffect, useState } from 'react'
import type { Job } from '@/lib/jobs'
import { CLOSED, EDITABLE, REPROOF, type MpCustomer } from '@/lib/mp-types'
import { mpCustomers, sendToMockupPro, shopCustomerUrl } from '@/lib/mp-client'

type Props = {
  job: Job
  flush: () => Promise<void>
  onSent: (mp: NonNullable<Job['data']['mp']>, message: string) => void
  onClose: () => void
}

/** Sends the finished art (print PNG + CMYK TIFF) into a Mockup Pro customer order. */
export default function SendToShop({ job, flush, onSent, onClose }: Props) {
  const linked = job.data.mp
  const locked = !!linked?.status && !EDITABLE.includes(linked.status)
  const [q, setQ] = useState(job.customer || '')
  const [list, setList] = useState<MpCustomer[] | null>(null)
  const [pick, setPick] = useState<MpCustomer | null>(null)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [done, setDone] = useState<{ orderNo: string; fileNo: string; customer: string; reproof?: boolean; closed?: boolean } | null>(null)

  useEffect(() => {
    if (linked) return
    let off = false
    const t = setTimeout(() => mpCustomers(q).then((c) => { if (!off) setList(c) }).catch((e) => { if (!off) setErr(e.message) }), 250)
    return () => { off = true; clearTimeout(t) }
  }, [q, linked])

  async function send() {
    setErr('')
    try {
      await flush()
      const r = await sendToMockupPro(job, linked ? null : pick?.id || null, setBusy)
      const mp = { orderId: r.orderId, orderNo: r.orderNo, customerId: linked?.customerId || pick!.id, customer: r.customer, fileNo: r.fileNo, sentAt: new Date().toISOString(), status: r.status }
      onSent(mp, `Sent to Mockup Pro order ${r.orderNo} (${r.customer}): ${r.fixed ? `${r.fixed} art file${r.fixed > 1 ? 's' : ''} replaced` : ''}${r.fixed && r.added ? ', ' : ''}${r.added ? `${r.added} design${r.added > 1 ? 's' : ''} added` : ''}. Print PNG for the proof + CMYK TIFF for printing. Send the proof from the customer file.`)
      setDone({ orderNo: r.orderNo, fileNo: r.fileNo, customer: r.customer, reproof: REPROOF.includes(linked?.status || ''), closed: CLOSED.includes(linked?.status || '') })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not send')
    } finally {
      setBusy('')
    }
  }

  return (
    <section className="card sendshop">
      <div className="sendhead">
        <h3>{linked ? 'Save to Mockup Pro' : 'Send to Mockup Pro'}</h3>
        <button type="button" className="btn small" onClick={onClose} disabled={!!busy}>Close</button>
      </div>
      {done ? (
        <div className="fixlog">
          <strong>Saved to order {done.orderNo} ✓</strong>
          {done.reproof && <span className="fixline">A proof had already gone out, so it is back to “needs a new proof”.</span>}
          {done.closed && <span className="fixline">The order stays closed out. Rebuild its gang sheet before reprinting.</span>}
          <span className="fixline">The proof mockup now uses the fixed art. The CMYK TIFF is attached for printing.</span>
          <a className="btn primary" href={shopCustomerUrl(done.fileNo)}>Open {done.customer}’s file to send the proof ▸</a>
        </div>
      ) : (
        <>
          {linked ? (
            <>
              <p>Order <strong>{linked.orderNo}</strong> · {linked.customer} <span className="muted">({linked.fileNo})</span>. Saves the art, shirt color, placement and print size to the order. The customer’s original uploads are kept.</p>
              {REPROOF.includes(linked.status || '') && <p className="warn small">A proof already went out for this order ({(linked.status || '').replace('_', ' ')}). Saving sends it back to “needs a new proof”.</p>}
              {CLOSED.includes(linked.status || '') && <p className="warn small">This order is already {linked.status}. Saving updates its art and CMYK file; the order stays {linked.status}. Rebuild the gang sheet before reprinting.</p>}
              {locked && <p className="err">This order is already {linked.status}. It can’t be changed now; start a new order instead.</p>}
            </>
          ) : (
            <>
              <p className="muted small">Pick the customer. A new order is made for them with this art, ready for the proof.</p>
              <input className="input" value={q} onChange={(e) => { setQ(e.target.value); setPick(null) }} placeholder="Search customer name, file # or phone" aria-label="Search customers" />
              <div className="custlist">
                {(list || []).map((c) => (
                  <button key={c.id} type="button" className={`custrow ${pick?.id === c.id ? 'on' : ''}`} onClick={() => setPick(c)}>
                    <strong>{c.name}</strong><span className="muted small">{c.fileNo}{c.org ? ` · ${c.org}` : ''}</span>
                  </button>
                ))}
                {list && !list.length && <span className="muted small">No customers match. Customers sign up through Mockup Pro first.</span>}
              </div>
            </>
          )}
          <p className="muted small">{job.data.designs.length} design{job.data.designs.length === 1 ? '' : 's'} · each goes as a 300 DPI print PNG (for the proof mockup) plus a CMYK TIFF (GRACoL 2013) for printing.</p>
          {err && <p className="err">{err}</p>}
          {busy && <p className="working"><span className="spin" aria-hidden="true" />{busy}</p>}
          <button type="button" className="btn primary" disabled={!!busy || locked || !job.data.designs.length || (!linked && !pick)} onClick={send}>
            {linked ? `Save to order ${linked.orderNo}` : pick ? `Create order for ${pick.name}` : 'Pick a customer'}
          </button>
        </>
      )}
    </section>
  )
}
