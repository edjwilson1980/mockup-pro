import { NextResponse } from 'next/server'
import { JOB_TYPES, db, dbReady } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COLS = 'id,number,customer,job_type,station,status,created_at,updated_at'

/** Open jobs (or ?status=done / all) for the home screen. */
export async function GET(req: Request) {
  if (!dbReady()) return NextResponse.json({ error: 'Job database is not set up' }, { status: 503 })
  const status = new URL(req.url).searchParams.get('status') || 'open'
  const filter = status === 'all' ? '' : `&status=eq.${status === 'done' ? 'done' : 'open'}`
  try {
    const rows = await db(`art_pro_jobs?select=${COLS},thumb:data->>thumb,mp:data->mp->>orderNo${filter}&order=updated_at.desc&limit=100`)
    return NextResponse.json({ jobs: rows })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 502 })
  }
}

export async function POST(req: Request) {
  if (!dbReady()) return NextResponse.json({ error: 'Job database is not set up' }, { status: 503 })
  const b = (await req.json().catch(() => ({}))) as { customer?: string; job_type?: string; data?: unknown }
  if (!b.job_type || !(JOB_TYPES as readonly string[]).includes(b.job_type)) return NextResponse.json({ error: 'job type?' }, { status: 400 })
  try {
    const rows = await db('art_pro_jobs', {
      method: 'POST',
      body: JSON.stringify({ customer: (b.customer || '').slice(0, 120), job_type: b.job_type, station: 'artwork', data: b.data || {} }),
    })
    return NextResponse.json({ job: rows[0] })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 502 })
  }
}
