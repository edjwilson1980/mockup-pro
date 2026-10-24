import { fmtIn } from "@/lib/catalog";
import { MASTER, type SpotBox } from "@/lib/spot-boxes";

/** Dashed true-size print areas over a mockup (same 1000 × 1250 frame). */
export function PrintAreas({ boxes }: { boxes: SpotBox[] }) {
  return (
    <svg viewBox={`0 0 ${MASTER.width} ${MASTER.height}`} className="absolute inset-0 size-full pointer-events-none" aria-hidden="true">
      {boxes.map((b) => (
        <g key={b.id}>
          <rect x={b.x} y={b.y} width={b.width} height={b.height} fill="none" stroke="#1F4E8C" strokeWidth={3} strokeDasharray="12 8" />
          <rect x={b.x} y={b.y - 34} width={Math.max(b.width, 190)} height={30} rx={6} fill="#1F4E8C" />
          <text x={b.x + 10} y={b.y - 13} fill="#fff" fontSize={20} fontWeight={600} fontFamily="sans-serif">
            {b.label} · {fmtIn(b.widthIn)} × {fmtIn(b.heightIn)} in
          </text>
        </g>
      ))}
    </svg>
  );
}
