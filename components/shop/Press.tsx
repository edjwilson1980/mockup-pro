"use client";

import Link from "next/link";
import { useState } from "react";
import { Loading, Mockup, fmtTime } from "@/components/ui";
import { fmtIn, spotDef, type ViewId } from "@/lib/catalog";
import { pressNext, pressProblem } from "@/lib/demo/actions";
import { useDemo } from "@/lib/demo/store";
import { SHIRT_SIZES, type Asset, type Design } from "@/lib/demo/types";
import { garmentLabel } from "@/lib/catalog";
import { pressList } from "@/lib/production";
import { MASTER, collarPoint, spotBoxes } from "@/lib/spot-boxes";

const SIZE_WORD: Record<string, string> = { S: "Small", M: "Medium", L: "Large", XL: "XL", "2XL": "2XL", "3XL": "3XL" };

/** Spec Phase 5: one shirt at a time. No contact info, prices or notes here. */
export function Press({ orderNo }: { orderNo: string }) {
  const demo = useDemo();
  const [problem, setProblem] = useState<string | null>(null);
  const [logged, setLogged] = useState(false);
  if (!demo) return <Loading />;
  const order = demo.orders.find((o) => o.orderNo === orderNo);

  if (!order || !["approved", "printing", "ready"].includes(order.status)) {
    return (
      <Dark>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
          <div className="font-cond font-extrabold text-[40px] uppercase">{order ? `${order.orderNo} isn't on the press yet` : `No order ${orderNo}`}</div>
          <p className="text-white/70 text-[18px] max-w-[560px]">The press station opens as soon as the customer approves the proof.</p>
          {order && (
            <Link href={`/shop/customers/${demo.customers.find((c) => c.id === order.customerId)?.fileNo}`} className="text-yellow font-semibold text-[18px]">
              Go to the order →
            </Link>
          )}
        </div>
      </Dark>
    );
  }

  const list = pressList(order);
  const total = list.length;
  const doneAll = order.pressed >= total;
  const cur = list[Math.min(order.pressed, total - 1)];
  const d = cur.design;
  const rosterIndex = cur.row ? d.roster.findIndex((r) => r.id === cur.row!.id) : 0;
  const sizeDone = SHIRT_SIZES.map((s) => {
    const all = list.filter((x) => x.design.id === d.id && x.size === s);
    const done = all.filter((x) => list.indexOf(x) < order.pressed).length;
    return { size: s, done, total: all.length };
  }).filter((x) => x.total);
  const otherSpots = d.spots.filter((s) => ["side", "right"].includes(spotDef(s.spotId).view) || s.spotId === "back-neck");

  return (
    <Dark>
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4 border-b border-press-line">
        <span className="font-cond font-extrabold text-[30px] uppercase">{order.orderNo}</span>
        <span className="text-[18px] text-white/80">
          Shirt {cur.designIndex + 1} of {order.designs.length} · {d.color} {garmentLabel(d)} · {d.name}
        </span>
        {order.approvedAt && <span className="text-[16px] font-semibold text-[#34D399]">Customer approved {fmtTime(order.approvedAt)}</span>}
        <Link href="/shop/production" className="ml-auto text-white/60 text-[15px]">
          Exit
        </Link>
      </header>

      <div className="flex-1 grid lg:grid-cols-[1fr_1fr_340px] gap-5 p-6">
        <Measured design={d} view="front" assets={demo.assets} rosterIndex={rosterIndex} />
        <Measured design={d} view="back" assets={demo.assets} rosterIndex={rosterIndex} />

        <div className="flex flex-col gap-4">
          {doneAll ? (
            <div className="rounded-[14px] bg-[#34D399] text-[#0E1014] p-5">
              <div className="font-cond font-extrabold text-[34px] uppercase leading-none">All {total} pressed</div>
              <div className="text-[17px] mt-1 font-semibold">Order is ready for pickup.</div>
            </div>
          ) : (
            <div className="rounded-[14px] bg-yellow text-[#0E1014] p-5">
              <div className="text-[14px] font-bold uppercase tracking-[0.12em]">Now pressing</div>
              <div className="font-cond font-extrabold text-[44px] uppercase leading-none mt-1">
                {cur.size} · {cur.row ? `${cur.row.name} ${cur.row.number}` : d.name}
              </div>
              <div className="text-[18px] font-semibold mt-2">
                {SIZE_WORD[cur.size]} {cur.nOfSize} of {cur.sizeTotal} · shirt {order.pressed + 1} of {total}
              </div>
            </div>
          )}

          {otherSpots.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {otherSpots.map((s) => {
                const box = spotBoxes([s], spotDef(s.spotId).view as ViewId, demo.assets, d.garmentId)[0];
                return (
                  <div key={s.id} className="rounded-[12px] bg-press-panel border border-press-line p-3">
                    <div className="font-semibold">{spotDef(s.spotId).label}</div>
                    <div className="text-yellow font-cond font-bold text-[24px]">{box ? `${fmtIn(box.widthIn)}″ wide` : "—"}</div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="rounded-[12px] bg-press-panel border border-press-line p-3">
            <div className="text-[13px] uppercase tracking-[0.1em] text-white/60 font-semibold">Press settings</div>
            <div className="font-mono text-[20px] mt-1">[TEMP] °F · [TIME] s · [PRESSURE]</div>
            <div className="text-[13px] text-white/50 mt-1">Set in shop settings once Ed confirms them (open question 1).</div>
          </div>

          <div className="flex gap-1.5">
            {sizeDone.map((x) => (
              <div key={x.size} className={`flex-1 rounded-[8px] px-2 py-1.5 text-center border ${x.done === x.total ? "bg-[#13804a] border-[#13804a]" : x.size === cur.size ? "border-yellow" : "border-press-line"}`}>
                <div className="font-bold">{x.size}</div>
                <div className="text-[13px] text-white/80">
                  {x.done}/{x.total}
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            disabled={doneAll}
            onClick={() => {
              pressNext(order.id, total);
              setLogged(false);
            }}
            className="min-h-16 rounded-[14px] bg-[#13804a] disabled:bg-press-line text-white font-cond font-extrabold text-[26px] uppercase"
          >
            Done · next shirt
          </button>
          {problem === null ? (
            <button type="button" disabled={doneAll} onClick={() => setProblem("")} className="min-h-12 rounded-[12px] border border-[#EF4655] text-[#FF8A95] font-semibold text-[17px] disabled:opacity-40">
              Problem with this shirt
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <input autoFocus value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="What's wrong? (misprint, stain, wrong size…)" className="min-h-12 px-3 rounded-[10px] bg-press-panel border border-press-line text-white" />
              <button
                type="button"
                disabled={!problem.trim()}
                onClick={() => {
                  pressProblem(order.id, `${cur.size} ${cur.row ? `${cur.row.name} ${cur.row.number}` : d.name}: ${problem.trim()}`);
                  setProblem(null);
                  setLogged(true);
                }}
                className="min-h-12 rounded-[10px] bg-[#EF4655] text-white font-semibold disabled:opacity-40"
              >
                Log it and tell the shop
              </button>
            </div>
          )}
          {logged && <div className="text-[15px] text-[#FF8A95]">Logged. The shop will see it on the order.</div>}
        </div>
      </div>
    </Dark>
  );
}

function Dark({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-press text-white flex flex-col">{children}</div>;
}

/** Mockup with yellow measurement lines: width, and inches below the collar. */
function Measured({ design, view, assets, rosterIndex }: { design: Design; view: ViewId; assets: Asset[]; rosterIndex: number }) {
  const boxes = spotBoxes(design.spots, view, assets, design.garmentId).filter((b) => b.belowCollarIn !== null);
  const collar = collarPoint(view, design.garmentId);
  return (
    <figure className="flex flex-col gap-2">
      <Mockup input={{ design, view, assets, rosterIndex }} backdrop="ash" alt={`${design.name}, ${view}`}>
        <svg viewBox={`0 0 ${MASTER.width} ${MASTER.height}`} className="absolute inset-0 size-full pointer-events-none" aria-hidden="true">
          {boxes.map((b) => (
            <g key={b.id} stroke="#FFD23F" strokeWidth={4} fill="#FFD23F" fontFamily="sans-serif" fontWeight={700}>
              <rect x={b.x} y={b.y} width={b.width} height={b.height} fill="none" strokeDasharray="14 10" strokeWidth={3} />
              <line x1={b.x} x2={b.x + b.width} y1={b.y + b.height + 26} y2={b.y + b.height + 26} />
              <line x1={b.x} x2={b.x} y1={b.y + b.height + 14} y2={b.y + b.height + 38} />
              <line x1={b.x + b.width} x2={b.x + b.width} y1={b.y + b.height + 14} y2={b.y + b.height + 38} />
              <text x={b.x + b.width / 2} y={b.y + b.height + 74} textAnchor="middle" fontSize={34} stroke="#14181F" strokeWidth={8} paintOrder="stroke">
                {fmtIn(b.widthIn)}″ wide
              </text>
              {collar && b.belowCollarIn !== null && b.belowCollarIn > 0.2 && (
                <>
                  <line x1={b.x + b.width + 30} x2={b.x + b.width + 30} y1={collar.y} y2={b.y} />
                  <line x1={b.x + b.width + 18} x2={b.x + b.width + 42} y1={collar.y} y2={collar.y} />
                  <text x={b.x + b.width + 48} y={(collar.y + b.y) / 2 + 12} fontSize={30} stroke="#14181F" strokeWidth={8} paintOrder="stroke">
                    {fmtIn(b.belowCollarIn)}″ below collar
                  </text>
                </>
              )}
            </g>
          ))}
        </svg>
      </Mockup>
      <figcaption className="text-[16px] text-white/80">
        {boxes.length ? boxes.map((b) => `${b.label}: all sizes use the ${fmtIn(b.widthIn)}″ transfer`).join(" · ") : `Nothing printed on the ${view}`}
      </figcaption>
    </figure>
  );
}
