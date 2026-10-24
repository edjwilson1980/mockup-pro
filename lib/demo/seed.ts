// Sample data so every screen has something to show. "Reset demo" rebuilds it.

import type { DemoState, RosterRow, ShirtSize, SizeCounts } from "./types";

const DAY = 86_400_000;

export function emptyCounts(): SizeCounts {
  return { S: 0, M: 0, L: 0, XL: 0, "2XL": 0, "3XL": 0 };
}

function counts(c: Partial<SizeCounts>): SizeCounts {
  return { ...emptyCounts(), ...c };
}

const ROSTER: [string, string, ShirtSize][] = [
  ["REYES", "12", "L"],
  ["OKAFOR", "3", "M"],
  ["NGUYEN", "7", "S"],
  ["KOWALSKI", "21", "XL"],
  ["BROOKS", "5", "M"],
  ["SANTOS", "9", "L"],
  ["MURPHY", "14", "L"],
  ["PATEL", "2", "S"],
  ["JOHNSON", "33", "2XL"],
  ["GARCIA", "10", "M"],
  ["LEE", "8", "L"],
  ["WASHINGTON", "24", "XL"],
];

export function seedState(now: number): DemoState {
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
  const roster: RosterRow[] = ROSTER.map(([name, number, size], i) => ({ id: `r${i + 1}`, name, number, size }));
  return {
    version: 1,
    nextFileNo: 1003,
    nextOrderNo: 1043,
    customers: [
      { id: "cust-reyes", fileNo: "C-1001", name: "Maria Reyes", org: "Lincoln Park Lions", phone: "+17735550142", email: "coach.reyes@example.com", smsOk: true, marketingOk: true, createdAt: iso(40 * DAY) },
      { id: "cust-carter", fileNo: "C-1002", name: "Devon Carter", org: null, phone: "+13125550188", email: "devon.carter@example.com", smsOk: false, marketingOk: false, createdAt: iso(12 * DAY) },
    ],
    assets: [
      {
        id: "art-crest",
        customerId: "cust-reyes",
        name: "Lions crest",
        kind: "print-art",
        src: "/demo-art/lions-crest.svg",
        widthPx: 3000,
        heightPx: 3000,
        checks: [
          { ok: true, text: "Vector art: prints sharp at any size" },
          { ok: true, text: "Transparent background" },
        ],
        createdAt: iso(40 * DAY),
      },
      {
        id: "art-wordmark",
        customerId: "cust-reyes",
        name: "Lions wordmark",
        kind: "print-art",
        src: "/demo-art/lions-wordmark.svg",
        widthPx: 3150,
        heightPx: 1500,
        checks: [
          { ok: true, text: "Vector art: prints sharp at any size" },
          { ok: true, text: "Transparent background" },
        ],
        createdAt: iso(2 * DAY),
      },
    ],
    orders: [
      {
        id: "ord-1041",
        orderNo: "MP-1041",
        customerId: "cust-reyes",
        status: "ready",
        createdAt: iso(21 * DAY),
        proofToken: "demo-proof-1041",
        approvedAt: iso(20 * DAY),
        approvedVia: "text",
        changeText: null,
        pressed: 12,
        designs: [
          {
            id: "d-practice",
            name: "Practice tee",
            garmentId: "gildan-5000",
            color: "Sport Grey",
            sizeCounts: counts({ M: 6, L: 6 }),
            spots: [{ id: "s1", spotId: "left-chest", assetId: "art-crest", sizeLabel: "Standard Left Chest · 3.75 × 3.75 in" }],
            roster: [],
            inStock: { M: true, L: true },
          },
        ],
        events: [
          { at: iso(21 * DAY), text: "Order sent to the shop" },
          { at: iso(20.5 * DAY), text: "Proof sent by text" },
          { at: iso(20 * DAY), text: "Approved by text (YES)" },
          { at: iso(18 * DAY), text: "Ready for pickup" },
        ],
      },
      {
        id: "ord-1042",
        orderNo: "MP-1042",
        customerId: "cust-reyes",
        status: "submitted",
        createdAt: iso(2 * DAY),
        proofToken: null,
        approvedAt: null,
        approvedVia: null,
        changeText: null,
        pressed: 0,
        designs: [
          {
            id: "d-gameday",
            name: "Game day tee",
            garmentId: "gildan-5000",
            color: "Black",
            sizeCounts: counts({ S: 2, M: 3, L: 4, XL: 2, "2XL": 1 }),
            spots: [
              { id: "s1", spotId: "full-front", assetId: "art-wordmark", sizeLabel: "Medium · 10.5 × 12 in" },
              { id: "s2", spotId: "names-numbers", assetId: null, sizeLabel: null },
              { id: "s3", spotId: "left-sleeve", assetId: "art-crest", sizeLabel: "3.5 in" },
            ],
            roster,
            inStock: {},
          },
          {
            id: "d-parent",
            name: "Parent tee",
            garmentId: "gildan-5000",
            color: "Sport Grey",
            sizeCounts: counts({ M: 8, L: 10, XL: 6 }),
            spots: [
              { id: "s1", spotId: "left-chest", assetId: "art-crest", sizeLabel: "Standard Left Chest · 3.75 × 3.75 in" },
              { id: "s2", spotId: "full-back", assetId: "art-wordmark", sizeLabel: "Medium · 10.5 × 12 in" },
            ],
            roster: [],
            inStock: {},
          },
        ],
        events: [{ at: iso(2 * DAY), text: "Order sent to the shop" }],
      },
    ],
  };
}
