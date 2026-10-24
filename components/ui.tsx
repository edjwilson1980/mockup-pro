"use client";

import Image from "next/image";
import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { colorByName } from "@/lib/catalog";
import { STATUS_LABEL, type OrderStatus } from "@/lib/demo/types";
import { parseHex, rgbToLab } from "@/lib/mockup/recolor";
import { useMockup, type MockupInput } from "@/lib/use-mockup";
import { signOut } from "@/app/shop-login/actions";
import { useDataMode } from "@/lib/demo/store";

/** South Side Printing logo (SSp over four Chicago stars). */
export function Logo({ className = "h-10 w-auto", priority }: { className?: string; priority?: boolean }) {
  return <Image src="/brand/ssp-logo.svg" alt="South Side Printing" width={1000} height={1010} unoptimized priority={priority} className={className} />;
}

/** Shown when a change couldn't be saved to the shared database. */
function SaveStatus() {
  const { error } = useDataMode();
  if (!error) return null;
  return (
    <div role="alert" className="bg-bad text-white text-center text-[14px] font-semibold px-4 py-2">
      Not saved yet: {error} We&apos;ll keep trying.
    </div>
  );
}

/** Customer side: phone-first, one column. */
export function CustomerShell({ children, step, back }: { children: ReactNode; step?: string; back?: { href: string; label: string } }) {
  return (
    <div className="min-h-dvh">
      <header className="bg-ink text-white">
        <div className="mx-auto max-w-[560px] px-4 h-14 flex items-center gap-3">
          <Logo className="h-10 w-auto" priority />
          <span className="font-cond font-bold text-[18px] uppercase tracking-[0.06em]">South Side Printing</span>
          {step && <span className="ml-auto text-[13px] text-white/70">{step}</span>}
        </div>
      </header>
      <SaveStatus />
      <main className="mx-auto max-w-[560px] px-4 py-5 flex flex-col gap-4">
        {back && (
          <Link href={back.href} className="text-blue font-medium text-[15px] w-fit">
            ← {back.label}
          </Link>
        )}
        {children}
      </main>
    </div>
  );
}

const SHOP_NAV = [
  { href: "/shop", label: "Customers" },
  { href: "/shop/production", label: "Production" },
  { href: "/shop/mockup", label: "Mockup studio" },
];

/** Shop side: wide, with the staff menu. */
export function ShopShell({ children, current, wide = true }: { children: ReactNode; current?: string; wide?: boolean }) {
  return (
    <div className="min-h-dvh">
      <header className="bg-ink text-white">
        <div className={`mx-auto ${wide ? "max-w-[1280px]" : "max-w-[960px]"} px-4 min-h-14 flex flex-wrap items-center gap-x-5 gap-y-2 py-2`}>
          <Link href="/shop" className="flex items-center gap-2.5 text-white no-underline">
            <Logo className="h-10 w-auto" priority />
            <span className="font-cond font-bold text-[18px] uppercase tracking-[0.06em]">Mockup Pro</span>
            <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/60">Shop</span>
          </Link>
          <nav aria-label="Shop" className="flex gap-1 ml-auto">
            {SHOP_NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={current === n.href ? "page" : undefined}
                className={`px-3 h-10 flex items-center rounded-lg text-[15px] font-medium ${current === n.href ? "bg-white/15 text-white" : "text-white/75 hover:text-white"}`}
              >
                {n.label}
              </Link>
            ))}
            <form action={signOut}>
              <button type="submit" className="px-3 h-10 flex items-center rounded-lg text-[15px] font-medium text-white/60 hover:text-white">
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <SaveStatus />
      <main className={`mx-auto ${wide ? "max-w-[1280px]" : "max-w-[960px]"} px-4 py-6 flex flex-col gap-5`}>{children}</main>
    </div>
  );
}

type Tone = "primary" | "secondary" | "danger" | "good";

const BTN: Record<Tone, string> = {
  primary: "bg-blue text-white hover:bg-[#183f72] disabled:bg-line-strong disabled:text-white",
  secondary: "bg-white text-ink border border-line-strong hover:border-ink-2 disabled:text-muted",
  danger: "bg-red text-white hover:bg-[#a50d26] disabled:bg-line-strong",
  good: "bg-good text-white hover:bg-[#0f6a3d] disabled:bg-line-strong",
};

