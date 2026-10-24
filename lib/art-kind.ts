/**
 * Tell print art and mockup pictures apart, so a mockup can never land on a gang sheet.
 *
 * A Mockup Pro mockup has BOTH:
 *   1. a file name containing "_MOCKUP"
 *   2. a PNG tEXt chunk:  keyword "ssp:kind", value "mockup"
 * Either one is enough to refuse the file as print art.
 */

export type ArtKind = 'print-art' | 'mockup'

const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10]
const KEYWORD = 'ssp:kind'

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function isPng(b: Uint8Array) {
  return b.length > 8 && PNG_SIG.every((v, i) => b[i] === v)
}

/** Read all tEXt chunks (keyword → value) from PNG bytes. Stops at the image data. */
export function readPngText(bytes: Uint8Array): Record<string, string> {
  const out: Record<string, string> = {}
  if (!isPng(bytes)) return out
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let p = 8
  const dec = new TextDecoder('latin1')
  while (p + 8 <= bytes.length) {
    const len = view.getUint32(p)
    const type = dec.decode(bytes.subarray(p + 4, p + 8))
    if (type === 'IDAT' || type === 'IEND') break
    if (type === 'tEXt') {
      const body = bytes.subarray(p + 8, p + 8 + len)
      const zero = body.indexOf(0)
      if (zero > 0) out[dec.decode(body.subarray(0, zero))] = dec.decode(body.subarray(zero + 1))
    }
    p += 12 + len
  }
  return out
}

/** Insert tEXt ssp:kind=mockup right after the IHDR chunk. */
export function tagPngBytesAsMockup(bytes: Uint8Array): Uint8Array {
  if (!isPng(bytes)) throw new Error('Mockups must be saved as PNG.')
  if (readPngText(bytes)[KEYWORD] === 'mockup') return bytes
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const ihdrEnd = 8 + 12 + view.getUint32(8)
  const enc = new TextEncoder()
  const data = new Uint8Array([...enc.encode(KEYWORD), 0, ...enc.encode('mockup')])
  const chunk = new Uint8Array(12 + data.length)
  const cv = new DataView(chunk.buffer)
  cv.setUint32(0, data.length)
  chunk.set(enc.encode('tEXt'), 4)
  chunk.set(data, 8)
  cv.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)))
  const out = new Uint8Array(bytes.length + chunk.length)
  out.set(bytes.subarray(0, ihdrEnd), 0)
  out.set(chunk, ihdrEnd)
  out.set(bytes.subarray(ihdrEnd), ihdrEnd + chunk.length)
  return out
}

export async function tagPngAsMockup(png: Blob): Promise<Blob> {
  const bytes = new Uint8Array(await png.arrayBuffer())
  // Plain ArrayBuffer-backed bytes; the cast satisfies TypeScript 5.9's Blob types.
  return new Blob([tagPngBytesAsMockup(bytes) as Uint8Array<ArrayBuffer>], { type: 'image/png' })
}

/** True when a file is a mockup, by name or by its PNG text chunk. Reads only the start of the file. */
export async function isMockupFile(file: Blob, fileName?: string): Promise<boolean> {
  const name = fileName ?? (file as File).name ?? ''
  if (/_mockup/i.test(name)) return true
  const head = new Uint8Array(await file.slice(0, 64 * 1024).arrayBuffer())
  return readPngText(head)[KEYWORD] === 'mockup'
}

export function mockupFileName(orderNumber: string, shirt: number, view: string) {
  return `${orderNumber}_shirt${shirt}_${view}_MOCKUP.png`
}

export const MOCKUP_REFUSED_MESSAGE =
  "This is a mockup picture, not print art. It shows the design on a shirt, so it can't be printed. Upload the original artwork file instead."
