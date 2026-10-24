export type Product = {
  id: string
  group: 'DTF & transfers' | 'Apparel' | 'Paper print' | 'Large format & signs' | 'Promo products'
  label: string
  apparel: boolean
  bleed: boolean
  /** Goes to the gang sheet when approved. */
  gangable: boolean
  sizes: { label: string; w: number; h: number }[]
  specs: [string, string][]
  ask: string
}

export const PRODUCTS: Product[] = [
  {
    id: 'gang', group: 'DTF & transfers', label: 'DTF gang sheet', apparel: false, bleed: false, gangable: true,
    sizes: [{ label: 'Adult front 11"', w: 11, h: 11 }, { label: 'Full front 10.5"', w: 10.5, h: 10.5 }, { label: 'Left chest 4"', w: 4, h: 4 }],
    specs: [['Sheet width', '22.3 in (standard)'], ['Resolution', '300 DPI'], ['Background', 'Transparent'], ['Format', 'PNG']],
    ask: 'Knock out black for black shirts, 10.5" wide, 12 on a gang sheet.',
  },
  {
    id: 'single', group: 'DTF & transfers', label: 'DTF single transfer', apparel: false, bleed: false, gangable: true,
    sizes: [{ label: 'Left chest 4"', w: 4, h: 4 }, { label: 'Adult front 11"', w: 11, h: 12 }, { label: 'Oversize 14"', w: 14, h: 16 }],
    specs: [['Resolution', '300 DPI'], ['Background', 'Transparent'], ['Min line', '1 pt'], ['Format', 'PNG']],
    ask: 'Clean up this logo and make it 11" wide.',
  },
  {
    id: 'uvdtf', group: 'DTF & transfers', label: 'UV DTF', apparel: false, bleed: false, gangable: true,
    sizes: [{ label: 'Cup wrap 9" × 3"', w: 9, h: 3 }, { label: 'Decal 3"', w: 3, h: 3 }, { label: 'Decal 4"', w: 4, h: 4 }],
    specs: [['Sheet width', '22.3 in (standard)'], ['Resolution', '300 DPI'], ['White', 'Auto white layer'], ['Format', 'PNG']],
    ask: 'Make cup wraps from this logo, 3" tall.',
  },
  {
    id: 'tee', group: 'Apparel', label: 'T-shirt (Gildan 5000)', apparel: true, bleed: false, gangable: true,
    sizes: [{ label: 'Full front 10.5"', w: 10.5, h: 10.5 }, { label: 'Left chest 4"', w: 4, h: 4 }, { label: 'Full back 12 × 14', w: 12, h: 14 }],
    specs: [['Blank', 'Gildan 5000 / G500'], ['Max print', '12 × 14 in'], ['From collar', '3 in'], ['Method', 'DTF']],
    ask: 'Black tee, full front, knock out black, make a mockup.',
  },
  {
    id: 'hoodie', group: 'Apparel', label: 'Hoodie (Gildan 18500)', apparel: true, bleed: false, gangable: true,
    sizes: [{ label: 'Front 11 × 9', w: 11, h: 9 }, { label: 'Left chest 4"', w: 4, h: 4 }, { label: 'Full back 13 × 14', w: 13, h: 14 }],
    specs: [['Blank', 'Gildan 18500'], ['Front max', '11 × 9 in (above pocket)'], ['Method', 'DTF']],
    ask: 'Chest logo front, big design on back, charcoal hoodie.',
  },
  {
    id: 'screen', group: 'Apparel', label: 'Screen print (film seps)', apparel: true, bleed: false, gangable: false,
    sizes: [{ label: 'Front 12 × 14', w: 12, h: 14 }, { label: 'Left chest 4"', w: 4, h: 4 }],
    specs: [['Separations', 'Spot color (Sep Room)'], ['Halftone', '55 LPI'], ['Underbase', 'Auto on darks']],
    ask: 'Separate into 4 spot colors with underbase for black shirts.',
  },
  {
    id: 'bcard', group: 'Paper print', label: 'Business card', apparel: false, bleed: true, gangable: false,
    sizes: [{ label: '3.5" × 2"', w: 3.5, h: 2 }],
    specs: [['Bleed', '0.125 in'], ['Safe zone', '0.125 in'], ['Color', 'CMYK'], ['Format', 'PDF']],
    ask: 'Front: logo. Back: name, phone, email, website.',
  },
  {
    id: 'flyer', group: 'Paper print', label: 'Flyer', apparel: false, bleed: true, gangable: false,
    sizes: [{ label: '8.5" × 11"', w: 8.5, h: 11 }, { label: '5.5" × 8.5"', w: 5.5, h: 8.5 }, { label: '4" × 6"', w: 4, h: 6 }],
    specs: [['Bleed', '0.125 in'], ['Safe zone', '0.25 in'], ['Color', 'CMYK'], ['Format', 'PDF']],
    ask: 'Grand opening flyer with date, address and a coupon.',
  },
  {
    id: 'poster', group: 'Paper print', label: 'Poster', apparel: false, bleed: true, gangable: false,
    sizes: [{ label: '11" × 17"', w: 11, h: 17 }, { label: '18" × 24"', w: 18, h: 24 }, { label: '24" × 36"', w: 24, h: 36 }],
    specs: [['Bleed', '0.125 in'], ['Resolution', '150–300 DPI'], ['Format', 'PDF']],
    ask: 'Event poster, name huge at top, venue and date at bottom.',
  },
  {
    id: 'banner', group: 'Large format & signs', label: 'Vinyl banner', apparel: false, bleed: true, gangable: false,
    sizes: [{ label: "2' × 4'", w: 48, h: 24 }, { label: "3' × 6'", w: 72, h: 36 }, { label: "4' × 8'", w: 96, h: 48 }],
    specs: [['Resolution', '100–150 DPI at size'], ['Hem', '1 in'], ['Grommets', 'Every 2 ft'], ['Format', 'PDF']],
    ask: 'Now open banner, phone number readable from the street.',
  },
  {
    id: 'yard', group: 'Large format & signs', label: 'Yard sign', apparel: false, bleed: true, gangable: false,
    sizes: [{ label: '24" × 18"', w: 24, h: 18 }, { label: '18" × 12"', w: 18, h: 12 }],
    specs: [['Material', '4 mm coroplast'], ['Resolution', '150 DPI'], ['Format', 'PDF']],
    ask: 'Big name, website at the bottom.',
  },
  {
    id: 'sticker', group: 'Large format & signs', label: 'Sticker / decal (pre-cut)', apparel: false, bleed: false, gangable: true,
    sizes: [{ label: '3"', w: 3, h: 3 }, { label: '4"', w: 4, h: 4 }, { label: '6" × 3"', w: 6, h: 3 }],
    specs: [['Cut', 'Teneth CCD, 2.5 mm box'], ['Resolution', '300 DPI'], ['Format', 'PNG + cut.plt']],
    ask: 'Stickers of this logo, pre-cut.',
  },
  {
    id: 'promo', group: 'Promo products', label: 'Promo item (pens, mugs, koozies)', apparel: false, bleed: false, gangable: false,
    sizes: [{ label: 'Mug wrap 8.5" × 3.5"', w: 8.5, h: 3.5 }, { label: 'Koozie 3.5" × 3"', w: 3.5, h: 3 }],
    specs: [['Imprint area', 'Per supplier'], ['Art', 'Vector preferred'], ['Format', 'PDF']],
    ask: 'One-color version of this logo for pens.',
  },
]

export const GROUPS = Array.from(new Set(PRODUCTS.map((p) => p.group)))

export const GARMENTS = [
  { id: 'black', name: 'Black', hex: '#111113' },
  { id: 'white', name: 'White', hex: '#F4F4F2' },
  { id: 'red', name: 'Red', hex: '#B3202C' },
  { id: 'navy', name: 'Navy', hex: '#1C2541' },
  { id: 'grey', name: 'Sport grey', hex: '#9EA2A8' },
  { id: 'charcoal', name: 'Charcoal', hex: '#3A3D42' },
]
