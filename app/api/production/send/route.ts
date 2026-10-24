import { NextResponse, type NextRequest } from "next/server";
import { dbConfigured } from "@/lib/server/db";
import { runProduction } from "@/lib/server/production";
import { who } from "@/lib/server/session";

export const maxDuration = 300;

/** Shop only: (re)build the gang sheet for an approved order and wait for the result. */
export async function POST(request: NextRequest) {
  if (!dbConfigured()) return NextResponse.json({ error: "No database." }, { status: 503 });
  if (!(await who()).shop) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const { orderId } = (await request.json().catch(() => ({}))) as { orderId?: string };
  if (!orderId) return NextResponse.json({ error: "orderId is required." }, { status: 400 });
  try {
    const production = await runProduction(orderId, { origin: request.nextUrl.origin, force: true });
    return NextResponse.json({ production }, { status: production.status === "failed" ? 502 : 200 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't make the gang sheet." }, { status: 400 });
  }
}
