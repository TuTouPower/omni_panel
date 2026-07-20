import { Resvg } from "@resvg/resvg-js";
import png_to_ico from "png-to-ico";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const SVG_PATH = resolve(ROOT, "assets/logo.svg");

// icon.png：1024 主图；icon.ico：Win 多尺寸（256 主，其余按 Win 规范）
const PNG_SIZE = 1024;
const ICO_SIZES = [256, 128, 64, 48, 32, 16];

const SVG = readFileSync(SVG_PATH, "utf8");

function render_png(size) {
    const resvg = new Resvg(SVG, {
        fitTo: { mode: "width", value: size },
        background: "rgba(0,0,0,0)",
    });
    return Buffer.from(resvg.render().asPng());
}

// 1. 主 PNG（1024，mac/linux icon）
const png = render_png(PNG_SIZE);
const OUT_PNG = resolve(ROOT, "assets/icon.png");
writeFileSync(OUT_PNG, png);
console.log(`[render_icon] wrote ${OUT_PNG} (${PNG_SIZE}x${PNG_SIZE})`);

// 2. ICO（多尺寸，Win exe 图标）
const ico_pngs = ICO_SIZES.map(render_png);
const ico = Buffer.from(await png_to_ico(ico_pngs));
const OUT_ICO = resolve(ROOT, "assets/icon.ico");
writeFileSync(OUT_ICO, ico);
console.log(`[render_icon] wrote ${OUT_ICO} (sizes: ${ICO_SIZES.join(",")})`);
