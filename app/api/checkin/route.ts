import { NextResponse, type NextRequest } from "next/server";
import { CheckInError, cleanCheckIn, newCustomer, type CheckInInput } from "@/lib/customer";
import { NEW_FILE_NO, dbConfigured, findCustomerBy, write } from "@/lib/server/db";
import { signInCustomer } from "@/lib/server/session";

/** Spec 2.2: phone OR email matches → that customer's file; otherwise a new C-#### file. */
export async function POST(request: NextRequest) {
  if (!dbConfigured()) return NextResponse.json({ mode: "local" }, { status: 503 });
  try {
    const input = (await request.json()) as CheckInInput;
    const { phone, email } = cleanCheckIn(input);
    const [byPhone, byEmail] = await Promise.all([findCustomerBy("phone", phone), findCustomerBy("email", email)]);
    // Phone and email point at two different files: don't guess, use the phone match and flag it.
    const flagged = !!byPhone && !!byEmail && byPhone.id !== byEmail.id;
    const match = byPhone ?? byEmail;
    if (match) {
      await signInCustomer(match.id);
      return NextResponse.json({ customerId: match.id, returning: true, flagged });
    }
    const [saved] = await write([{ kind: "customer", data: newCustomer(input, `cust-${crypto.randomUUID().slice(0, 8)}`, NEW_FILE_NO, new Date().toISOString()) }]);
    await signInCustomer(saved.data.id);
    return NextResponse.json({ customerId: saved.data.id, returning: false, flagged: false });
  } catch (e) {
    const status = e instanceof CheckInError ? 400 : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't check in." }, { status });
  }
}
