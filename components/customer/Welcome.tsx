"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card, CustomerShell, H1, H2, Loading, Mockup, Notice, StatusBadge, fmtDate } from "@/components/ui";
import { summaryText } from "@/lib/catalog";
import { reorder, startOrder } from "@/lib/demo/actions";
import { useDemo } from "@/lib/demo/store";

/**
 * Spec 2.3: a returning customer's file. Only thumbnails and names are shown,
 * never contact details, in case someone typed another person's number.
 */
export function Welcome() {
  const demo = useDemo();
  const router = useRouter();
  const params = useSearchParams();
  if (!demo) return <Loading />;
  const customer = demo.customers.find((c) => c.id === params.get("c"));
  if (!customer) {
    return (
      <CustomerShell>
        <Notice tone="warn">We couldn&apos;t find that file. Please check in again.</Notice>
        <Link href="/start" className="text-blue font-semibold">
          Check in
        </Link>
      </CustomerShell>
    );
  }
  const art = demo.assets.filter((a) => a.customerId === customer.id);
  const orders = demo.orders.filter((o) => o.customerId === customer.id && o.status !== "draft").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const first = customer.name.split(/\s+/)[0];

  return (
    <CustomerShell step="Step 1 of 4">
      <H1 kicker={`File ${customer.fileNo}`}>Welcome back, {first}</H1>
      {params.get("flag") && <Notice tone="warn">Your phone and email match two different files. We used your phone number; the shop will double-check.</Notice>}
      <Button size="lg" onClick={() => router.push(startOrder(customer.id))}>
        Start a new order
      </Button>

      {art.length > 0 && (
        <Card>
          <H2 className="mb-3">Your saved artwork</H2>
          <ul className="grid grid-cols-3 gap-3">
            {art.map((a) => (
              <li key={a.id} className="flex flex-col gap-1.5">
                <div className="aspect-square rounded-[10px] checker p-2 flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local art */}
                  <img src={a.src} alt="" className="max-h-full max-w-full object-contain" />
                </div>
                <span className="text-[13px] font-medium truncate">{a.name}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {orders.length > 0 && (
        <Card>
          <H2 className="mb-3">Past orders</H2>
          <ul className="flex flex-col gap-3">
            {orders.map((o) => (
              <li key={o.id} className="flex items-center gap-3">
                <Mockup className="w-16 shrink-0" alt={`${o.designs[0]?.name} mockup`} input={o.designs[0] ? { design: o.designs[0], view: "front", assets: demo.assets } : null} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">
                    {o.orderNo} · {fmtDate(o.createdAt)}
                  </div>
                  <div className="text-[13px] text-muted truncate">{summaryText(o.designs)}</div>
                  <StatusBadge status={o.status} />
                </div>
                <Button tone="secondary" onClick={() => router.push(`/order/${reorder(o.id)}`)}>
                  Reorder
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Link href="/start" className="text-blue font-medium w-fit">
        Not you? Use different info
      </Link>
    </CustomerShell>
  );
}
