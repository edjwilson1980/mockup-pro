import { NextResponse } from 'next/server'
import { db, dbReady } from '@/lib/db'
import { mpGet } from '@/lib/mp'
import type { MpAsset, MpCustomer, MpOrder } from '@/lib/mp-types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** One Mockup Pro order with its customer and art. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!dbReady()) return NextResponse.json({ error: 'Database is not set up' }, { status: 503 })
  const byNo = /^MP-\d{1,9}$/i.test(id)
  if (!byNo && !/^ord-[\w-]{1,40}$/.test(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 })
  try {
    const [order] = byNo
      ? ((await db(`mp_records?kind=eq.order&data->>orderNo=eq.${id.toUpperCase()}&select=data&limit=1`)) as { data: MpOrder }[]).map((r) => r.data)
      : await mpGet<MpOrder>('order', [id])
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    const [customer] = await mpGet<MpCustomer>('customer', [order.customerId])
    const assets = await mpGet<MpAsset>('asset', order.designs.flatMap((d) => d.spots.map((s) => s.assetId)))
    return NextResponse.json({ order, customer: customer ? { id: customer.id, name: customer.name, org: customer.org, fileNo: customer.fileNo } : null, assets })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 502 })
  }
}
