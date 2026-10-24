"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, H1, INPUT, Initials, Loading, ShopShell, StatusBadge, fmtDate } from "@/components/ui";
import { formatPhone } from "@/lib/demo/actions";
import { useDemo } from "@/lib/demo/store";

/** Spec 3: global search by name, phone, email or order number. */
export function Customers() {
  const demo = useDemo();
  const [q, setQ] = useState("");
  if (!demo) return <Loading />;
  const query = q.trim().toLowerCase();
  const digits = query.replace(/\D/g, "");
  const rows = demo.customers
    .map((c) => {
      const orders = demo.orders.filter((o) => o.customerId === c.id && o.status !== "draft").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return { c, orders, latest: orders[0] };
    })
    .filter(({ c, orders }) => {
      if (!query) return true;
      return (
        c.name.toLowerCase().includes(query) ||
        (c.org ?? "").toLowerCase().includes(query) ||
        c.email.includes(query) ||
        c.fileNo.toLowerCase().includes(query) ||
        (digits.length >= 3 && c.phone.includes(digits)) ||
        orders.some((o) => o.orderNo.toLowerCase().includes(query))
      );
    })
    .sort((a, b) => (b.latest?.createdAt ?? b.c.createdAt).localeCompare(a.latest?.createdAt ?? a.c.createdAt));
  const waiting = demo.orders.filter((o) => o.status === "submitted" || o.status === "changes_requested");

  return (
    <ShopShell current="/shop">
      <div className="flex flex-wrap items-end gap-4">
        <H1 kicker="Shop">Customers</H1>
        {waiting.length > 0 && (
          <span className="mb-1 px-3 py-1.5 rounded-full bg-warn-soft text-warn font-semibold text-[14px]">
            {waiting.length} {waiting.length === 1 ? "order needs" : "orders need"} review
          </span>
        )}
      </div>
      <input type="search" aria-label="Search customers" placeholder="Name, phone, email or order number" value={q} onChange={(e) => setQ(e.target.value)} className={`${INPUT} max-w-[520px]`} />
      <Card className="p-0 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-ground text-[13px] uppercase tracking-[0.06em] text-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">Customer</th>
              <th className="px-4 py-3 font-semibold hidden md:table-cell">Contact</th>
              <th className="px-4 py-3 font-semibold">Latest order</th>
              <th className="px-4 py-3 font-semibold hidden sm:table-cell">Orders</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ c, orders, latest }) => (
              <tr key={c.id} className="border-t border-line hover:bg-ground/60">
                <td className="px-4 py-3">
                  <Link href={`/shop/customers/${c.fileNo}`} className="flex items-center gap-3 no-underline text-ink">
                    <Initials name={c.name} />
                    <span>
                      <span className="block font-semibold text-blue">{c.name}</span>
                      <span className="block text-[13px] text-muted">
                        {c.fileNo}
                        {c.org ? ` · ${c.org}` : ""}
                      </span>
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-3 text-[14px] hidden md:table-cell">
                  <div>{formatPhone(c.phone)}</div>
                  <div className="text-muted">{c.email}</div>
                </td>
                <td className="px-4 py-3">
                  {latest ? (
                    <div className="flex flex-col items-start gap-1">
                      <span className="font-medium">
                        {latest.orderNo} · {fmtDate(latest.createdAt)}
                      </span>
                      <StatusBadge status={latest.status} />
                    </div>
                  ) : (
                    <span className="text-muted">None yet</span>
                  )}
                </td>
                <td className="px-4 py-3 hidden sm:table-cell">{orders.length}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-muted">
                  No customer matches “{q}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </ShopShell>
  );
}
