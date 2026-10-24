import { NextResponse, type NextRequest } from "next/server";
import { artUploadLink, dbConfigured } from "@/lib/server/db";
import { who } from "@/lib/server/session";

/** A one-time upload link for artwork, for the shop or the customer it belongs to. */
export async function POST(request: NextRequest) {
  if (!dbConfigured()) return NextResponse.json({ mode: "local" }, { status: 503 });
  try {
    const { customerId, ext } = (await request.json()) as { customerId?: string; ext?: string };
    const me = await who();
    if (!customerId || !(me.shop || me.customerId === customerId)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
    return NextResponse.json(await artUploadLink(customerId, ext ?? "png"));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't start the upload." }, { status: 500 });
  }
}
