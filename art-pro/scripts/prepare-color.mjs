// Puts the CMYK color engine and the GRACoL 2013 profile into public/ before every build.
// The profile is Idealliance's GRACoL2013_CRPC6 (free to use, embed and share, not to be altered),
// fetched from a pinned public copy and checked byte-for-byte against its SHA-256.
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'

const ICC = 'public/icc/GRACoL2013_CRPC6.icc'
const ICC_SHA256 = '4ebbfad6bc9cfc033fdafdd8ac5df8159208932cb16d9a6596d349ae7ab50443'
const ICC_URL = 'https://raw.githubusercontent.com/mozq/dencode/39587a8606d9dbb590ebac4bd3ee35d1de29d4ee/src/main/resources/color_profiles/GRACoL2013_CRPC6.icc'

const sha = (b) => createHash('sha256').update(b).digest('hex')

await mkdir('public/icc', { recursive: true })
await copyFile('node_modules/lcms-wasm/dist/lcms.wasm', 'public/lcms.wasm')
await copyFile('node_modules/lcms-wasm/dist/lcms.js', 'public/lcms.mjs')

let have = null
try { have = await readFile(ICC) } catch {}
if (!have || sha(have) !== ICC_SHA256) {
  const r = await fetch(ICC_URL)
  if (!r.ok) throw new Error(`Could not download the GRACoL 2013 profile (${r.status})`)
  const buf = Buffer.from(await r.arrayBuffer())
  if (sha(buf) !== ICC_SHA256) throw new Error('GRACoL 2013 profile did not match its checksum')
  await writeFile(ICC, buf)
}
console.log('Color: GRACoL 2013 profile and CMYK engine ready')
