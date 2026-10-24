import { NextResponse } from 'next/server'
import { db, dbReady } from '@/lib/db'
import { hex8, mpGet, mpPut } from '@/lib/mp'
import { CLOSED, EDITABLE, REPROOF, type MpAsset, type MpCustomer, type MpDesign, type MpOrder } from '@/lib/mp-types'

/** Art Pro sizes are exact inches, so they go to Mockup Pro as a custom size: no size name, width and height only.
 *  (Mockup Pro's gang sheet only accepts size names from its print-sizes.json.) */
const r2 = (n: number) => Math.round(n * 100) / 100
const customSize = (d: { widthIn: number; heightIn: number }) => ({ sizeLabel: null, widthIn: r2(d.widthIn), heightIn: r2(d.heightIn) })

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type In = {
  jobId: string; jobNo: number; orderId?: string; customerId?: string
  garmentId: string; color: string; qty?: number | null; mockups?: string[]
  designs: { assetId?: string; designId?: string; spotRowId?: string; name: string; src: string; cmykSrc?: string; widthPx: number; heightPx: number; widthIn: number; heightIn: number; spotId: string; note: string }[]
}

const blobUrl = (u: unknown) => typeof u === 'string' && /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\//i.test(u)
const SIZES = ['S', 'M', 'L', 'XL', '2XL', '3XL']

/**
 * Sends Art Pro's finished art into Mockup Pro:
 * - an order that came from Mockup Pro gets its art replaced (originals kept) and a log line;
 * - otherwise a new order is created for the chosen customer, ready for the shop to send the proof.
 */
export async function POST(req: Request) {
  if (!dbReady()) return NextResponse.json({ error: 'Database is not set up' }, { status: 503 })
  const b = (await req.json().catch(() => null)) as In | null
  if (!b || !/^[0-9a-f-]{36}$/i.test(b.jobId) || !Array.isArray(b.designs) || !b.designs.length || b.designs.length > 30) return NextResponse.json({ error: 'bad request' }, { status: 400 })
  if (b.designs.some((d) => !blobUrl(d.src) || (d.cmykSrc && !blobUrl(d.cmykSrc)))) return NextResponse.json({ error: 'bad file link' }, { status: 400 })
  if ((b.mockups || []).some((m) => !blobUrl(m))) return NextResponse.json({ error: 'bad mockup link' }, { status: 400 })
  const now = new Date().toISOString()
  const who = `Art Pro job #${b.jobNo}`

  try {
    let order: MpOrder | null = null
    let customerId = b.customerId || ''
    if (b.orderId) {
      ;[order] = await mpGet<MpOrder>('order', [b.orderId])
      if (!order) return NextResponse.json({ error: 'That Mockup Pro order was not found' }, { status: 404 })
      customerId = order.customerId
      if (!EDITABLE.includes(order.status)) return NextResponse.json({ error: `Order ${order.orderNo} is already ${order.status}. It can't be changed now; start a new order instead.` }, { status: 409 })
    }
    const [customer] = await mpGet<MpCustomer>('customer', [customerId])
    if (!customer) return NextResponse.json({ error: 'Pick a Mockup Pro customer first' }, { status: 400 })

    const existing = await mpGet<MpAsset>('asset', b.designs.map((d) => d.assetId).filter((x): x is string => !!x))
    const newSpots: { spot: MpDesign['spots'][number]; name: string }[] = []
    let fixed = 0

    for (const d of b.designs) {
      const prev = existing.find((a) => a.id === d.assetId && a.customerId === customerId)
      const asset: MpAsset = {
        ...(prev || { id: `art-${hex8()}`, kind: 'print-art' as const, createdAt: now, customerId }),
        name: prev?.name || d.name.slice(0, 80),
        src: d.src,
        widthPx: Math.round(d.widthPx),
        heightPx: Math.round(d.heightPx),
        checks: [{ ok: true, text: `Print-ready from Art Pro: ${d.widthIn.toFixed(2)} × ${d.heightIn.toFixed(2)} in at 300 DPI${d.note ? `, ${d.note}` : ''}` }, ...(d.cmykSrc ? [{ ok: true, text: 'CMYK print file (GRACoL 2013) attached' }] : [])],
        ...(prev ? { originalSrc: prev.originalSrc || prev.src } : {}),
        ...(d.cmykSrc ? { cmykSrc: d.cmykSrc } : {}),
        artPro: { jobId: b.jobId, jobNo: b.jobNo, at: now, note: d.note },
      }
      await mpPut('asset', asset.id, customerId, asset, !!prev)
      if (prev) fixed++
      else newSpots.push({ name: d.name, spot: { id: `s-${hex8()}`, spotId: d.spotId, assetId: asset.id, ...customSize(d) } })
    }

    const newDesigns: MpDesign[] = newSpots.map(({ name, spot }) => ({
      id: `d-${hex8()}`, name: name.slice(0, 60), color: b.color || 'Black', garmentId: b.garmentId, spots: [spot], roster: [], inStock: {},
      sizeCounts: Object.fromEntries(SIZES.map((s) => [s, 0])),
    }))
    const pieces = b.qty ? ` · ${b.qty} pieces (enter sizes)` : ''

    if (order) {
      // Write the job's color, garment, placement and print size back onto the order's own designs.
      const designs = order.designs.map((md) => {
        const mine = b.designs.filter((d) => d.designId === md.id)
        if (!mine.length) return md
        return {
          ...md, color: b.color || md.color, garmentId: b.garmentId || md.garmentId,
          spots: md.spots.map((s) => {
            const d = mine.find((x) => x.spotRowId === s.id || x.assetId === s.assetId)
            return d ? { ...s, spotId: d.spotId, ...customSize(d) } : s
          }),
        }
      })
      const wasApproved = REPROOF.includes(order.status)
      const events = [...order.events, { at: now, text: `Edited in ${who}: ${fixed} art replaced${newDesigns.length ? `, ${newDesigns.length} added` : ''}, color ${b.color}` }]
      if (wasApproved) events.push({ at: now, text: `Art changed while ${order.status.replace('_', ' ')}: needs a new proof` })
      if (CLOSED.includes(order.status)) events.push({ at: now, text: `Art updated after the order was ${order.status}: rebuild the gang sheet before reprinting` })
      order = {
        ...order,
        designs: [...designs, ...newDesigns],
        events,
        ...(wasApproved ? { status: 'submitted', approvedAt: null, approvedVia: null, proofToken: null } : {}),
        artPro: { jobId: b.jobId, jobNo: b.jobNo, mockups: b.mockups, qty: b.qty ?? undefined },
      }
      await mpPut('order', order.id, customerId, order, true)
    } else {
      const no = await db('rpc/art_pro_next_order_no', { method: 'POST', body: '{}' })
      const id = `ord-${hex8()}`
      order = {
        id, orderNo: `MP-${no}`, status: 'submitted', designs: newDesigns, customerId, createdAt: now,
        events: [{ at: now, text: `Order started from ${who}${pieces}` }],
        approvedAt: null, approvedVia: null, changeText: null, pressed: 0, proofToken: null,
        artPro: { jobId: b.jobId, jobNo: b.jobNo, mockups: b.mockups, qty: b.qty ?? undefined },
      }
      await mpPut('order', id, customerId, order, false)
    }
    return NextResponse.json({ orderId: order.id, orderNo: order.orderNo, status: order.status, fileNo: customer.fileNo, customer: customer.name, fixed, added: newDesigns.length })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 502 })
  }
}
