// Server-only: talks to the art_pro_jobs table in Supabase through its REST API.
// Row access is locked by an RLS policy that checks the x-art-pro-key header.

const URL_ = process.env.ART_PRO_DB_URL || ''
const KEY = process.env.ART_PRO_DB_ANON_KEY || ''
const SECRET = process.env.ART_PRO_DB_SECRET || ''

export const dbReady = () => Boolean(URL_ && KEY && SECRET)

export async function db(path: string, init: RequestInit = {}) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      apikey: KEY,
      'x-art-pro-key': SECRET,
      'content-type': 'application/json',
      prefer: 'return=representation',
      ...(init.headers || {}),
    },
  })
  const text = await r.text()
  const body = text ? JSON.parse(text) : null
  if (!r.ok) throw new Error((body && (body.message || body.hint)) || `Database error ${r.status}`)
  return body
}

export const JOB_TYPES = ['tee', 'hoodie', 'dtf', 'sticker', 'cards', 'flyer', 'banner', 'other'] as const
export const STATIONS = ['artwork', 'mockup', 'gang', 'layout', 'done'] as const
