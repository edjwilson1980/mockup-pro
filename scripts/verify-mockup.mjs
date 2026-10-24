// Checks the Mockup Pro renderer against the reference it was built from.
// Run: node scripts/verify-mockup.mjs
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { loadLib } from './load-lib.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const recolor = await loadLib('lib/mockup/recolor.ts')
const place = await loadLib('lib/mockup/place.ts')
const kind = await loadLib('lib/art-kind.ts')

let failed = 0
const check = (ok, msg) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`)
  if (!ok) failed++
}
const near = (a, b, tol) => Math.abs(a - b) <= tol

// 1. Recolor matches the Python reference (mean color of the solid shirt area).
const { data, info } = await sharp(join(root, 'public/mockup-pro/gildan-5000/front-foldmap.png'))
  .ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const map = recolor.decodeFoldMap({ width: info.width, height: info.height, data: new Uint8ClampedArray(data) })
const ref = JSON.parse(readFileSync(join(root, 'scripts/mockup-reference.json'), 'utf8'))
for (const [hex, expected] of Object.entries(ref)) {
  const shirt = recolor.recolorShirt(map, hex)
  const sum = [0, 0, 0]
  let n = 0
  for (let i = 0; i < map.alpha.length; i++) {
    if (map.alpha[i] > 250) {
      for (let c = 0; c < 3; c++) sum[c] += shirt.data[i * 4 + c]
      n++
    }
  }
  const mean = sum.map((s) => s / n)
  check(mean.every((v, c) => near(v, expected[c], 1.5)), `recolor ${hex} mean ${mean.map((v) => v.toFixed(1)).join(',')} vs ${expected.join(',')}`)
}

// 2. Placement uses the gang sheet sizes.
const full = place.spotRect({ garmentId: 'gildan-5000', spotId: 'full-front', sizeLabel: 'Medium · 10.5 × 12 in', artWidthPx: 1000, artHeightPx: 1000 })
check(near(full.widthIn, 10.5, 1e-6) && near(full.heightIn, 10.5, 1e-6), `square art on Adult Medium = 10.5 × 10.5 in (got ${full.widthIn} × ${full.heightIn})`)
check(near(full.y, 184 + 3 * 21.909, 0.01), 'full front sits 3 in below the collar')
const tall = place.spotRect({ garmentId: 'gildan-5000', spotId: 'full-front', sizeLabel: 'Medium · 10.5 × 12 in', artWidthPx: 500, artHeightPx: 1000 })
check(near(tall.heightIn, 12, 1e-6) && near(tall.widthIn, 6, 1e-6), `tall art is capped by height 12 in (got ${tall.widthIn} × ${tall.heightIn})`)
const lc = place.spotRect({ garmentId: 'gildan-5000', spotId: 'left-chest', sizeLabel: 'Standard Left Chest · 3.75 × 3.75 in', artWidthPx: 800, artHeightPx: 800 })
check(near(lc.widthIn, 3.75, 1e-6) && lc.x + lc.width / 2 > 505, 'left chest is 3.75 in, on the wearer\'s left')

// 3. Mockup tagging round-trips and plain PNGs are not flagged.
const plain = await sharp({ create: { width: 4, height: 4, channels: 4, background: '#ff0000' } }).png().toBuffer()
const tagged = kind.tagPngBytesAsMockup(new Uint8Array(plain))
check(kind.readPngText(tagged)['ssp:kind'] === 'mockup', 'tagged PNG carries ssp:kind=mockup')
check(!!(await sharp(Buffer.from(tagged)).metadata()).width, 'tagged PNG still opens as an image')
check(!(await kind.isMockupFile(new Blob([plain]), 'logo.png')), 'plain PNG is print art')
check(await kind.isMockupFile(new Blob([tagged]), 'logo.png'), 'tagged PNG is a mockup')
check(await kind.isMockupFile(new Blob([plain]), 'SSP-1243_shirt1_front_MOCKUP.png'), '_MOCKUP file name is a mockup')

console.log(failed ? `\n${failed} check(s) failed` : '\nAll mockup checks passed')
process.exit(failed ? 1 : 0)
