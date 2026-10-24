// Server only: who is asking. Shop staff have the shop-password cookie
// (lib/shop-auth.ts); a customer has a signed cookie naming their own file,
// set when they check in or find their file.

import "server-only";
import { cookies } from "next/headers";
import { SHOP_COOKIE, isShopToken } from "@/lib/shop-auth";

export const CUSTOMER_COOKIE = "mp_cust";
const HOURS = 12;

async function hmac(text: string): Promise<string> {
  const secret = process.env.CUSTOMER_SESSION_SECRET;
  if (!secret) throw new Error("CUSTOMER_SESSION_SECRET isn't set.");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return Buffer.from(sig).toString("base64url");
}

export type Who = { shop: boolean; customerId: string | null };

export async function who(): Promise<Who> {
  const jar = await cookies();
  const shop = await isShopToken(jar.get(SHOP_COOKIE)?.value);
  let customerId: string | null = null;
  const raw = jar.get(CUSTOMER_COOKIE)?.value;
  if (raw) {
    const [id, exp, sig] = raw.split(".");
    if (id && exp && sig && Number(exp) > Date.now() && sig === (await hmac(`${id}.${exp}`))) customerId = id;
  }
  return { shop, customerId };
}

export async function signInCustomer(customerId: string) {
  const exp = String(Date.now() + HOURS * 3600_000);
  (await cookies()).set(CUSTOMER_COOKIE, `${customerId}.${exp}.${await hmac(`${customerId}.${exp}`)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: HOURS * 3600,
  });
}

export async function signOutCustomer() {
  (await cookies()).delete(CUSTOMER_COOKIE);
}
