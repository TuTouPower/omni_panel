import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/renderer/styles/globals.css"), "utf8");

/**
 * t274 清零守卫：globals.css 只保留 token 层（@theme）、基础规则、必要 @keyframes
 * 与 @utility。业务组件级手写类已全部迁到 JSX utility 与 ui 组件，因此顶层 selector
 * 采用白名单守卫：除 @theme/@font-face/@keyframes/@media/@utility/@import/@custom-variant
 * 等 at-rule 块外，允许出现的顶层 selector 只有基础样式清单，出现任何其它业务
 * selector 即残留（= 有组件在隐性依赖手写类）。legacy var 兼容桥（--win-bg /
 * --card-bg / --text / --blue / --primary / --ring 等）已删除，全仓 src 只消费
 * --color- 与 --accent 语义 token。
 */
const ALLOWED_TOP_LEVEL_SELECTORS = new Set([
    ":root",
    ".dark",
    '[data-theme="dark"]',
    "*",
    "html",
    "body",
    'html[data-window="tray"]',
    'html[data-window="tray"] body',
    'html[data-window="tray"] #root',
]);

/** 提取 globals.css 顶层规则头（selector 或 at-rule），跳过块内嵌套内容。 */
function top_level_heads(source: string): string[] {
    const src = source.replace(/\/\*[\s\S]*?\*\//g, "");
    const heads: string[] = [];
    let depth = 0;
    let head = "";
    for (const ch of src) {
        if (ch === "{") {
            if (depth === 0 && head.trim()) heads.push(head.trim());
            head = "";
            depth++;
        } else if (ch === "}") {
            depth = Math.max(0, depth - 1);
            head = "";
        } else if (ch === ";") {
            head = "";
        } else if (depth === 0) {
            head += ch;
        }
    }
    return heads;
}

const TOP_LEVEL_SELECTORS = top_level_heads(css)
    .flatMap((head) => head.split(",").map((s) => s.trim()))
    .filter((s) => s.length > 0 && !s.startsWith("@"));

describe("globals css 清零守卫（t274 收口）", () => {
    it("顶层 selector 只允许基础样式白名单，无业务组件级手写类", () => {
        expect(TOP_LEVEL_SELECTORS.length).toBeGreaterThan(0);
        const unexpected = TOP_LEVEL_SELECTORS.filter(
            (sel) => !ALLOWED_TOP_LEVEL_SELECTORS.has(sel),
        );
        expect(unexpected).toEqual([]);
    });

    it("保留 token 层与语义入口", () => {
        expect(css).toContain("@theme");
        expect(css).toContain("@font-face");
        expect(css).toContain(":root");
        expect(css).toContain(".dark,");
        expect(css).toContain('[data-theme="dark"]');
    });

    it("保留 accent 语义变量与 --color-* 动态入口，不再保留 legacy 兼容桥", () => {
        expect(css).toContain("--accent: var(--accent-blue)");
        expect(css).toContain("--color-accent-ring: var(--accent-ring)");
        expect(css).not.toContain("--blue:");
        expect(css).not.toContain("--primary:");
        expect(css).not.toContain("--ring:");
        expect(css).not.toContain("--win-bg:");
        expect(css).not.toContain("--card-bg:");
        expect(css).not.toContain("--text-3:");
        expect(css).not.toContain("--hairline:");
        expect(css).not.toContain("--bar-track:");
    });

    it("保留 @utility 复合模式", () => {
        for (const util of [
            "glass-menu",
            "shimmer",
            "metric-num",
            "transition-feedback",
            "scrollbar-token",
        ]) {
            expect(css, `@utility ${util}`).toContain(`@utility ${util}`);
        }
    });

    it("保留 keyframes（ctxIn/maDrawer/shimmer-move）", () => {
        expect(css).toContain("@keyframes ctxIn");
        expect(css).toContain("@keyframes maDrawer");
        expect(css).toContain("@keyframes shimmer-move");
    });

    it("不再残留 t161/t2c1c705 历史类", () => {
        expect(css).not.toMatch(/\.fill\.(blue|purple|danger)/);
        expect(css).not.toContain(".bar-pct.danger");
        expect(css).not.toContain(".app-badge");
        expect(css).not.toContain(".aa-badge");
        expect(css).not.toContain(".tray-win-tag");
        expect(css).not.toContain(".off-badge");
        expect(css).not.toContain(".card.disabled");
        expect(css).not.toMatch(/\.card\.stale\s*\{/);
        expect(css).not.toContain(".rel-time");
    });
});
