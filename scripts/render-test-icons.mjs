import { Resvg } from "@resvg/resvg-js";
import png_to_ico from "png-to-ico";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const SVG_PATH = resolve(ROOT, "assets/logo-test.svg");

const PNG_SIZE = 1024;
const TRAY_SIZE = 64;
const ICO_SIZES = [256, 128, 64, 48, 32, 16];

const SVG = readFileSync(SVG_PATH, "utf8");

function render_png(size) {
    const resvg = new Resvg(SVG, {
        fitTo: { mode: "width", value: size },
        background: "rgba(0,0,0,0)",
    });
    return Buffer.from(resvg.render().asPng());
}

const png = render_png(PNG_SIZE);
const OUT_PNG = resolve(ROOT, "assets/icon-test.png");
writeFileSync(OUT_PNG, png);
console.log(`[render-test-icons] wrote ${OUT_PNG} (${PNG_SIZE}x${PNG_SIZE})`);

const tray_png = render_png(TRAY_SIZE);
const OUT_TRAY = resolve(ROOT, "assets/tray-icon-test.png");
writeFileSync(OUT_TRAY, tray_png);
console.log(`[render-test-icons] wrote ${OUT_TRAY} (${TRAY_SIZE}x${TRAY_SIZE})`);

const ico_pngs = ICO_SIZES.map(render_png);
const ico = Buffer.from(await png_to_ico(ico_pngs));
const OUT_ICO = resolve(ROOT, "assets/icon-test.ico");
writeFileSync(OUT_ICO, ico);
console.log(`[render-test-icons] wrote ${OUT_ICO} (sizes: ${ICO_SIZES.join(",")})`);
