"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, CustomerShell, Field, H1, INPUT, Logo, Notice } from "@/components/ui";
import { CONSENT_FOOTNOTE, ORDER_TEXTS_CONSENT, PROMO_CONSENT } from "@/lib/consent";
import { checkIn, startOrder } from "@/lib/demo/actions";
import { useDemo } from "@/lib/demo/store";

/** Spec 2.2: new customers register. If the phone or email is already on file, that file opens. */
export function CheckIn() {
  const demo = useDemo();
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [smsOk, setSmsOk] = useState(false);
  const [marketingOk, setMarketingOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const r = await checkIn({ firstName, lastName, phone, email, smsOk, marketingOk });
      if (r.returning) router.push(`/start/welcome?c=${r.customer.id}${r.flagged ? "&flag=1" : ""}`);
      else router.push(startOrder(r.customer.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <CustomerShell step="Step 1 of 4">
      <div className="flex flex-col items-center gap-2 pt-2 pb-1 text-center">
        <Logo className="h-36 w-auto" priority />
        <div className="font-cond font-bold text-[22px] uppercase tracking-[0.08em]">South Side Printing</div>
      </div>
      <H1 kicker="Custom shirts">Register</H1>
      <Link href="/start/returning" className="flex items-center justify-between gap-3 px-4 min-h-14 rounded-[12px] bg-blue-soft border border-[#c4d6ee] text-blue font-semibold no-underline">
        <span>If you&apos;re a returning customer, click here</span>
        <span aria-hidden="true">→</span>
      </Link>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name">
            <input className={`${INPUT} w-full`} autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </Field>
          <Field label="Last name">
            <input className={`${INPUT} w-full`} autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </Field>
        </div>
        <Field label="Mobile phone">
          <input className={INPUT} type="tel" autoComplete="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(773) 555-0142" />
        </Field>
        <Field label="Email">
          <input className={INPUT} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="font-semibold text-[15px] mb-1.5">Texts and emails · optional</legend>
          <Consent checked={smsOk} onChange={setSmsOk} title="Order updates by text" text={ORDER_TEXTS_CONSENT} />
          <Consent checked={marketingOk} onChange={setMarketingOk} title="Promotions by text and email" text={PROMO_CONSENT} />
          <p className="text-[13px] text-muted">
            {CONSENT_FOOTNOTE} See our{" "}
            <Link href="/privacy" className="underline">
              Privacy Policy
            </Link>{" "}
            and{" "}
            <Link href="/terms" className="underline">
              Terms
            </Link>
            .
          </p>
        </fieldset>
        {error && <Notice tone="bad">{error}</Notice>}
        <Button type="submit" size="lg" disabled={!demo || busy}>
          {busy ? "One moment…" : "Register and continue"}
        </Button>
      </form>
    </CustomerShell>
  );
}

function Consent({ checked, onChange, title, text }: { checked: boolean; onChange: (v: boolean) => void; title: string; text: string }) {
  return (
    <label className="flex items-start gap-3 p-3 rounded-[10px] bg-white border border-line-strong">
      <input type="checkbox" className="size-5 mt-0.5 shrink-0 accent-blue" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="flex flex-col gap-0.5">
        <span className="font-semibold text-[15px]">{title}</span>
        <span className="text-[13px] text-ink-2">{text}</span>
      </span>
    </label>
  );
}
