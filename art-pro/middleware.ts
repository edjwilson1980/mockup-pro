import { NextResponse, type NextRequest } from 'next/server'

/**
 * Art Pro has no sign-in of its own. It uses the Mockup Pro shop sign-in:
 * the shop's `mp_shop` cookie is checked against Mockup Pro itself, so the
 * shop password never has to be copied here.
 */
const SHOP = process.env.SHOP_ORIGIN || 'https://mockup-pro-rho.vercel.app'
const ok = new Map<string, number>()

async function signedIn(cookie: string) {
  const until = ok.get(cookie)
  if (until && until > Date.now()) return true
  try {
    const r = await fetch(`${SHOP}/shop`, { headers: { cookie: `mp_shop=${cookie}` }, redirect: 'manual', cache: 'no-store' })
    if (r.status === 200) {
      ok.set(cookie, Date.now() + 10 * 60 * 1000)
      return true
    }
  } catch {}
  return false
}

export async function middleware(req: NextRequest) {
  if (process.env.ART_PRO_OPEN === '1') return NextResponse.next()
  if (req.headers.get('x-vercel-signature')) return NextResponse.next() // Blob service callbacks
  const cookie = req.cookies.get('mp_shop')?.value
  if (cookie && (await signedIn(cookie))) return NextResponse.next()
  if (req.nextUrl.pathname.includes('/api/')) return NextResponse.json({ error: 'Sign in to the shop first' }, { status: 401 })
  return NextResponse.redirect(`${SHOP}/shop-login?next=${encodeURIComponent('/shop/mockup')}`)
}

export const config = { matcher: ['/', '/((?!_next/static|_next/image|favicon.ico|mockups/).*)'] }
