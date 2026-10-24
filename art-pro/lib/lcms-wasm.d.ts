declare module 'lcms-wasm' {
  export function instantiate(opts?: { locateFile?: (name: string) => string }): Promise<unknown>
  export const TYPE_RGB_8: number
  export const TYPE_CMYK_8: number
  export const INTENT_RELATIVE_COLORIMETRIC: number
  export const cmsFLAGS_BLACKPOINTCOMPENSATION: number
  export const cmsFLAGS_HIGHRESPRECALC: number
}
