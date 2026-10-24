// Customer check-in rules, shared by the browser (offline demo) and the server
// (/api/checkin, /api/find), so both accept and store exactly the same thing.

import { CONSENT_VERSION, ORDER_TEXTS_CONSENT, PROMO_CONSENT } from "./consent";
import type { Customer } from "./demo/types";

export class CheckInError extends Error {}

export type CheckInInput = { firstName: string; lastName: string; phone: string; email: string; smsOk: boolean; marketingOk: boolean };

/** +1 and 10 digits, from anything typed. */
export function normalizePhone(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return null;
}

export function formatPhone(e164: string): string {
  const d = e164.replace(/\D/g, "").slice(-10);
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** Checks the form and returns the cleaned name, phone and email. */
export function cleanCheckIn(input: CheckInInput): { name: string; phone: string; email: string } {
  const phone = normalizePhone(input.phone ?? "");
  const email = (input.email ?? "").trim().toLowerCase();
  if (!input.firstName?.trim()) throw new CheckInError("Enter your first name.");
  if (!input.lastName?.trim()) throw new CheckInError("Enter your last name.");
  if (!phone) throw new CheckInError("Enter a 10-digit mobile number.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new CheckInError("Enter a valid email address.");
  return { name: `${input.firstName.trim()} ${input.lastName.trim()}`, phone, email };
}

/** A new customer file, with the exact consent wording they agreed to. */
export function newCustomer(input: CheckInInput, id: string, fileNo: string, at: string): Customer {
  const { name, phone, email } = cleanCheckIn(input);
  const agreed = [input.smsOk && ORDER_TEXTS_CONSENT, input.marketingOk && PROMO_CONSENT].filter((t): t is string => !!t);
  return {
    id,
    fileNo,
    name,
    org: null,
    phone,
    email,
    smsOk: !!input.smsOk,
    marketingOk: !!input.marketingOk,
    consent: agreed.length ? { at, version: CONSENT_VERSION, text: agreed } : null,
    createdAt: at,
  };
}

/** Returning-customer search box: an email, or a phone number. */
export function parseLookup(query: string): { field: "email" | "phone"; value: string } {
  const q = query.trim().toLowerCase();
  if (q.includes("@")) return { field: "email", value: q };
  const phone = normalizePhone(q);
  if (!phone) throw new CheckInError("Enter your 10-digit phone number or your email.");
  return { field: "phone", value: phone };
}
