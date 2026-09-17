import { Resvg } from "@resvg/resvg-js";
import png_to_ico from "png-to-ico";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const SVG_PATH = resolve(ROOT, "assets/logo.svg");

const PNG_SIZE = 1024;
const ICO_SIZES = [256, 128, 64, 48, 32, 16];

const SVG = readFileSync(SVG_PATH, "utf8");

// Scale logo body from 780px to 1000px centered in 1024x1024 (macOS Dock squircle / full canvas standard: 1000/1024 ≈ 97.6%)
function get_dock_svg(raw_svg) {
    return raw_svg.replace(
        /(<defs>[\s\S]*?<\/defs>)([\s\S]*)(<\/svg>)/,
        `$1<g transform="translate(512, 512) scale(${1000 / 780}) translate(-512, -512)">$2</g>$3`,
    );
}

// Convert SVG to pure monochrome black (#000000) for macOS template images, scaled to fill 34px in 36x36 canvas (18pt status bar)
function get_tray_template_svg(raw_svg) {
    let s = raw_svg;
    s = s.replace(/fill="url\(#logo_grad\)"/g, `fill="#000000"`);
    s = s.replace(/fill="url\(#bar_grad\)"/g, `fill="#000000"`);
    s = s.replace(/fill="#00F0FF"/g, `fill="#000000"`);
    s = s.replace(/fill="#FFEB3B"/g, `fill="#000000"`);
    s = s.replace(
        /(<defs>[\s\S]*?<\/defs>)([\s\S]*)(<\/svg>)/,
        `$1<g transform="translate(512, 512) scale(${(1024 * 34) / 36 / 780}) translate(-512, -512)">$2</g>$3`,
    );
    return s;
}

function render_png(svg_content, size) {
    const resvg = new Resvg(svg_content, {
        fitTo: { mode: "width", value: size },
        background: "rgba(0,0,0,0)",
    });
    return Buffer.from(resvg.render().asPng());
}

// 1. macOS / Linux Dock/App icon (1024x1024 with 1000x1000 body)
const dock_svg = get_dock_svg(SVG);
const png = render_png(dock_svg, PNG_SIZE);
const OUT_PNG = resolve(ROOT, "assets/icon.png");
writeFileSync(OUT_PNG, png);
console.log(`[render_icon] wrote ${OUT_PNG} (${PNG_SIZE}x${PNG_SIZE})`);

// 2. Windows ICO (multi-size)
const ico_pngs = ICO_SIZES.map((s) => render_png(dock_svg, s));
const ico = Buffer.from(await png_to_ico(ico_pngs));
const OUT_ICO = resolve(ROOT, "assets/icon.ico");
writeFileSync(OUT_ICO, ico);
console.log(`[render_icon] wrote ${OUT_ICO} (sizes: ${ICO_SIZES.join(",")})`);

// 3. macOS Tray Template Icons (18x18 @1x, 36x36 @2x, pure black + alpha, 18pt status bar standard)
const template_svg = get_tray_template_svg(SVG);
const tray_1x = render_png(template_svg, 18);
const OUT_TRAY_1X = resolve(ROOT, "assets/tray-iconTemplate.png");
writeFileSync(OUT_TRAY_1X, tray_1x);
console.log(`[render_icon] wrote ${OUT_TRAY_1X} (18x18)`);

const tray_2x = render_png(template_svg, 36);
const OUT_TRAY_2X = resolve(ROOT, "assets/tray-iconTemplate@2x.png");
writeFileSync(OUT_TRAY_2X, tray_2x);
console.log(`[render_icon] wrote ${OUT_TRAY_2X} (36x36)`);

// 4. Non-macOS colored tray icon (36x36)
const OUT_TRAY = resolve(ROOT, "assets/tray-icon.png");
const tray_color = render_png(dock_svg, 36);
writeFileSync(OUT_TRAY, tray_color);
console.log(`[render_icon] wrote ${OUT_TRAY} (36x36)`);
