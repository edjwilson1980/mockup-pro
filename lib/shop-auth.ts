// Shop side password gate. The password is the SHOP_PASSWORD env var; the
// cookie holds a hash of it, so changing the password signs everyone out.

export const SHOP_COOKIE = "mp_shop";

export async function shopToken(password: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`mockup-pro-shop:${password}`));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** True when the cookie matches the current password. No password set = locked. */
export async function isShopToken(token: string | undefined): Promise<boolean> {
  const password = process.env.SHOP_PASSWORD;
  if (!password || !token) return false;
  return token === (await shopToken(password));
}

/** Compares two secrets without leaking where they differ through timing. */
export function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
