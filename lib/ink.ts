import { parseHex, rgbToLab } from "./mockup/recolor";

/** White ink on dark shirts, near-black on light ones (names + numbers). */
export function inkFor(shirtHex: string): string {
  return rgbToLab(...parseHex(shirtHex))[0] < 55 ? "#FFFFFF" : "#14181F";
}
