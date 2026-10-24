"use client";

import { useState } from "react";
import { Button, Card, CustomerShell, H1, H2, Loading, Mockup, Notice, fmtTime } from "@/components/ui";
import { colorByName, isPersonalized, spotSummary, summaryText, totalShirts, garmentLabel } from "@/lib/catalog";
import { approve, requestChange } from "@/lib/demo/actions";
import { useDemo } from "@/lib/demo/store";
import { SHIRT_SIZES } from "@/lib/demo/types";

/** Spec 4: the proof link (no login; the token is the key). */
export function Proof({ token }: { token: string }) {
  const demo = useDemo();
  const [checked, setChecked] = useState(false);
  const [changing, setChanging] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!demo) return <Loading />;
  const order = demo.orders.find((o) => o.proofToken === token);
  if (!order) {
    return (
      <CustomerShell>
        <Notice tone="warn">This proof link has expired. Call us at the shop.</Notice>
      </CustomerShell>
    );
  }
  const customer = demo.customers.find((c) => c.id === order.customerId);
  const names = order.designs.reduce((s, d) => s + (d.spots.some((x) => isPersonalized(x.spotId)) ? d.roster.length : 0), 0);
  const waiting = order.status === "proof_sent";
  const act = (fn: () => void) => {
    setError(null);
    try {
      fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  };

  return (
    <CustomerShell step="Proof">
      <H1 kicker={`Order #${order.orderNo}`}>Your proof, {customer?.name.split(/\s+/)[0]}</H1>
      <p className="text-ink-2">{summaryText(order.designs)}. Check every design, spelling and size before you approve.</p>

      {order.status === "approved" || order.status === "printing" || order.status === "ready" ? (
        <Notice tone="good">Approved {order.approvedAt ? fmtTime(order.approvedAt) : ""}. Thanks! Your order is in the print queue; we&apos;ll text you when it&apos;s ready.</Notice>
      ) : order.status === "changes_requested" ? (
        <Notice tone="warn">You asked for a change: “{order.changeText}”. We&apos;ll send a new proof.</Notice>
      ) : null}

      {order.designs.map((d) => (
        <Card key={d.id} className="flex flex-col gap-3">
          <H2>{d.name}</H2>
          <div className="grid grid-cols-2 gap-2">
            <Mockup input={{ design: d, view: "front", assets: demo.assets }} alt={`${d.name}, front`} />
            <Mockup input={{ design: d, view: "back", assets: demo.assets }} alt={`${d.name}, back`} />
          </div>
          <div className="text-[15px]">
            {garmentLabel(d)} · {colorByName(d.color, d.garmentId).name} · {totalShirts(d.sizeCounts)} shirts ({SHIRT_SIZES.filter((s) => d.sizeCounts[s]).map((s) => `${s} ${d.sizeCounts[s]}`).join(", ")})
          </div>
          <ul className="text-[15px] text-ink-2">
            {d.spots.map((s) => (
              <li key={s.id}>• {spotSummary(s, d, demo.assets)}</li>
            ))}
          </ul>
          {d.roster.length > 0 && d.spots.some((s) => isPersonalized(s.spotId)) && (
            <details className="rounded-[10px] border border-line px-3 py-2">
              <summary className="font-semibold cursor-pointer min-h-8">Check all {d.roster.length} names</summary>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-[15px]">
                {d.roster.map((r) => (
                  <li key={r.id} className="font-mono">
                    {r.size.padEnd(3)} {r.number.padStart(2)} {r.name}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Card>
      ))}

      {waiting && (
        <Card className="flex flex-col gap-3">
          {names > 0 && (
            <label className="flex items-start gap-3">
              <input type="checkbox" className="size-5 mt-0.5 accent-blue" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
              <span>I checked the spelling of all {names} names.</span>
            </label>
          )}
          {error && <Notice tone="bad">{error}</Notice>}
          <Button tone="good" size="lg" disabled={names > 0 && !checked} onClick={() => act(() => approve(order.id, "proof page"))}>
            Approve · start printing
          </Button>
          {!changing ? (
            <Button tone="secondary" onClick={() => setChanging(true)}>
              Request a change
            </Button>
          ) : (
            <div className="flex flex-col gap-2">
              <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="What should we change?" className="px-3 py-2 rounded-[10px] border border-line-strong bg-white" />
              <Button tone="danger" disabled={!text.trim()} onClick={() => act(() => requestChange(order.id, text))}>
                Send change request
              </Button>
            </div>
          )}
          <p className="text-[13px] text-muted text-center">You can also reply YES to our text, or APPROVED to our email.</p>
        </Card>
      )}
    </CustomerShell>
  );
}
