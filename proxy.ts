import { NextResponse, type NextRequest } from "next/server";
import { SHOP_COOKIE, isShopToken } from "@/lib/shop-auth";

/** Everything under /shop needs the shop password. */
export async function proxy(request: NextRequest) {
  if (await isShopToken(request.cookies.get(SHOP_COOKIE)?.value)) return NextResponse.next();
  const login = new URL("/shop-login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/shop", "/shop/:path*"],
};
