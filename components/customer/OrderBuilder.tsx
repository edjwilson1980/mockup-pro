"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ButtonLink, Card, CustomerShell, H1, Loading, Mockup, Notice, StatusBadge } from "@/components/ui";
import { colorByName, garmentLabel, isPersonalized, spotSummary, summaryText, totalShirts } from "@/lib/catalog";
import { addDesign, logoutCustomer, removeDesign, startOrder, submitOrder, submitProblems, updateDesign } from "@/lib/demo/actions";
import { useDemo } from "@/lib/demo/store";
import { SHIRT_SIZES, type Asset, type Design, type Order } from "@/lib/demo/types";

export { editable } from "@/lib/order-rules";
import { editable } from "@/lib/order-rules";

/** Spec 2.5: the shirt designs on an order, sizes, spots, and "Send to shop". */
export function OrderBuilder({ id }: { id: string }) {
  const demo = useDemo();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  if (!demo) return <Loading />;
  const order = demo.orders.find((o) => o.id === id);
  if (!order) return <Missing />;
  const customer = demo.customers.find((c) => c.id === order.customerId);
  const problems = submitProblems(order);
  const canEdit = editable(order);

  // Sent and waiting for the shop: just the next choice.
  if (order.status === "submitted") {
    return (
      <CustomerShell step="Sent">
        <div className="flex flex-col items-center text-center gap-3 pt-6">
          <span className="flex items-center justify-center size-16 rounded-full bg-good-soft text-good text-[34px] font-bold" aria-hidden="true">
            ✓
          </span>
          <H1 kicker={`Order ${order.orderNo}`}>Sent to the shop</H1>
          <p className="text-ink-2 max-w-[420px]">We&apos;ll check your art and send you a proof to approve.</p>
        </div>
        <div className="text-center font-cond font-bold text-[22px] uppercase mt-2">Upload another design or log out?</div>
        <Button size="lg" onClick={() => router.push(startOrder(order.customerId))}>
          Upload another design
        </Button>
        <Button
          tone="secondary"
          size="lg"
          onClick={async () => {
            await logoutCustomer().catch(() => {});
            router.push("/start");
          }}
        >
          Log out
        </Button>
        <details className="mt-4">
          <summary className="cursor-pointer text-blue font-medium min-h-11 flex items-center">See what you sent · {summaryText(order.designs)}</summary>
          <div className="flex flex-col gap-3 mt-2">
            {order.designs.map((d, i) => (
              <DesignCard key={d.id} order={order} design={d} index={i} assets={demo.assets} canEdit={false} />
            ))}
          </div>
        </details>
      </CustomerShell>
    );
  }

  return (
    <CustomerShell step="Step 3 of 4" back={customer ? { href: `/start/welcome?c=${customer.id}`, label: "Your file" } : undefined}>
      <div className="flex items-end gap-3">
        <H1 kicker={`Order ${order.orderNo}`}>Your order</H1>
        <span className="ml-auto mb-1">
          <StatusBadge status={order.status} />
        </span>
      </div>

      {order.status === "changes_requested" && order.changeText && <Notice tone="warn">You asked for a change: “{order.changeText}”. Update the order and send it again.</Notice>}
      {!canEdit && (
        <Notice tone={order.status === "proof_sent" ? "info" : "good"}>
          {order.status === "proof_sent" && (
            <>
              Your proof is ready.{" "}
              <Link className="font-semibold underline" href={`/proof/${order.proofToken}`}>
                Review and approve
              </Link>
            </>
          )}
          {order.status === "approved" && "Approved. Your order is in the print queue."}
          {order.status === "printing" && "Printing now."}
          {order.status === "ready" && "Ready for pickup at 2824 W. Marquette."}
        </Notice>
      )}

      {order.designs.map((d, i) => (
        <DesignCard key={d.id} order={order} design={d} index={i} assets={demo.assets} canEdit={canEdit} />
      ))}

      {canEdit && (
        <>
          <Button tone="secondary" size="lg" onClick={() => router.push(`/order/${order.id}/item/${addDesign(order.id)}?start=1`)}>
            + Add another shirt or design
          </Button>
          <div className="sticky bottom-0 -mx-4 px-4 py-3 bg-ground/95 border-t border-line flex flex-col gap-2">
            <div className="font-semibold text-center">{summaryText(order.designs)}</div>
            {error && <Notice tone="bad">{error}</Notice>}
            {problems.length > 0 && <div className="text-[14px] text-warn text-center">{problems[0]}</div>}
            <Button
              size="lg"
              disabled={problems.length > 0}
              onClick={() => {
                setError(null);
                try {
                  submitOrder(order.id);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Couldn't send it.");
                }
              }}
            >
              Send to shop for approval
            </Button>
          </div>
        </>
      )}
    </CustomerShell>
  );
}

