import { NextResponse } from 'next/server'
import { JOB_TYPES, STATIONS, db, dbReady } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const okId = (id: string) => /^[0-9a-f-]{36}$/i.test(id)

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!dbReady()) return NextResponse.json({ error: 'Job database is not set up' }, { status: 503 })
  if (!okId(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 })
  try {
    const rows = await db(`art_pro_jobs?id=eq.${id}&select=*`)
    if (!rows.length) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ job: rows[0] })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 502 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!dbReady()) return NextResponse.json({ error: 'Job database is not set up' }, { status: 503 })
  if (!okId(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 })
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const patch: Record<string, unknown> = {}
  if (typeof b.customer === 'string') patch.customer = b.customer.slice(0, 120)
  if (typeof b.job_type === 'string' && (JOB_TYPES as readonly string[]).includes(b.job_type)) patch.job_type = b.job_type
  if (typeof b.station === 'string' && (STATIONS as readonly string[]).includes(b.station)) patch.station = b.station
  if (b.status === 'open' || b.status === 'done') patch.status = b.status
  if (b.data && typeof b.data === 'object') patch.data = b.data
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'nothing to save' }, { status: 400 })
  try {
    const rows = await db(`art_pro_jobs?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
    return NextResponse.json({ job: rows[0] })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 502 })
  }
}
