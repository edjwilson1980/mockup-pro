import colorList from './gildan-colors.json'
import { at } from './base'

export type GildanColor = { name: string; hex: string; family: string; heather: boolean }
export const GILDAN_COLORS: GildanColor[] = colorList as GildanColor[]
/** Quick-pick colors shown as buttons; staff can type any of the 87. */
export const QUICK_COLORS = ['Black', 'White', 'Sport Grey', 'Navy', 'Red', 'Royal']

export function findColor(text: string): GildanColor | undefined {
  const t = text.toLowerCase().replace(/gray/g, 'grey')
  // longest names first so "dark heather" wins over "heather"
  return [...GILDAN_COLORS].sort((a, b) => b.name.length - a.name.length).find((c) => t.includes(c.name.toLowerCase()))
}

export type Placement = 'Front' | 'Back' | 'Left chest' | 'Sleeve'

/** Max print boxes (W × H, inches) from ssp_print_sizes.json, adult defaults. */
export const PLACEMENT_BOX: Record<string, Record<Placement, [number, number]>> = {
  tee: { Front: [10.5, 12], Back: [10.5, 12], 'Left chest': [3.75, 3.75], Sleeve: [3.5, 3.5] },
  hoodie: { Front: [10.5, 11], Back: [10.5, 12], 'Left chest': [3.75, 3.75], Sleeve: [3.5, 3.5] },
}

/**
 * Mockup masters (600 × 750, from Ed's Mockup Pro kit). Alpha = garment shape,
 * gray = folds: fold = (gray − 200) / 5 in CIELAB lightness.
 * Scale: G5000 size L, 22 in chest = 21.9 px/in at 1000 px wide → 13.14 at 600.
 */
export type View = { src: string; ppi: number; cx: number; topY: number }
export const VIEWS: Record<string, Partial<Record<'front' | 'back', View>>> = {
  tee: {
    front: { src: at('/mockups/g5000_front.webp'), ppi: 13.14, cx: 303, topY: 110.4 + 3 * 13.14 },
    back: { src: at('/mockups/g5000_back.webp'), ppi: 13.14, cx: 298.8, topY: 75 + 3 * 13.14 },
  },
  hoodie: {
    // G18500 M: body ≈ 22 in across ≈ 330 px at 600 wide; print starts below the hood opening.
    front: { src: at('/mockups/g18500_front.webp'), ppi: 15, cx: 300, topY: 198 },
  },
}
