import { NextResponse, type NextRequest } from "next/server";
import { boardEntries } from "@/lib/board-feed";
import { safeEqual } from "@/lib/shop-auth";
import { dbConfigured, loadAll } from "@/lib/server/db";

/**
 * The Shop Job Board's second feed (next to WooCommerce): orders sent to
 * production. Server-to-server only, with the shared MOCKUP_PRO_SECRET.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.MOCKUP_PRO_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || !safeEqual(given, secret)) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  if (!dbConfigured()) return NextResponse.json({ error: "No database." }, { status: 503 });
  try {
    const { orders, customers, assets } = await loadAll();
    return NextResponse.json({ fetchedAt: Date.now(), orders: boardEntries(orders, customers, assets) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't load." }, { status: 500 });
  }
}
