import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * t452 层级类正向门禁：裸 `z-*` 层级类在 Tailwind v4 下不生成工具类
 * （构建产物零规则，见 p218 症状C），源码字符串字面量中不得出现；
 * 统一走 `z-[var(--z-*)]` 任意值写法。
 *
 * 扫描范围：src/renderer + src/web 的 .ts/.tsx 字符串字面量
 * （注释与文档不在内；测试固件的演示字符串位于 tests/，不在扫描范围）。
 */

// 裸层级类：z-menu 等。排除任意值写法的前导 `z-`（后跟 `[`）与其内部
// 变量引用 `--z-menu`（`z` 前为 `-`）。
const BARE_LAYER_RE = /(?<!-)z-(sticky|scrim|menu|context|modal)(?![\w\-\[])/;
// t452_gen_f001：含反引号模板字面量；`${...}` 插值按 fail-closed 一并扫描
// （插值内出现裸类同样命中，误报风险由 review 承担，漏报不允许）。
const STRING_RE = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;

function source_files(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const stat = statSync(full);
        if (stat.isDirectory()) {
            out.push(...source_files(full));
        } else if (full.endsWith(".ts") || full.endsWith(".tsx")) {
            out.push(full);
        }
    }
    return out;
}

function bare_layer_hits(content: string): string[] {
    const hits: string[] = [];
    for (const match of content.matchAll(STRING_RE)) {
        const literal = match[1] ?? match[2] ?? match[3] ?? "";
        const found = BARE_LAYER_RE.exec(literal);
        if (found) hits.push(found[0]);
    }
    return hits;
}

describe("z-index 层级类正向门禁（t452）", () => {
    it("AC-004 演示：检测器能识别裸层级类并放行任意值写法", () => {
        // 门禁本身的灵敏度 pin：裸写法必须命中，任意值写法必须放行。
        expect(BARE_LAYER_RE.test("absolute bottom-3.5 z-sticky rounded-full")).toBe(true);
        expect(BARE_LAYER_RE.test("absolute right-0 z-menu mt-2")).toBe(true);
        expect(BARE_LAYER_RE.test("absolute right-0 z-[var(--z-menu)] mt-2")).toBe(false);
        expect(BARE_LAYER_RE.test("fixed inset-0 z-[var(--z-menu)]")).toBe(false);
        expect(BARE_LAYER_RE.test("z-[calc(var(--z-menu)+1)]")).toBe(false);
        // t452_gen_f001：反引号模板同规则（含插值 fail-closed）。
        expect(bare_layer_hits("const a = `absolute z-menu foo`;")).toEqual(["z-menu"]);
        expect(bare_layer_hits("const a = `absolute z-[var(--z-menu)] foo`;")).toEqual([]);
        expect(bare_layer_hits('const a = `a ${cond ? "z-menu" : ""} b`;')).toEqual(["z-menu"]);
    });

    it("AC-001/AC-002：源码字符串中无裸层级类引用", () => {
        const roots = [join(process.cwd(), "src/renderer"), join(process.cwd(), "src/web")];
        const violations: string[] = [];
        for (const root of roots) {
            for (const file of source_files(root)) {
                const hits = bare_layer_hits(readFileSync(file, "utf8"));
                for (const hit of hits) {
                    violations.push(`${file.split("src/")[1] ?? file}: ${hit}`);
                }
            }
        }
        expect(violations).toEqual([]);
    });

    it("AC-001/AC-002：四处位点使用可解析层级且 token 真实定义", () => {
        const root = process.cwd();
        const session_pane = readFileSync(
            join(root, "src/renderer/components/workspace/SessionPane.tsx"),
            "utf8",
        );
        const dock = readFileSync(
            join(root, "src/renderer/components/session-library/SelectionDock.tsx"),
            "utf8",
        );
        const range_picker = readFileSync(
            join(root, "src/renderer/components/token-stats/RangePicker.tsx"),
            "utf8",
        );
        expect(session_pane).toContain("z-[var(--z-sticky)]");
        expect(session_pane).toContain("z-[var(--z-context)]");
        expect(dock).toContain("z-[var(--z-sticky)]");
        expect(range_picker).toContain("z-[var(--z-menu)]");

        const globals_css = readFileSync(join(root, "src/renderer/styles/globals.css"), "utf8");
        for (const name of ["sticky", "menu", "scrim", "context", "modal"]) {
            expect(globals_css).toMatch(new RegExp(`--z-${name}:\\s*\\d+`));
        }
    });
});
