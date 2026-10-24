"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, CustomerShell, Field, H1, INPUT, Logo, Notice } from "@/components/ui";
import { findCustomer } from "@/lib/demo/actions";
import { useDemo } from "@/lib/demo/store";

/** Returning customers: phone number or email finds their file. */
export function Returning() {
  const demo = useDemo();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [busy, setBusy] = useState(false);

  async function search() {
    setError(null);
    setNotFound(false);
    setBusy(true);
    try {
      const c = await findCustomer(query);
      if (c) {
        router.push(`/start/welcome?c=${c.id}`);
        return;
      }
      setNotFound(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
    setBusy(false);
  }

  return (
    <CustomerShell step="Step 1 of 4" back={{ href: "/start", label: "New customer? Register" }}>
      <Logo className="h-24 w-auto self-center" priority />
      <H1 kicker="Welcome back">Find your file</H1>
      <p className="text-ink-2">Enter the phone number or email you used before. We&apos;ll pull up your file and saved artwork.</p>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <Field label="Phone number or email">
          <input className={INPUT} autoComplete="email" autoCapitalize="none" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="(773) 555-0142 or you@example.com" />
        </Field>
        {error && <Notice tone="bad">{error}</Notice>}
        {notFound && (
          <Notice tone="warn">
            We couldn&apos;t find a file with that. Try the other one (phone or email), or{" "}
            <Link href="/start" className="underline">
              register as a new customer
            </Link>
            .
          </Notice>
        )}
        <Button type="submit" size="lg" disabled={!demo || !query.trim() || busy}>
          {busy ? "Looking…" : "Find my file"}
        </Button>
      </form>
      <Notice tone="info">Demo: (773) 555-0142 or coach.reyes@example.com opens Maria Reyes&apos;s file.</Notice>
    </CustomerShell>
  );
}
