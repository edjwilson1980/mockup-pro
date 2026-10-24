"use client";

import { useState } from "react";
import { resetDemo, useDataMode } from "@/lib/demo/store";

export function DemoTools() {
  const [done, setDone] = useState(false);
  const { mode } = useDataMode();
  if (mode !== "local") {
    return <p className="text-[13px] text-muted">Live data: every device (counter tablet, phones, shop computers) sees the same customers and orders.</p>;
  }
  return (
    <section className="flex flex-wrap items-center gap-3 p-4 rounded-[14px] border border-dashed border-line-strong text-muted">
      <span className="flex-1 min-w-[260px]">Demo data lives in this browser only. Reset to start over with the sample customers and orders.</span>
      <button
        type="button"
        onClick={() => {
          resetDemo();
          setDone(true);
        }}
        className="min-h-11 px-4 rounded-[10px] border border-line-strong bg-white text-ink font-semibold"
      >
        {done ? "Reset ✓" : "Reset demo data"}
      </button>
    </section>
  );
}
