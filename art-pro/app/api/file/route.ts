export const runtime = 'nodejs'

/** Same-origin pass-through for saved art (only our Blob store), used if a direct fetch is blocked. */
export async function GET(req: Request) {
  const u = new URL(req.url).searchParams.get('u') || ''
  let target: URL
  try {
    target = new URL(u)
  } catch {
    return new Response('bad url', { status: 400 })
  }
  if (target.protocol !== 'https:' || !target.hostname.endsWith('.public.blob.vercel-storage.com')) return new Response('not allowed', { status: 403 })
  const up = await fetch(target)
  if (!up.ok || !up.body) return new Response('not found', { status: 404 })
  return new Response(up.body, { headers: { 'content-type': up.headers.get('content-type') || 'image/png', 'cache-control': 'private, max-age=3600' } })
}
