import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const SVG_PATH = resolve(ROOT, "assets/logo.svg");

const SIZE = 1024;

const svg = readFileSync(SVG_PATH, "utf8");
const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: SIZE },
    background: "rgba(0,0,0,0)",
});
const png = resvg.render().asPng();

const OUT_PNG = resolve(ROOT, "assets/icon.png");
writeFileSync(OUT_PNG, png);
console.log(`[render_icon] wrote ${OUT_PNG} (${SIZE}x${SIZE})`);
