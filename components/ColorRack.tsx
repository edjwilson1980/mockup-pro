"use client";

import { useState } from "react";
import { colorsFor } from "@/lib/catalog";

/** A garment's Gildan colors, grouped by family, with search (spec Phase 1). */
export function ColorRack({ value, onChange, columns = 6, garmentId }: { value: string; onChange: (name: string) => void; columns?: number; garmentId?: string }) {
  const [q, setQ] = useState("");
  const all = colorsFor(garmentId);
  const families = [...new Set(all.map((c) => c.family))];
  const query = q.trim().toLowerCase();
  const list = query ? all.filter((c) => c.name.toLowerCase().includes(query) || c.family.toLowerCase().includes(query)) : all;
  const current = all.find((c) => c.name === value);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className={`size-7 rounded-full border border-line-strong shrink-0 ${current?.heather ? "heather" : ""}`} style={{ background: current?.hex }} />
        <span className="font-semibold">{value}</span>
        {current?.heather && <span className="text-[12px] text-muted">heather · approx.</span>}
        <span className="ml-auto text-[13px] text-muted font-mono">{current?.hex}</span>
      </div>
      <input
        type="search"
        aria-label="Search colors"
        placeholder={`Search ${all.length} colors`}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="min-h-11 px-3 rounded-[10px] border border-line-strong bg-white"
      />
      <div className="flex flex-col gap-3 max-h-[420px] overflow-y-auto pr-1">
        {families.map((family) => {
          const colors = list.filter((c) => c.family === family);
          if (!colors.length) return null;
          return (
            <div key={family}>
              <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted mb-1.5">{family}</div>
              <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
                {colors.map((c) => {
                  const on = c.name === value;
                  return (
                    <button
                      key={c.name}
                      type="button"
                      title={`${c.name}${c.heather ? " (heather, approx.)" : ""}`}
                      aria-label={c.name}
                      aria-pressed={on}
                      onClick={() => onChange(c.name)}
                      className={`aspect-square rounded-full border ${c.heather ? "heather" : ""} ${on ? "ring-3 ring-blue ring-offset-2" : "border-line-strong"}`}
                      style={{ background: c.hex }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
        {!list.length && <p className="text-muted text-[14px]">No color matches “{q}”.</p>}
      </div>
    </div>
  );
}
