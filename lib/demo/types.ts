// Demo data model. It follows supabase/migrations/20261012_mockup_pro.sql in
// shape, so the screens carry over when the database is connected.

export const SHIRT_SIZES = ["S", "M", "L", "XL", "2XL", "3XL"] as const;
export type ShirtSize = (typeof SHIRT_SIZES)[number];
export type SizeCounts = Record<ShirtSize, number>;

export type Customer = {
  id: string;
  /** "C-1001" */
  fileNo: string;
  name: string;
  org: string | null;
  /** E.164, e.g. +17735550142 */
  phone: string;
  email: string;
  /** Order texts (mockups, proofs, pickup). */
  smsOk: boolean;
  /** Promotional texts and emails. Separate opt-in; missing on older demo data. */
  marketingOk?: boolean;
  /** What the customer agreed to, word for word, and when. Kept as proof of consent. */
  consent?: { at: string; version: string; text: string[] } | null;
  createdAt: string;
};

export type ArtCheck = { ok: boolean; text: string };

/** Only print art is stored. Mockups are drawn on the fly and never saved as art. */
export type Asset = {
  id: string;
  customerId: string;
  name: string;
  kind: "print-art";
  /** Data URL (uploads) or a /demo-art/… path (sample data). */
  src: string;
  widthPx: number;
  heightPx: number;
  checks: ArtCheck[];
  createdAt: string;
};

/** One print spot on a design. `spotId` is from garments.json → printSpots. */
export type PlacedSpot = {
  id: string;
  spotId: string;
  /** Null for names + numbers (made from the roster) or a spot still waiting for art. */
  assetId: string | null;
  /** Exact label from print-sizes.json; null for Custom spots. */
  sizeLabel: string | null;
  /** Custom size: box width and height in inches (the art fits inside, keeping its shape). */
  widthIn?: number;
  heightIn?: number;
  /** "Somewhere else": inches from the collar point. */
  freeXIn?: number;
  freeYIn?: number;
  /** Manual placement: inches dragged from the standard position (right / down). */
  moveXIn?: number;
  moveYIn?: number;
};

export type RosterRow = { id: string; name: string; number: string; size: ShirtSize };

export type Design = {
  id: string;
  name: string;
  /** Garment id from garments.json, e.g. "gildan-5000" (tee) or "gildan-18500" (hoodie). */
  garmentId: string;
  /**
   * Brand the shop will actually buy, when it isn't the garment we draw (e.g.
   * "Bella+Canvas 3001"). The mockup stays on the Gildan photo in the closest color.
   */
  brand?: string | null;
  /** Color name from that garment's colors file. */
  color: string;
  sizeCounts: SizeCounts;
  spots: PlacedSpot[];
  roster: RosterRow[];
  /** Shop's stock check per size. */
  inStock: Partial<Record<ShirtSize, boolean>>;
};

export type OrderStatus = "draft" | "submitted" | "proof_sent" | "changes_requested" | "approved" | "printing" | "ready";

export type OrderEvent = { at: string; text: string };

export type Order = {
  id: string;
  /** "MP-1042" */
  orderNo: string;
  customerId: string;
  status: OrderStatus;
  designs: Design[];
  createdAt: string;
  proofToken: string | null;
  approvedAt: string | null;
  approvedVia: "proof page" | "text" | "email" | "staff" | null;
  changeText: string | null;
  /** Shirts pressed so far (press station). */
  pressed: number;
  /** Sent to production: the gang sheet file, and when it went on the Job Board feed. */
  production?: {
    sentAt: string;
    fileName: string;
    /** The `.ssp.json` project file. */
    fileUrl: string | null;
    /** building → sent (or failed). Missing on orders sent before automatic building. */
    status?: "building" | "sent" | "failed";
    error?: string | null;
    /** The finished, printable gang sheet in Google Drive (made by South Side DTF). */
    sheetUrl?: string | null;
    sheetName?: string | null;
    sheetLengthIn?: number | null;
    folderUrl?: string | null;
    cutUrl?: string | null;
  } | null;
  /** When the press station finished the last shirt. */
  readyAt?: string | null;
  /** Test jobs only: the Job Board stage the job starts in (new, ready, printing, done). */
  boardStage?: "new" | "ready" | "printing" | "done";
  events: OrderEvent[];
};

export type DemoState = {
  version: 1;
  customers: Customer[];
  assets: Asset[];
  orders: Order[];
  nextFileNo: number;
  nextOrderNo: number;
};

export const STATUS_LABEL: Record<OrderStatus, string> = {
  draft: "Draft",
  submitted: "Waiting for shop",
  proof_sent: "Proof sent",
  changes_requested: "Changes requested",
  approved: "Approved",
  printing: "Printing",
  ready: "Ready for pickup",
};
