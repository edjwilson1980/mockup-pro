import { NextResponse, type NextRequest } from "next/server";
import { CheckInError, parseLookup } from "@/lib/customer";
import { dbConfigured, findCustomerBy } from "@/lib/server/db";
import { signInCustomer } from "@/lib/server/session";

/** Returning customers: phone number or email opens their own file. */
export async function POST(request: NextRequest) {
  if (!dbConfigured()) return NextResponse.json({ mode: "local" }, { status: 503 });
  try {
    const { query } = (await request.json()) as { query?: string };
    const { field, value } = parseLookup(query ?? "");
    const c = await findCustomerBy(field, value);
    if (c) await signInCustomer(c.id);
    return NextResponse.json({ customerId: c?.id ?? null });
  } catch (e) {
    const status = e instanceof CheckInError ? 400 : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't search." }, { status });
  }
}
