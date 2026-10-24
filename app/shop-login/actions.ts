"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SHOP_COOKIE, shopToken } from "@/lib/shop-auth";

export async function signIn(_prev: string | null, form: FormData): Promise<string | null> {
  const password = process.env.SHOP_PASSWORD;
  if (!password) return "The shop password isn't set up on the server.";
  if (form.get("password") !== password) return "That password isn't right.";
  (await cookies()).set(SHOP_COOKIE, await shopToken(password), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  const next = String(form.get("next") ?? "");
  redirect(next.startsWith("/shop") ? next : "/shop");
}

export async function signOut() {
  (await cookies()).delete(SHOP_COOKIE);
  redirect("/shop-login");
}
