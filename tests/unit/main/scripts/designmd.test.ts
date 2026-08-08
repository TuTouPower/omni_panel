import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generate_css_tokens, write_css_tokens, check_drift } from "../../../../scripts/designmd";

let tmp: string | undefined;

afterEach(() => {
    if (tmp) {
        rmSync(tmp, { recursive: true, force: true });
        tmp = undefined;
    }
});

function makeDir(): string {
    tmp ??= mkdtempSync(join(tmpdir(), "designmd-"));
    return tmp;
}

const SAMPLE_DESIGN = `---
version: alpha
name: OmniPanel
colors:
    primary: "#3d7afd"
    primary-dark: "#5b8dff"
    surface: "#e7eaf1"
    surface-dark: "#0c0e13"
    accent-blue: "#3d7afd"
typography:
    body-md:
        fontFamily: '"Inter Variable", system-ui, sans-serif'
        fontSize: 13.5px
        fontWeight: 450
        lineHeight: 1.5
rounded:
    md: 10px
    lg: 14px
spacing:
    card-padding: 16px
shadows:
    card: "0 1px 2px rgba(22, 33, 66, 0.04)"
motion:
    feedback: 120ms
    easing: "cubic-bezier(0.2, 0, 0, 1)"
z-index:
    modal: 120
---

# body
`;

describe("designmd export（t268）", () => {
    it("generate_css_tokens 从 DESIGN.md front matter 生成 @theme 块", () => {
        const dir = makeDir();
        const design = join(dir, "DESIGN.md");
        writeFileSync(design, SAMPLE_DESIGN);
        const css = generate_css_tokens(design);
        expect(css).toContain("@theme {");
        expect(css).toContain("--color-primary: #3d7afd;");
        expect(css).toContain("--color-primary-dark: #5b8dff;");
        expect(css).toContain("--text-body-md: 13.5px;");
        expect(css).toContain('--font-body-md: "Inter Variable", system-ui, sans-serif;');
        expect(css).toContain("--radius-md: 10px;");
        expect(css).toContain("--spacing-card-padding: 16px;");
        expect(css).toContain("--shadow-card: 0 1px 2px rgba(22, 33, 66, 0.04);");
        expect(css).toContain("--motion-feedback: 120ms;");
        expect(css).toContain("--z-modal: 120;");
    });

    it("write_css_tokens 写入导出区（无导出区时插入头部）", () => {
        const dir = makeDir();
        const design = join(dir, "DESIGN.md");
        const css = join(dir, "globals.css");
        writeFileSync(design, SAMPLE_DESIGN);
        writeFileSync(css, '@import "tailwindcss";\n\n:root {}\n');
        const generated = generate_css_tokens(design);
        write_css_tokens(generated, css);
        const result = readFileSync(css, "utf8");
        expect(result).toContain("designmd-export:begin");
        expect(result).toContain("--color-primary: #3d7afd;");
        // @import 在前，导出区在后
        expect(result.indexOf("@import")).toBeLessThan(result.indexOf("designmd-export"));
    });

    it("write_css_tokens 替换既有导出区", () => {
        const dir = makeDir();
        const design = join(dir, "DESIGN.md");
        const css = join(dir, "globals.css");
        writeFileSync(design, SAMPLE_DESIGN);
        const generated = generate_css_tokens(design);
        // 先写一次
        write_css_tokens(generated, css);
        // 改 DESIGN.md 后重新导出
        writeFileSync(design, SAMPLE_DESIGN.replace('primary: "#3d7afd"', 'primary: "#112233"'));
        const regenerated = generate_css_tokens(design);
        write_css_tokens(regenerated, css);
        const result = readFileSync(css, "utf8");
        expect(result).toContain("--color-primary: #112233;");
        // accent-blue 未被替换（primary 独立 token）
        expect(result).toContain("--color-accent-blue: #3d7afd;");
        // 导出区唯一
        expect(result.split("designmd-export:begin").length - 1).toBe(1);
    });

    it("check_drift 检测导出区与 DESIGN.md 不一致", () => {
        const dir = makeDir();
        const design = join(dir, "DESIGN.md");
        const css = join(dir, "globals.css");
        writeFileSync(design, SAMPLE_DESIGN);
        const generated = generate_css_tokens(design);
        write_css_tokens(generated, css);
        expect(check_drift(design, css)).toBe(true);
        // 手工改动导出区 → drift
        writeFileSync(css, readFileSync(css, "utf8").replace("#3d7afd", "#999999"));
        expect(check_drift(design, css)).toBe(false);
    });

    it("缺失 front matter 抛错", () => {
        const dir = makeDir();
        const design = join(dir, "DESIGN.md");
        writeFileSync(design, "# no front matter\n");
        expect(() => generate_css_tokens(design)).toThrow(/front matter/);
    });

    it("真实 globals.css 导出区与 DESIGN.md 一致（AC5 drift 门禁）", () => {
        // 默认路径 = 真实 DESIGN.md + src/renderer/styles/globals.css。
        // 手工改动导出区后此测试失败，作为自动 drift 门禁。
        expect(check_drift()).toBe(true);
    });
});
