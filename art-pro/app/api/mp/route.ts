import { NextResponse } from 'next/server'
import { db, dbReady } from '@/lib/db'
import { mpCustomers, mpGet } from '@/lib/mp'
import type { MpAsset, MpCustomer, MpCustomerOrder, MpOrder, MpOrderRow } from '@/lib/mp-types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET ?view=orders → Mockup Pro orders still being worked on; ?view=customers&q= → customer search. */
export async function GET(req: Request) {
  if (!dbReady()) return NextResponse.json({ error: 'Database is not set up' }, { status: 503 })
  const u = new URL(req.url)
  try {
    if (u.searchParams.get('view') === 'customers') return NextResponse.json({ customers: await mpCustomers(u.searchParams.get('q') || '') })
    if (u.searchParams.get('view') === 'customer') {
      const ref = u.searchParams.get('id') || ''
      const byFile = /^C-[\w-]{1,20}$/i.test(ref)
      if (!byFile && !/^cust-[\w-]{1,40}$/.test(ref)) return NextResponse.json({ error: 'bad id' }, { status: 400 })
      const [c] = byFile
        ? ((await db(`mp_records?kind=eq.customer&data->>fileNo=eq.${encodeURIComponent(ref.toUpperCase())}&select=data&limit=1`)) as { data: MpCustomer }[]).map((r) => r.data)
        : await mpGet<MpCustomer>('customer', [ref])
      if (!c) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
      const list = ((await db(`mp_records?kind=eq.order&customer_id=eq.${c.id}&select=data&order=updated_at.desc&limit=40`)) as { data: MpOrder }[]).map((r) => r.data)
      const assets = await mpGet<MpAsset>('asset', [...new Set(list.flatMap((o) => o.designs.flatMap((d) => d.spots.map((s) => s.assetId))))])
      const orders: MpCustomerOrder[] = list.map((o) => ({
        id: o.id, orderNo: o.orderNo, status: o.status, createdAt: o.createdAt,
        designs: o.designs.map((d) => ({
          name: d.name, color: d.color, garmentId: d.garmentId,
          spots: d.spots.map((s) => { const a = assets.find((x) => x.id === s.assetId); return { spotId: s.spotId, sizeLabel: s.sizeLabel, src: a?.src, needsArt: !a || (!a.artPro && !!a.checks?.some((k) => !k.ok)) } }),
        })),
      }))
      return NextResponse.json({ customer: { id: c.id, name: c.name, org: c.org, fileNo: c.fileNo, phone: c.phone }, orders })
    }
    const orders = ((await db(`mp_records?kind=eq.order&data->>status=in.(draft,submitted,changes_requested,proof_sent,approved)&select=data&order=updated_at.desc&limit=30`)) as { data: MpOrder }[]).map((r) => r.data)
    const custIds = [...new Set(orders.map((o) => o.customerId))]
    const assetIds = [...new Set(orders.flatMap((o) => o.designs.flatMap((d) => d.spots.map((s) => s.assetId))))].filter(Boolean)
    const q = (ids: string[]) => ids.map((i) => `"${i}"`).join(',')
    const custs = custIds.length ? ((await db(`mp_records?kind=eq.customer&id=in.(${encodeURIComponent(q(custIds))})&select=data`)) as { data: MpCustomer }[]).map((r) => r.data) : []
    const assets = assetIds.length ? ((await db(`mp_records?kind=eq.asset&id=in.(${encodeURIComponent(q(assetIds))})&select=data`)) as { data: MpAsset }[]).map((r) => r.data) : []
    const rows: MpOrderRow[] = orders.map((o) => {
      const c = custs.find((x) => x.id === o.customerId)
      const ids = o.designs.flatMap((d) => d.spots.map((s) => s.assetId))
      return {
        id: o.id, orderNo: o.orderNo, status: o.status, customerId: o.customerId, customer: c?.name || 'Customer', fileNo: c?.fileNo || '',
        createdAt: o.createdAt, designs: ids.length,
        needsArt: assets.filter((a) => ids.includes(a.id) && !a.artPro && a.checks?.some((k) => !k.ok)).length,
        garment: o.designs[0]?.garmentId || '', color: o.designs[0]?.color || '',
      }
    })
    return NextResponse.json({ orders: rows })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 502 })
  }
}
