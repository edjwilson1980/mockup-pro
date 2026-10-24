"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ButtonLink, Card, H2, INPUT, Initials, Loading, Mockup, Notice, ShopShell, StatusBadge, fmtDate, fmtTime } from "@/components/ui";
import { fmtIn, isPersonalized, spotDef, summaryText, totalShirts, garmentLabel } from "@/lib/catalog";
import { approve, formatPhone, markSentToProduction, sendProof, setInStock, setOrdersInStock, startOrder } from "@/lib/demo/actions";
import { allInStock, shoppingCsv, shoppingList } from "@/lib/shopping";
import { listPdfBlob, printPdf } from "@/lib/shopping-pdf";
import { dataMode, reload, uploadFile, useDemo } from "@/lib/demo/store";
import { SHIRT_SIZES, type Asset, type Customer, type DemoState, type Order } from "@/lib/demo/types";
import { download } from "@/lib/art";
import { buildGangSheet, planTransfers } from "@/lib/production";

const ACTIVE = ["submitted", "changes_requested", "proof_sent", "approved", "printing"];

/** Spec 3: shop side customer file + approval. */
export function CustomerFile({ fileNo }: { fileNo: string }) {
  const demo = useDemo();
  const router = useRouter();
  const [picked, setPicked] = useState<string | null>(null);
  if (!demo) return <Loading />;
  const customer = demo.customers.find((c) => c.fileNo === fileNo);
  if (!customer) {
    return (
      <ShopShell>
        <Notice tone="warn">No customer file {fileNo}.</Notice>
        <Link href="/shop" className="text-blue font-semibold">
          All customers
        </Link>
      </ShopShell>
    );
  }
  const orders = demo.orders.filter((o) => o.customerId === customer.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const order = orders.find((o) => o.id === picked) ?? orders.find((o) => ACTIVE.includes(o.status)) ?? orders[0];
  // Open orders: sent to the shop and not finished. Their blanks may still need buying.
  const openOrders = orders.filter((o) => ACTIVE.includes(o.status));
  const stocked = openOrders.length > 0 && openOrders.every(allInStock);
  const listFileBase = `order-list-${customer.fileNo}-${customer.name.replace(/[^a-z0-9]+/gi, "-")}`;
  const orderListPdf = () =>
    listPdfBlob({
      title: "Order list",
      subtitle: `${customer.name}${customer.org ? ` · ${customer.org}` : ""} · File ${customer.fileNo}`,
      rows: shoppingList(openOrders),
      notes: [`Orders: ${openOrders.map((o) => o.orderNo).join(", ")}. Sizes marked in stock are not listed.`],
    });
  const art = demo.assets.filter((a) => a.customerId === customer.id);
  const first = customer.name.split(/\s+/)[0];
  const activity = orders.flatMap((o) => o.events.map((e) => ({ ...e, orderNo: o.orderNo }))).sort((a, b) => b.at.localeCompare(a.at));

  return (
    <ShopShell current="/shop">
      <header className="flex flex-wrap items-center gap-4">
        <Initials name={customer.name} />
        <div className="min-w-0">
          <h1 className="font-cond font-extrabold text-[34px] leading-none uppercase">{customer.name}</h1>
          <div className="text-[15px] text-ink-2 mt-1 flex flex-wrap gap-x-3">
            <span className="font-semibold">{customer.fileNo}</span>
            {customer.org && <span>{customer.org}</span>}
            <span>{formatPhone(customer.phone)}</span>
            <span>{customer.email}</span>
            {customer.smsOk ? <span className="text-good font-semibold">Order texts OK</span> : <span className="text-muted">No order texts</span>}
            {customer.marketingOk ? <span className="text-good font-semibold">Promos OK</span> : <span className="text-muted">No promos</span>}
            {customer.consent && <span className="text-muted">Opted in {fmtDate(customer.consent.at)}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 ml-auto">
          <Button tone="secondary" disabled title="Connects with Google Drive in Phase 2">
            Drive folder
          </Button>
          <Button tone="secondary" disabled title="Comes with the database">
            Edit info
          </Button>
          <Button
            tone="secondary"
            disabled={!openOrders.length}
            title={openOrders.length ? "Blanks still to buy for this customer's open orders" : "No open orders"}
            onClick={() => download(orderListPdf(), `${listFileBase}.pdf`)}
          >
            Order list (PDF)
          </Button>
          <Button tone="secondary" disabled={!openOrders.length} title="Print this customer's order list" onClick={() => printPdf(orderListPdf())}>
            Print order list
          </Button>
          <Button
            tone="secondary"
            disabled={!openOrders.length}
            title="The same list as a spreadsheet"
            onClick={() => download(new Blob([shoppingCsv(shoppingList(openOrders))], { type: "text/csv" }), `${listFileBase}.csv`)}
          >
            CSV
          </Button>
          {openOrders.length > 0 && (
            <Button tone={stocked ? "secondary" : "good"} onClick={() => setOrdersInStock(openOrders.map((o) => o.id), !stocked)}>
              {stocked ? "Blanks in stock ✓ · Undo" : "Mark blanks in stock"}
            </Button>
          )}
          <Button onClick={() => router.push(startOrder(customer.id))}>New order for {first}</Button>
        </div>
      </header>

      {order ? <Approval key={order.id} order={order} customer={customer} demo={demo} /> : <Card>No orders yet.</Card>}

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-5">
        <Card className="p-0 overflow-hidden">
          <H2 className="px-4 pt-4 pb-2">Order history</H2>
          <table className="w-full text-left text-[15px]">
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className={`border-t border-line ${o.id === order?.id ? "bg-blue-soft" : ""}`}>
                  <td className="px-4 py-2.5">
                    <button type="button" className="font-semibold text-blue min-h-9" onClick={() => setPicked(o.id)}>
                      {o.orderNo}
                    </button>
                  </td>
                  <td className="px-2 py-2.5 text-muted">{fmtDate(o.createdAt)}</td>
                  <td className="px-2 py-2.5 hidden sm:table-cell">{summaryText(o.designs)}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={o.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card>
          <H2 className="mb-2">Activity</H2>
          <ul className="flex flex-col gap-2 text-[14px] max-h-[260px] overflow-y-auto">
            {activity.slice(0, 20).map((e, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-muted whitespace-nowrap">{fmtTime(e.at)}</span>
                <span>
                  <b>{e.orderNo}</b> {e.text}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <H2 className="mb-3">Artwork library</H2>
        <ul className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {art.map((a) => (
            <li key={a.id} className="flex flex-col gap-1">
              <div className="aspect-square rounded-[10px] checker p-2 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element -- local art */}
                <img src={a.src} alt="" className="max-h-full max-w-full object-contain" />
              </div>
              <span className="text-[14px] font-medium truncate">{a.name}</span>
              <span className="text-[12px] text-muted">
                Print art · {a.widthPx} × {a.heightPx} px
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </ShopShell>
  );
}

const STEPS = ["Shop checks art", "Proof sent", "Waiting on customer", "Unlocks printing"];

function stepOf(o: Order): number {
  if (o.status === "submitted" || o.status === "changes_requested" || o.status === "draft") return 0;
  if (o.status === "proof_sent") return 2;
  return 4;
}

function Approval({ order, customer, demo }: { order: Order; customer: Customer; demo: DemoState }) {
  const [panel, setPanel] = useState<null | "proof" | "override">(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const assets = demo.assets;
  const plan = planTransfers(order, assets);
  const named = plan.filter((p) => p.personalized);
  const step = stepOf(order);
  const approved = ["approved", "printing", "ready"].includes(order.status);
  const proofUrl = order.proofToken ? `/proof/${order.proofToken}` : null;
  const first = customer.name.split(/\s+/)[0];
  const shirts = order.designs.reduce((s, d) => s + totalShirts(d.sizeCounts), 0);
  const sms = `Hi ${first}, your proof for order #${order.orderNo} is ready: ${order.designs.length} shirt ${order.designs.length === 1 ? "design" : "designs"}, ${shirts} shirts. ${typeof window === "undefined" ? "" : window.location.origin}/proof/${order.proofToken ?? "<link>"}\nReply YES to approve and start printing. Reply CHANGE and tell us what to fix.`;

  const production = order.production;
  const building = busy || production?.status === "building";

  /** Builds the gang sheet on the server (South Side DTF makes the printable sheet in Drive). */
  async function gangSheet() {
    setBusy(true);
    setMsg(null);
    try {
      if (dataMode() !== "db") {
        // Offline demo: no server, so make the project file here (old behavior).
        const { fileName, json } = await buildGangSheet(order, customer, assets);
        const blob = new Blob([json], { type: "application/json" });
        download(blob, fileName);
        markSentToProduction(order.id, fileName, await uploadFile(customer.id, blob, "json"));
        setMsg({ tone: "good", text: `${fileName} downloaded. Open it in South Side DTF: /shop → Reopen Project → Upload.` });
        return;
      }
      const res = await fetch("/api/production/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderId: order.id }) });
      const body = (await res.json()) as { production?: NonNullable<Order["production"]>; error?: string };
      await reload();
      const p = body.production;
      if (!res.ok || !p || p.status === "failed") throw new Error(p?.error ?? body.error ?? "Couldn't make the gang sheet.");
      const boardNo = `M${order.orderNo.replace(/\D/g, "")}`;
      setMsg({
        tone: "good",
        text: p.sheetUrl
          ? `Gang sheet ready: ${p.sheetName} (${p.sheetLengthIn} in), saved in Google Drive. On the Job Board as ${boardNo}.`
          : `Gang sheet project saved and on the Job Board as ${boardNo}. (Automatic sheet building isn't switched on yet: open the file in South Side DTF.)`,
      });
    } catch (e) {
      setMsg({ tone: "bad", text: e instanceof Error ? e.message : "Couldn't make the gang sheet." });
    } finally {
      setBusy(false);
    }
  }

  /** The project file, made in this browser, for opening by hand in South Side DTF. */
  async function downloadProject() {
    try {
      const { fileName, json } = await buildGangSheet(order, customer, assets);
      download(new Blob([json], { type: "application/json" }), fileName);
    } catch (e) {
      setMsg({ tone: "bad", text: e instanceof Error ? e.message : "Couldn't make the project file." });
    }
  }

  return (
    <Card className="flex flex-col gap-5 border-2 border-blue/30">
      <div className="flex flex-wrap items-center gap-3">
        <H2>
          Order {order.orderNo} · {summaryText(order.designs)}
        </H2>
        <StatusBadge status={order.status} />
        <span className="text-muted text-[14px] ml-auto">Sent {fmtTime(order.createdAt)}</span>
      </div>
      {order.status === "changes_requested" && order.changeText && <Notice tone="warn">Customer asked for a change: “{order.changeText}”</Notice>}

      {/* 1. Art check */}
      <section className="flex flex-col gap-3">
        <h3 className="font-semibold text-[17px]">1 · What they sent → print ready → mockup</h3>
        {order.designs.map((d) => (
          <div key={d.id} className="grid sm:grid-cols-[1fr_180px_180px] gap-3 items-start">
            <div className="flex flex-col gap-2">
              <div className="font-semibold">
                {d.name} · {d.color} · {totalShirts(d.sizeCounts)} shirts
              </div>
              {d.spots.map((s) => {
                const a = assets.find((x) => x.id === s.assetId);
                return (
                  <div key={s.id} className="flex gap-2 items-start">
                    <ArtThumb asset={a} named={isPersonalized(s.spotId)} />
                    <div className="text-[14px]">
                      <div className="font-medium">
                        {spotDef(s.spotId).label}
                        {s.sizeLabel ? ` · ${s.sizeLabel}` : ""}
                      </div>
                      {a?.checks.map((c) => (
                        <div key={c.text} className={c.ok ? "text-good" : "text-warn"}>
                          {c.ok ? "✓" : "⚠"} {c.text}
                        </div>
                      ))}
                      {isPersonalized(s.spotId) && <div className="text-muted">{d.roster.length} names from the roster</div>}
                    </div>
                  </div>
                );
              })}
            </div>
            <Mockup input={{ design: d, view: "front", assets }} alt={`${d.name}, front`} />
            <Mockup input={{ design: d, view: "back", assets }} alt={`${d.name}, back`} />
          </div>
        ))}
        <p className="text-[13px] text-muted">Art engine not connected in the demo: art is shown as the customer sent it.</p>
      </section>

      {/* 2. Gang sheet */}
      <section className="flex flex-col gap-2">
        <h3 className="font-semibold text-[17px]">2 · What goes on the gang sheet</h3>
        <ul className="text-[15px] flex flex-col gap-1">
          {plan
            .filter((p) => !p.personalized)
            .map((p, i) => (
              <li key={i}>
                • {p.name} · {fmtIn(p.widthIn)} × {fmtIn(p.heightIn)} in{p.sizeLabel ? ` (${p.sizeLabel})` : ""} <b>× {p.quantity}</b>
              </li>
            ))}
          {named.length > 0 && (
            <li>
              • Names + numbers · {fmtIn(named[0].widthIn)} × {fmtIn(named[0].heightIn)} in <b>× {named.length}</b>
            </li>
          )}
        </ul>
        <div className="text-[15px] font-semibold">
          {plan.reduce((s, p) => s + p.quantity, 0)} transfers · {named.length} personalized, one per name, sorted by size
        </div>
      </section>

      {/* 3. Garments */}
      <section className="flex flex-col gap-2">
        <h3 className="font-semibold text-[17px]">3 · Garments in stock</h3>
        {order.designs.map((d) => (
          <div key={d.id} className="flex flex-wrap items-center gap-2">
            <span className="w-full sm:w-auto sm:min-w-[220px] text-[15px]">
              {d.name} · {garmentLabel(d)} · {d.color}{d.brand ? " (closest Gildan color)" : ""}
            </span>
            {SHIRT_SIZES.filter((s) => d.sizeCounts[s]).map((s) => (
              <label key={s} className={`flex items-center gap-2 min-h-10 px-3 rounded-[8px] border text-[14px] ${d.inStock[s] ? "border-good bg-good-soft" : "border-line-strong bg-white"}`}>
                <input type="checkbox" className="size-4 accent-[#13804a]" checked={!!d.inStock[s]} onChange={(e) => setInStock(order.id, d.id, s, e.target.checked)} />
                {s} × {d.sizeCounts[s]}
              </label>
            ))}
          </div>
        ))}
        <p className="text-[13px] text-muted">Ticked by hand for now; the S&amp;S stock check can plug in here later.</p>
      </section>

      {/* 4. Tracker */}
      <section className="flex flex-col gap-2">
        <h3 className="font-semibold text-[17px]">4 · Customer approval</h3>
        <ol className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {STEPS.map((s, i) => {
            const done = i < step;
            const now = i === step || (i === 3 && step === 4);
            return (
              <li key={s} className={`px-3 py-2 rounded-[10px] border text-[14px] font-semibold ${done || (i === 3 && approved) ? "bg-good-soft border-[#b9e2c9] text-good" : now ? "bg-blue-soft border-[#c4d6ee] text-blue" : "bg-ground border-line text-muted"}`}>
                {done || (i === 3 && approved) ? "✓ " : `${i + 1} · `}
                {s}
              </li>
            );
          })}
        </ol>
        {approved && order.approvedAt && (
          <div className="text-good font-semibold text-[15px]">
            Customer approved {fmtTime(order.approvedAt)} {order.approvedVia ? `(${order.approvedVia})` : ""}
          </div>
        )}
      </section>

      {/* 5. Actions */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setPanel(panel === "proof" ? null : "proof")} disabled={approved}>
            {order.proofToken ? "Resend proof" : "Send proof"}
          </Button>
          <Button tone="good" disabled={!approved || building} onClick={() => void gangSheet()} title={approved ? undefined : "Unlocks when the customer approves"}>
            {building ? "Building gang sheet…" : production ? "Rebuild gang sheet" : "Send to production"}
          </Button>
          {approved && (
            <Button tone="secondary" onClick={() => void downloadProject()}>
              Download project file
            </Button>
          )}
          {approved && (
            <ButtonLink href={`/shop/press/${order.orderNo}`} tone="secondary">
              Open press station
            </ButtonLink>
          )}
          {!approved && order.status !== "submitted" && (
            <Button tone="secondary" onClick={() => setPanel(panel === "override" ? null : "override")}>
              Mark approved (customer called)
            </Button>
          )}
          <Button tone="secondary" disabled title="Uses the existing Photoshop export; comes later">
            Fix by hand (Photoshop)
          </Button>
          {proofUrl && (
            <a href={proofUrl} target="_blank" rel="noreferrer" className="inline-flex items-center min-h-11 px-2 text-blue font-semibold">
              Open the customer&apos;s proof page ↗
            </a>
          )}
        </div>
        {!approved && <p className="text-[13px] text-muted">Send to gang sheet stays locked until the customer approves.</p>}
        {production && <ProductionStatus production={production} />}
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

        {panel === "proof" && (
          <div className="grid md:grid-cols-2 gap-3">
            <div className="rounded-[12px] border border-line p-3 bg-ground">
              <div className="text-[13px] font-semibold text-muted mb-1">Text to {formatPhone(customer.phone)}</div>
              {customer.smsOk ? <p className="whitespace-pre-wrap text-[15px] bg-white rounded-[10px] p-3 border border-line">{sms}</p> : <p className="text-[14px] text-muted">Customer didn&apos;t opt in to texts.</p>}
            </div>
            <div className="rounded-[12px] border border-line p-3 bg-ground">
              <div className="text-[13px] font-semibold text-muted mb-1">Email to {customer.email}</div>
              <div className="bg-white rounded-[10px] p-3 border border-line text-[15px]">
                <div className="font-semibold">Your proof is ready: order #{order.orderNo}</div>
                <p className="mt-1">Mockups of every design, a Review and approve button, and “Or reply APPROVED”.</p>
              </div>
            </div>
            <div className="md:col-span-2 flex flex-wrap items-center gap-3">
              <Button
                onClick={() => {
                  sendProof(order.id, customer.smsOk ? "text + email" : "email");
                  setPanel(null);
                }}
              >
                Send proof
              </Button>
              <span className="text-[13px] text-muted">Demo: nothing is really sent. Texting (Twilio) and email come in Phase 4.</span>
            </div>
          </div>
        )}
        {panel === "override" && (
          <div className="flex flex-col gap-2 max-w-[560px]">
            <label className="flex flex-col gap-1">
              <span className="font-semibold text-[15px]">Note (required): who approved, and how</span>
              <input className={INPUT} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Maria called at 2:10, approved all names" />
            </label>
            <Button
              tone="good"
              disabled={!note.trim()}
              onClick={() => {
                approve(order.id, "staff", note);
                setPanel(null);
              }}
            >
              Mark approved
            </Button>
          </div>
        )}
      </section>
    </Card>
  );
}

function ArtThumb({ asset, named }: { asset: Asset | undefined; named: boolean }) {
  return (
    <span className={`size-12 shrink-0 rounded-[8px] ${named ? "bg-[#1c2028]" : "checker"} p-1 flex items-center justify-center`}>
      {named ? (
        <span className="font-cond font-extrabold text-white text-[13px] leading-none text-center">
          NAME
          <br />
          00
        </span>
      ) : asset ? (
        // eslint-disable-next-line @next/next/no-img-element -- local art
        <img src={asset.src} alt="" className="max-h-full max-w-full object-contain" />
      ) : (
        <span className="text-white/60 text-[11px]">none</span>
      )}
    </span>
  );
}

/** Where the gang sheet is: building, ready (with links), or failed. */
function ProductionStatus({ production: p }: { production: NonNullable<Order["production"]> }) {
  if (p.status === "building") return <Notice tone="info">Building the gang sheet… This takes about a minute; it updates here by itself.</Notice>;
  if (p.status === "failed") return <Notice tone="bad">The gang sheet didn&apos;t build: {p.error ?? "unknown error"}. Press Rebuild gang sheet to try again.</Notice>;
  return (
    <Notice tone="good">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>{p.sheetUrl ? `Gang sheet ready · ${p.sheetName ?? "print file"}${p.sheetLengthIn ? ` · ${p.sheetLengthIn} in` : ""}` : "Gang sheet project saved"} · {fmtTime(p.sentAt)}</span>
        {p.sheetUrl && (
          <a className="underline font-semibold" href={p.sheetUrl} target="_blank" rel="noreferrer">
            Print file ↗
          </a>
        )}
        {p.folderUrl && (
          <a className="underline" href={p.folderUrl} target="_blank" rel="noreferrer">
            Drive folder ↗
          </a>
        )}
        {p.cutUrl && (
          <a className="underline" href={p.cutUrl} target="_blank" rel="noreferrer">
            Cut file ↗
          </a>
        )}
        {p.fileUrl && (
          <a className="underline" href={p.fileUrl} target="_blank" rel="noreferrer">
            Project file ↗
          </a>
        )}
      </div>
    </Notice>
  );
}
