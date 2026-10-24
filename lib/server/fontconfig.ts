// Points the server's SVG renderer (sharp → librsvg → fontconfig) at the fonts
// bundled in lib/server/fonts, so customer SVG text renders on Vercel, which has
// no system fonts. Must be imported before sharp draws anything.
import { join } from "node:path";

if (!process.env.FONTCONFIG_FILE) process.env.FONTCONFIG_FILE = join(process.cwd(), "lib/server/fonts/fonts.conf");
