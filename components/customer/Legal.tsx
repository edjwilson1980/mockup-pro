import type { ReactNode } from "react";
import { CustomerShell, H1 } from "@/components/ui";
import { CONSENT_VERSION } from "@/lib/consent";

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <CustomerShell back={{ href: "/start", label: "Back" }}>
      <H1 kicker={`Effective ${CONSENT_VERSION}`}>{title}</H1>
      <div className="flex flex-col gap-4 text-[15px] text-ink-2 [&_h2]:font-cond [&_h2]:font-bold [&_h2]:text-[20px] [&_h2]:uppercase [&_h2]:text-ink [&_h2]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1">{children}</div>
    </CustomerShell>
  );
}