export function Button({ tone = "primary", size = "md", className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; size?: "md" | "lg" }) {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold ${size === "lg" ? "min-h-14 px-6 text-[17px]" : "min-h-11 px-4 text-[15px]"} ${BTN[tone]} ${className}`}
    />
  );
}

export function ButtonLink({ href, tone = "primary", size = "md", className = "", children }: { href: string; tone?: Tone; size?: "md" | "lg"; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={`inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold no-underline ${size === "lg" ? "min-h-14 px-6 text-[17px]" : "min-h-11 px-4 text-[15px]"} ${BTN[tone]} ${className}`}>
      {children}
    </Link>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`bg-card border border-line rounded-[14px] p-4 ${className}`}>{children}</section>;
}

export function H1({ children, kicker }: { children: ReactNode; kicker?: string }) {
  return (
    <div>
      {kicker && <div className="font-cond font-semibold text-[14px] uppercase tracking-[0.16em] text-red">{kicker}</div>}
      <h1 className="font-cond font-extrabold text-[34px] leading-[1.05] uppercase">{children}</h1>
    </div>
  );
}

export function H2({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <h2 className={`font-cond font-bold text-[22px] uppercase leading-tight ${className}`}>{children}</h2>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-semibold text-[15px]">
        {label}
        {hint && <span className="font-normal text-muted"> · {hint}</span>}
      </span>
      {children}
    </label>
  );
}

export const INPUT = "min-h-12 px-3 rounded-[10px] bg-white border border-line-strong text-[16px] text-ink placeholder:text-muted";

export function Notice({ tone, children }: { tone: "good" | "warn" | "bad" | "info"; children: ReactNode }) {
  const c = { good: "bg-good-soft text-good border-[#b9e2c9]", warn: "bg-warn-soft text-warn border-[#f1d39c]", bad: "bg-bad-soft text-bad border-[#f3c1bc]", info: "bg-blue-soft text-blue border-[#c4d6ee]" }[tone];
  return (
    <div role={tone === "bad" ? "alert" : undefined} className={`px-4 py-3 rounded-[10px] border font-medium text-[15px] ${c}`}>
      {children}
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return <div className="min-h-dvh flex items-center justify-center text-muted text-lg">{label}</div>;
}

const STATUS_TONE: Record<OrderStatus, string> = {
  draft: "bg-ground text-ink-2 border-line-strong",
  submitted: "bg-warn-soft text-warn border-[#f1d39c]",
  proof_sent: "bg-blue-soft text-blue border-[#c4d6ee]",
  changes_requested: "bg-bad-soft text-bad border-[#f3c1bc]",
  approved: "bg-good-soft text-good border-[#b9e2c9]",
  printing: "bg-blue-soft text-blue border-[#c4d6ee]",
  ready: "bg-good-soft text-good border-[#b9e2c9]",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`inline-flex items-center px-2 py-1 rounded-md border text-[12px] font-semibold uppercase tracking-[0.06em] whitespace-nowrap ${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>;
}

/** A live mockup. The picture is 1000 × 1250 (4:5). */
/** Ash Grey (Gildan #C8C9C7): neutral, so every shirt color reads true. */
const ASH = "#C8C9C7";
const ASH_LIGHTNESS = rgbToLab(...parseHex(ASH))[0];

/** Ash, unless the shirt itself is close to ash (Ash Grey, Ice Grey…): then a darker gray. */
function ashFor(shirtColor: string | undefined, garmentId?: string): string {
  if (!shirtColor) return ASH;
  const l = rgbToLab(...parseHex(colorByName(shirtColor, garmentId).hex))[0];
  return Math.abs(l - ASH_LIGHTNESS) < 8 ? "#8F9296" : ASH;
}

export type Backdrop = "ash" | "dark" | "clear";

export function Mockup({ input, className = "", backdrop = "ash", alt, children }: { input: MockupInput | null; className?: string; backdrop?: Backdrop; alt: string; children?: ReactNode }) {
  const { url, error } = useMockup(input);
  const bg = backdrop === "dark" ? "bg-[#1c2028]" : backdrop === "clear" ? "checker" : "";
  const style = backdrop === "ash" ? { background: ashFor(input?.design.color, input?.design.garmentId) } : undefined;
  return (
    <div className={`relative aspect-[4/5] rounded-[12px] overflow-hidden ${bg} ${className}`} style={style}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- a blob: URL drawn in the browser
        <img src={url} alt={alt} className="absolute inset-0 size-full object-contain" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-ink-2 text-[13px]">{error ?? "Drawing mockup…"}</div>
      )}
      {children}
    </div>
  );
}

export function Initials({ name }: { name: string }) {
  const i = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return <span className="flex items-center justify-center size-11 rounded-full bg-ink text-white font-cond font-bold text-[18px] shrink-0">{i}</span>;
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" });
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
}
