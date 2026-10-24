/** Mockup Pro records (shared Supabase table mp_records), as Art Pro sees them. */
export type MpCheck = { ok: boolean; text: string }
export type MpAsset = {
  id: string; src: string; kind: 'print-art'; name: string; checks: MpCheck[]; widthPx: number; heightPx: number
  createdAt: string; customerId: string
  /** Added by Art Pro */
  originalSrc?: string; cmykSrc?: string; artPro?: { jobId: string; jobNo: number; at: string; note: string }
}
export type MpSpot = { id: string; spotId: string; assetId: string; sizeLabel?: string | null; widthIn?: number; heightIn?: number; moveXIn?: number; moveYIn?: number }
export type MpDesign = { id: string; name: string; brand?: string; color: string; spots: MpSpot[]; roster: unknown[]; inStock: Record<string, number>; garmentId: string; sizeCounts: Record<string, number> }
export type MpOrder = {
  id: string; orderNo: string; status: string; designs: MpDesign[]; events: { at: string; text: string }[]
  customerId: string; createdAt: string; approvedAt: string | null; approvedVia: string | null; changeText: string | null
  pressed: number; proofToken: string | null
  artPro?: { jobId: string; jobNo: number; mockups?: string[]; qty?: number }
  [k: string]: unknown
}
export type MpCustomer = { id: string; name: string; org: string | null; fileNo: string; phone?: string; email?: string }

export type MpOrderRow = { id: string; orderNo: string; status: string; customerId: string; customer: string; fileNo: string; createdAt: string; designs: number; needsArt: number; garment: string; color: string }

/** Mockup Pro order statuses Art Pro may change: all of them, including orders the customer has closed out. */
export const EDITABLE = ['draft', 'submitted', 'changes_requested', 'proof_sent', 'approved', 'printing', 'ready']
/** Closed-out orders: art can still be fixed, but the status stays and the gang sheet needs rebuilding. */
export const CLOSED = ['printing', 'ready']
/** Statuses whose proof goes stale when the art changes: saving sends them back to "submitted" (needs a new proof). */
export const REPROOF = ['proof_sent', 'approved', 'changes_requested']
export type MpCustomerOrder = { id: string; orderNo: string; status: string; createdAt: string; designs: { name: string; color: string; garmentId: string; spots: { spotId: string; sizeLabel?: string | null; src?: string; needsArt: boolean }[] }[] }

export const SPOT_OF_PLACE: Record<string, string> = { Front: 'full-front', Back: 'full-back', 'Left chest': 'left-chest', Sleeve: 'left-sleeve' }
export const PLACE_OF_SPOT: Record<string, 'Front' | 'Back' | 'Left chest' | 'Sleeve'> = { 'full-front': 'Front', 'full-back': 'Back', 'left-chest': 'Left chest', 'right-chest': 'Left chest', 'left-sleeve': 'Sleeve', 'right-sleeve': 'Sleeve' }
export const GARMENT_OF_TYPE: Record<string, string> = { tee: 'gildan-5000', hoodie: 'gildan-18500' }

/** "Medium · 10.5 × 12 in" → 10.5, "3.5 in" → 3.5 */
export function widthFromLabel(label?: string | null) {
  const m = label && /(\d+(?:\.\d+)?)\s*(?:×|x|in)/.exec(label)
  return m ? Number(m[1]) : undefined
}
