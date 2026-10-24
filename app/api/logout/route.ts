import { NextResponse } from "next/server";
import { signOutCustomer } from "@/lib/server/session";

export async function POST() {
  await signOutCustomer();
  return NextResponse.json({ ok: true });
}