function DesignCard({ order, design: d, index, assets, canEdit }: { order: Order; design: Design; index: number; assets: Asset[]; canEdit: boolean }) {
  const named = d.spots.some((s) => isPersonalized(s.spotId));
  const color = colorByName(d.color, d.garmentId);
  const base = `/order/${order.id}/item/${d.id}`;
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="font-cond font-bold text-[15px] text-muted">#{index + 1}</span>
        {canEdit ? (
          <input
            aria-label="Design name"
            className="flex-1 min-w-0 font-cond font-bold text-[22px] uppercase bg-transparent border-b border-transparent focus:border-line-strong"
            value={d.name}
            onChange={(e) => updateDesign(order.id, d.id, (x) => (x.name = e.target.value))}
          />
        ) : (
          <h2 className="flex-1 font-cond font-bold text-[22px] uppercase">{d.name}</h2>
        )}
        {canEdit && order.designs.length > 1 && (
          <button type="button" className="text-[14px] text-bad font-medium min-h-11 px-2" onClick={() => removeDesign(order.id, d.id)}>
            Remove
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Mockup input={{ design: d, view: "front", assets }} alt={`${d.name}, front`} />
        <Mockup input={{ design: d, view: "back", assets }} alt={`${d.name}, back`} />
      </div>
      <div className="flex items-center gap-2 text-[15px]">
        <span className={`size-5 rounded-full border border-line-strong ${color.heather ? "heather" : ""}`} style={{ background: color.hex }} />
        <span>
          {garmentLabel(d)} · <b>{d.color}</b> · {totalShirts(d.sizeCounts)} shirts
        </span>
      </div>

      <fieldset>
        <legend className="font-semibold text-[15px] mb-1.5">How many in each size</legend>
        <div className="grid grid-cols-6 gap-1.5">
          {SHIRT_SIZES.map((size) => (
            <label key={size} className="flex flex-col items-center gap-1">
              <span className="text-[13px] font-semibold text-muted">{size}</span>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                disabled={!canEdit}
                value={d.sizeCounts[size] || ""}
                placeholder="0"
                onChange={(e) => updateDesign(order.id, d.id, (x) => (x.sizeCounts[size] = Math.max(0, Math.floor(Number(e.target.value) || 0))))}
                className="w-full min-h-11 text-center rounded-[8px] border border-line-strong bg-white font-semibold disabled:bg-ground"
              />
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <div className="font-semibold text-[15px] mb-1.5">Print spots</div>
        {d.spots.length ? (
          <ul className="flex flex-col gap-1">
            {d.spots.map((s) => (
              <li key={s.id} className="text-[15px] text-ink-2">
                • {spotSummary(s, d, assets)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted text-[15px]">None yet.</p>
        )}
      </div>
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={base} tone="secondary">
            {d.spots.length ? "Edit spots and color" : "Add print spots"}
          </ButtonLink>
          {named && (
            <ButtonLink href={`${base}/names`} tone="secondary">
              Names &amp; numbers ({d.roster.length})
            </ButtonLink>
          )}
        </div>
      )}
    </Card>
  );
}

export function Missing() {
  return (
    <CustomerShell>
      <Notice tone="warn">We couldn&apos;t find that order. It may have been reset.</Notice>
      <Link href="/start" className="text-blue font-semibold w-fit">
        Start again
      </Link>
    </CustomerShell>
  );
}
