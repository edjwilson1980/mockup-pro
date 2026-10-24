import { describe, expect, it } from "vitest";
import { boardEntries, boardOrderNo } from "@/lib/board-feed";
import { seedState } from "@/lib/demo/seed";
import type { Order } from "@/lib/demo/types";

const s = seedState(Date.parse("2026-10-13T15:00:00Z"));
const base = s.orders.find((o) => o.orderNo === "MP-1042")!;

describe("Job Board feed", () => {
  it("only lists orders sent to production", () => {
    expect(boardEntries([base], s.customers, s.assets)).toEqual([]);
  });

  it("shapes a sent order as a board job", () => {
    const o: Order = { ...structuredClone(base), status: "printing", production: { sentAt: "2026-10-14T18:00:00.000Z", fileName: "x.ssp.json", fileUrl: "https://example.com/x.json" } };
    const [e] = boardEntries([o], s.customers, s.assets);
    expect(e.job.order_number).toBe("M1042");
    expect(e.job.id).toBe(`mockup-${o.id}`);
    expect(e.job.source).toBe("mockup");
    expect(e.job.file_url).toBe("https://example.com/x.json");
    expect(e.job.item_summary).toMatch(/36 shirts/);
    expect(e.status).toBe("processing");
  });

  it("reports completed once the press station finished", () => {
    const o: Order = { ...structuredClone(base), status: "ready", readyAt: "2026-10-14T20:00:00.000Z", production: { sentAt: "2026-10-14T18:00:00.000Z", fileName: "x", fileUrl: null } };
    const [e] = boardEntries([o], s.customers, s.assets);
    expect(e.status).toBe("completed");
    expect(e.completedAt).toBe("2026-10-14T20:00:00.000Z");
  });

  it("turns MP numbers into board M numbers", () => {
    expect(boardOrderNo("MP-1044")).toBe("M1044");
  });
});
