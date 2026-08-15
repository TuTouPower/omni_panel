import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const CSS_PATH = join(ROOT, "src/renderer/styles/globals.css");
const SCAN_ROOTS = [join(ROOT, "src/renderer"), join(ROOT, "src/web")];
const CODE_EXT = new Set([".ts", ".tsx", ".css"]);

function walk_code_files(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === "assets") continue;
        const full = join(dir, name);
        const st = statSync(full);
        if (st.isDirectory()) {
            walk_code_files(full, out);
            continue;
        }
        const dot = name.lastIndexOf(".");
        if (dot < 0) continue;
        if (CODE_EXT.has(name.slice(dot))) out.push(full);
    }
    return out;
}

function rel(p: string): string {
    return relative(ROOT, p).replaceAll("\\", "/");
}

const code_files = SCAN_ROOTS.flatMap((d) => {
    try {
        return walk_code_files(d);
    } catch {
        return [] as string[];
    }
});

const file_texts = new Map(code_files.map((p) => [p, readFileSync(p, "utf8")]));
const globals = readFileSync(CSS_PATH, "utf8");

/** 允许 backdrop-blur 的路径（菜单 / 对话框遮罩）。 */
const BLUR_ALLOW = new Set([
    "src/renderer/views/TrayMenu.tsx",
    "src/renderer/components/ui/Dialog.tsx",
    "src/renderer/styles/globals.css", // glass-menu @utility
]);

describe("elevation / layering 归位（t415）", () => {
    it("AC-001：组件无 dark:shadow- 变体", () => {
        const hits: string[] = [];
        for (const [path, text] of file_texts) {
            if (path.endsWith("globals.css")) continue;
            if (text.includes("dark:shadow-")) hits.push(rel(path));
        }
        expect(hits, `dark:shadow- 残留: ${hits.join(", ")}`).toEqual([]);
    });

    it("AC-001：暗色主题在变量层翻转 --shadow-window / --shadow-card", () => {
        const dark_block = /\.dark,\s*\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/.exec(globals);
        expect(dark_block, "缺少 .dark 语义翻转块").not.toBeNull();
        const body = dark_block?.[1] ?? "";
        expect(body).toMatch(/--shadow-window:\s*var\(--shadow-window-dark\)/);
        expect(body).toMatch(/--shadow-card:\s*var\(--shadow-card-dark\)/);
    });

    it("AC-002：无五层外的裸数字 z-index（z-10/z-20 等）", () => {
        const bare = /\bz-(?:10|20|30|40|50)\b/;
        const hits: string[] = [];
        for (const [path, text] of file_texts) {
            if (path.endsWith("globals.css")) continue;
            if (bare.test(text)) hits.push(rel(path));
        }
        expect(hits, `裸 z-N 残留: ${hits.join(", ")}`).toEqual([]);
    });

    it("AC-003：无 shadow-[...] 字面量与 Tailwind 内置 shadow-sm/lg", () => {
        const patterns = [/shadow-\[/, /\bshadow-sm\b/, /\bshadow-lg\b/, /\bshadow-md\b/];
        const hits: string[] = [];
        for (const [path, text] of file_texts) {
            if (path.endsWith("globals.css")) continue;
            if (patterns.some((re) => re.test(text))) hits.push(rel(path));
        }
        expect(hits, `非法阴影类残留: ${hits.join(", ")}`).toEqual([]);
    });

    it("AC-003：logo 投影经 @utility logo-drop-shadow，无 drop-shadow-[ 字面量", () => {
        expect(globals).toContain("@utility logo-drop-shadow");
        const hits: string[] = [];
        for (const [path, text] of file_texts) {
            if (path.endsWith("globals.css")) continue;
            if (text.includes("drop-shadow-[")) hits.push(rel(path));
        }
        expect(hits, `drop-shadow-[ 残留: ${hits.join(", ")}`).toEqual([]);
    });

    it("AC-004：SelectionDock 无 backdrop-blur；blur 仅菜单/对话框", () => {
        const dock = [...file_texts.entries()].find(([p]) => p.endsWith("SelectionDock.tsx"));
        expect(dock, "SelectionDock.tsx 须存在").toBeDefined();
        const dock_text = dock?.[1] ?? "";
        expect(dock_text).not.toMatch(/backdrop-blur/);

        const hits: string[] = [];
        for (const [path, text] of file_texts) {
            if (!text.includes("backdrop-blur")) continue;
            const r = rel(path);
            if (BLUR_ALLOW.has(r)) continue;
            hits.push(r);
        }
        expect(hits, `非菜单/对话框 backdrop-blur: ${hits.join(", ")}`).toEqual([]);
    });
});
