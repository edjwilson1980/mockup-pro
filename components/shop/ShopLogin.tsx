"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "@/app/shop-login/actions";
import { Button, Card, Field, H1, INPUT, Logo, Notice } from "@/components/ui";

export function ShopLogin() {
  const next = useSearchParams().get("next") ?? "/shop";
  const [error, action, pending] = useActionState(signIn, null);
  return (
    <main className="min-h-dvh flex items-center justify-center px-4 py-10">
      <Card className="w-full max-w-[400px] p-6 flex flex-col gap-5">
        <div className="flex flex-col items-center gap-1.5">
          <Logo className="h-28 w-auto" priority />
          <span className="font-cond font-bold text-[18px] uppercase tracking-[0.06em]">South Side Printing · Mockup Pro</span>
        </div>
        <H1 kicker="Shop">Staff sign in</H1>
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="next" value={next} />
          <Field label="Shop password">
            <input type="password" name="password" required autoFocus autoComplete="current-password" className={INPUT} />
          </Field>
          {error && <Notice tone="bad">{error}</Notice>}
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Checking…" : "Sign in"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
