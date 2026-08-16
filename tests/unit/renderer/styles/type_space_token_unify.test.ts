import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
    RADIUS_SCALE_PX,
    TEXT_SCALE_PX,
} from "../../../../src/renderer/lib/echarts_token_resolver";

const ROOT = process.cwd();
const SCAN_DIRS = [join(ROOT, "src/renderer"), join(ROOT, "src/web")];
const EXTS = new Set([".tsx", ".ts", ".css"]);

/** 组件/语义 spacing 豁免像素（DESIGN.md Layout + Components）。 */
const EXEMPT_SPACING_PX = new Set([9, 10, 12, 14, 16, 18, 24, 40]);

function walk(dir: string, out: string[] = []): string[] {
    if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return out;
    for (const name of readdirSync(dir)) {
        if (name === "vendor_logos" || name === "node_modules") continue;
        const p = join(dir, name);
        const st = statSync(p);
        if (st.isDirectory()) walk(p, out);
        else if (EXTS.has(p.slice(p.lastIndexOf(".")))) out.push(p);
    }
    return out;
}

function rel(p: string): string {
    return relative(ROOT, p).replaceAll("\\", "/");
}

describe("t424 type/space/radius token unify audit", () => {
    const files = SCAN_DIRS.flatMap((d) => walk(d));

    it("AC-001: 无九级外字号 text-[Npx] 与未映射 Tailwind 字号档", () => {
        const arb = /text-\[(\d+(?:\.\d+)?)px\]/g;
        const tw = /(?<![\w-])text-(xs|sm|base|lg|xl|2xl|3xl)(?![\w-])/g;
        const hits: string[] = [];
        for (const f of files) {
            const text = readFileSync(f, "utf8");
            for (const m of text.matchAll(arb)) {
                hits.push(`${rel(f)}: ${m[0]}`);
            }
            for (const m of text.matchAll(tw)) {
                hits.push(`${rel(f)}: ${m[0]}`);
            }
        }
        expect(hits, hits.join("\n")).toEqual([]);
    });

    it("AC-002: 无 font-medium / font-normal 档外字重", () => {
        const re = /(?<![\w-])font-(medium|normal)(?![\w-])/g;
        const hits: string[] = [];
        for (const f of files) {
            const text = readFileSync(f, "utf8");
            for (const m of text.matchAll(re)) {
                hits.push(`${rel(f)}: ${m[0]}`);
            }
        }
        expect(hits, hits.join("\n")).toEqual([]);
    });

    it("AC-003: canvas/SVG fontSize 数字字面量清零，取值追溯 TEXT_SCALE_PX", () => {
        // 禁止 fontSize: 12 / fontSize={9.5} / fontSize: "13px" 等裸数字
        const re = /fontSize\s*[:=]\s*(?:\{\s*)?["']?\d/;
        const hits: string[] = [];
        for (const f of files) {
            const text = readFileSync(f, "utf8");
            for (const [i, line] of text.split("\n").entries()) {
                if (re.test(line)) hits.push(`${rel(f)}:${String(i + 1)}: ${line.trim()}`);
            }
        }
        expect(hits, hits.join("\n")).toEqual([]);
        // 共享常量与九级 token 一致
        expect(TEXT_SCALE_PX["label-caps"]).toBe(10.5);
        expect(TEXT_SCALE_PX["body-md"]).toBe(13.5);
        expect(TEXT_SCALE_PX["display-num"]).toBe(30);
        expect(RADIUS_SCALE_PX.xs).toBe(6);
    });

    it("AC-005: 布局 p/gap/m 非 4px 倍数且非豁免值清零", () => {
        const half = /(?<![\w-])([mp][xytblrse]?|gap(?:-[xy])?)-(\d+\.\d+)(?![\w-])/g;
        const arb = /(?<![\w-])([mp][xytblrse]?|gap(?:-[xy])?)-\[(\d+(?:\.\d+)?)px\]/g;
        const hits: string[] = [];
        for (const f of files) {
            const text = readFileSync(f, "utf8");
            for (const m of text.matchAll(half)) {
                const px = Number(m[2]) * 4;
                if (!EXEMPT_SPACING_PX.has(px) && px % 4 !== 0) {
                    hits.push(`${rel(f)}: ${m[0]} (${String(px)}px)`);
                }
            }
            for (const m of text.matchAll(arb)) {
                const px = Number(m[2]);
                if (!EXEMPT_SPACING_PX.has(px) && px % 4 !== 0) {
                    hits.push(`${rel(f)}: ${m[0]}`);
                }
            }
        }
        expect(hits, hits.join("\n")).toEqual([]);
    });

    it("AC-006: rounded-[Npx] arbitrary 清零", () => {
        const re = /rounded(?:-[trblsexy]+)?-\[(\d+(?:\.\d+)?)px\]/g;
        const hits: string[] = [];
        for (const f of files) {
            const text = readFileSync(f, "utf8");
            for (const m of text.matchAll(re)) {
                hits.push(`${rel(f)}: ${m[0]}`);
            }
        }
        expect(hits, hits.join("\n")).toEqual([]);
    });

    it("chart 配置使用 TEXT_SCALE_PX / RADIUS_SCALE_PX（无散落 fontSize 数字）", () => {
        const chart_files = [
            "src/renderer/components/token-stats/Heatmap.tsx",
            "src/renderer/components/token-stats/MetricDonut.tsx",
            "src/renderer/components/token-stats/BarChart.tsx",
            "src/renderer/components/TrendSparkline.tsx",
        ];
        for (const rel_path of chart_files) {
            const text = readFileSync(join(ROOT, rel_path), "utf8");
            expect(text, rel_path).toMatch(/TEXT_SCALE_PX/);
            expect(text, rel_path).not.toMatch(/fontSize\s*[:=]\s*(?:\{\s*)?["']?\d/);
        }
        const heat = readFileSync(join(ROOT, "src/renderer/components/token-stats/Heatmap.tsx"), "utf8");
        expect(heat).toMatch(/RADIUS_SCALE_PX/);
        expect(heat).not.toMatch(/borderRadius:\s*\d+/);
    });
});
