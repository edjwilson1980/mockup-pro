"use client";

import Link from "next/link";
import { DemoTools } from "@/components/DemoTools";
import { ShoppingList } from "@/components/shop/ShoppingList";
import { ButtonLink, Card, H1, H2, Loading, ShopShell, StatusBadge, fmtTime } from "@/components/ui";
import { useDemo } from "@/lib/demo/store";
import type { Order } from "@/lib/demo/types";
import { pressList } from "@/lib/production";

/** Approved orders, the gang sheet queue and the press station, in one place. */
export function Production() {
  const demo = useDemo();
  if (!demo) return <Loading />;
  const byNewest = (a: Order, b: Order) => (b.approvedAt ?? b.createdAt).localeCompare(a.approvedAt ?? a.createdAt);
  const groups = [
    { title: "Ready to press", note: "Customer approved. Send it to production for the gang sheet, and open the press station when the transfers are printed.", orders: demo.orders.filter((o) => o.status === "approved" || o.status === "printing").sort(byNewest) },
    { title: "Ready for pickup", note: "All shirts pressed.", orders: demo.orders.filter((o) => o.status === "ready").sort(byNewest) },
  ];
  const customer = (o: Order) => demo.customers.find((c) => c.id === o.customerId);

  return (
    <ShopShell current="/shop/production">
      <H1 kicker="Shop">Production</H1>
      <ShoppingList orders={demo.orders} />
      {groups.map((g) => (
        <section key={g.title} className="flex flex-col gap-3">
          <div>
            <H2>
              {g.title} <span className="text-muted">· {g.orders.length}</span>
            </H2>
            <p className="text-muted text-[14px]">{g.note}</p>
          </div>
          {g.orders.length === 0 ? (
            <Card className="text-muted text-[15px]">Nothing here right now.</Card>
          ) : (
            <div className="grid md:grid-cols-2 gap-3">
              {g.orders.map((o) => {
                const c = customer(o);
                const total = pressList(o).length;
                return (
                  <Card key={o.id} className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-cond font-bold text-[22px] uppercase">{o.orderNo}</span>
                      <StatusBadge status={o.status} />
                      {o.approvedAt && <span className="ml-auto text-[13px] text-muted">Approved {fmtTime(o.approvedAt)}</span>}
                    </div>
                    <div className="text-[15px]">
                      {c ? (
                        <Link href={`/shop/customers/${c.fileNo}`} className="font-semibold text-blue">
                          {c.name}
                          {c.org ? ` · ${c.org}` : ""}
                        </Link>
                      ) : (
                        "Unknown customer"
                      )}
                      <div className="text-muted">
                        {o.designs.length} {o.designs.length === 1 ? "design" : "designs"} · {total} shirts
                        {o.status === "printing" && ` · ${o.pressed} of ${total} pressed`}
                        {o.production?.status === "building" && " · building gang sheet…"}
                        {o.production?.status === "failed" && " · gang sheet failed"}
                        {o.production?.sheetUrl && (
                          <>
                            {" · "}
                            <a className="text-blue underline" href={o.production.sheetUrl} target="_blank" rel="noreferrer">
                              gang sheet ready ↗
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {o.status === "approved" && c && (
                        <ButtonLink href={`/shop/customers/${c.fileNo}`} tone="secondary">
                          Send to production
                        </ButtonLink>
                      )}
                      {["approved", "printing", "ready"].includes(o.status) && (
                        <ButtonLink href={`/shop/press/${o.orderNo}`} tone={o.status === "ready" ? "secondary" : "primary"}>
                          Open press station
                        </ButtonLink>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      ))}
      <DemoTools />
    </ShopShell>
  );
}
