/**
 * `designmd export --format css-tailwind`（t268）。
 *
 * 解析 DESIGN.md front matter（嵌套 YAML 子集）→ 生成 Tailwind v4 `@theme` 块，
 * 落入全局样式入口 globals.css 的导出区。导出是 token 唯一同步方式：
 * - `designmd export --format css-tailwind`：从 DESIGN.md 生成 CSS token 区并写回 globals.css
 * - `designmd check`：drift check——导出产物与 globals.css 导出区不一致即退出非零（测试门禁）
 *
 * front matter 结构（扁平嵌套 map）：
 *   colors: { name: value }（含 `-dark` 成对值）
 *   typography: { name: { fontFamily/fontSize/fontWeight/... } }
 *   rounded/spacing/shadows/motion/z-index: { name: value }
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(process.cwd());
const DESIGN_MD = resolve(ROOT, "DESIGN.md");
const GLOBALS_CSS = resolve(ROOT, "src/renderer/styles/globals.css");

/** 导出区标记：globals.css 中此区间由脚本生成，禁止手工改写。 */
export const EXPORT_BEGIN = "/* ── designmd-export:begin ── DO NOT EDIT ── */";
export const EXPORT_END = "/* ── designmd-export:end ── DO NOT EDIT ── */";

interface YamlNode {
    [key: string]: string | number | YamlNode;
}

/** 解析 DESIGN.md front matter（`---` 分隔的首块）为嵌套对象。 */
function parse_front_matter(raw: string): YamlNode {
    const match = /^---\n([\s\S]*?)\n---/.exec(raw);
    if (!match) throw new Error("DESIGN.md 缺少 front matter（--- 分隔）");
    const lines = (match[1] ?? "").split("\n");
    const root: YamlNode = {};
    // 栈记录每层缩进对应的对象。
    const stack: { indent: number; obj: YamlNode }[] = [{ indent: -1, obj: root }];
    for (const line of lines) {
        if (!line.trim() || line.trim().startsWith("#")) continue;
        const indentMatch = /^\s*/.exec(line);
        const indent = indentMatch?.[0].length ?? 0;
        const content = line.trim();
        // 顶层 key:（如 version/name/colors）或嵌套 key: value
        const keyMatch = /^([A-Za-z0-9_-]+):(?:\s*(.*))?$/.exec(content);
        if (!keyMatch) continue;
        const key = keyMatch[1] ?? "";
        const value = (keyMatch[2] ?? "").trim();
        // 弹出缩进大于等于当前的分层。
        while (stack.length > 1) {
            const top = stack[stack.length - 1];
            if (!top || top.indent < indent) break;
            stack.pop();
        }
        const parent = stack[stack.length - 1]?.obj;
        if (!parent) continue;
        if (value === "") {
            const child: YamlNode = {};
            parent[key] = child;
            stack.push({ indent, obj: child });
        } else {
            parent[key] = parse_scalar(value);
        }
    }
    return root;
}

/** 解析标量：引号字符串 / 数字 / 裸字符串。 */
function parse_scalar(value: string): string | number {
    const trimmed = value.trim();
    if (
        (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
        return trimmed.slice(1, -1);
    }
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
        return Number(trimmed);
    }
    return trimmed;
}

/** 把 token 值写成 CSS 值（颜色/尺寸/时长/字重原样；letterSpacing 等带单位原样）。 */
function css_value(v: string | number): string {
    return String(v);
}

/** 递归生成 `--token-name: value` 行（扁平 key 拼接）。 */
function flatten_tokens(
    prefix: string,
    node: YamlNode,
    out: { name: string; value: string | number }[],
): void {
    for (const [k, v] of Object.entries(node)) {
        if (typeof v === "object") {
            flatten_tokens(prefix ? `${prefix}-${k}` : k, v, out);
        } else {
            out.push({ name: prefix ? `${prefix}-${k}` : k, value: v });
        }
    }
}

/** 从 DESIGN.md 生成 CSS @theme 块。 */
export function generate_css_tokens(designPath = DESIGN_MD): string {
    const raw = readFileSync(designPath, "utf8");
    const fm = parse_front_matter(raw);

    const tokens: { name: string; value: string | number }[] = [];
    // colors → --color-*（Tailwind v4 颜色 token 命名空间）
    if (fm["colors"] && typeof fm["colors"] === "object") {
        flatten_tokens("color", fm["colors"], tokens);
    }
    // typography → --text-*（fontSize）与 --font-*（fontFamily）。fontWeight/lineHeight/
    // letterSpacing 等子属性当前不导出（消费方可读 DESIGN.md 原文或后续扩展）。
    if (fm["typography"] && typeof fm["typography"] === "object") {
        for (const [name, spec] of Object.entries(fm["typography"])) {
            if (typeof spec !== "object") continue;
            const entries = spec;
            const fontSize = entries["fontSize"];
            if (typeof fontSize === "string" || typeof fontSize === "number") {
                tokens.push({ name: `text-${name}`, value: css_value(fontSize) });
            }
            const family = entries["fontFamily"];
            if (typeof family === "string" || typeof family === "number") {
                tokens.push({ name: `font-${name}`, value: css_value(family) });
            }
        }
    }
    // rounded → --radius-*
    if (fm["rounded"] && typeof fm["rounded"] === "object") {
        flatten_tokens("radius", fm["rounded"], tokens);
    }
    // spacing → --spacing-*
    if (fm["spacing"] && typeof fm["spacing"] === "object") {
        flatten_tokens("spacing", fm["spacing"], tokens);
    }
    // shadows → --shadow-*
    if (fm["shadows"] && typeof fm["shadows"] === "object") {
        flatten_tokens("shadow", fm["shadows"], tokens);
    }
    // motion → --motion-*（duration/easing）
    if (fm["motion"] && typeof fm["motion"] === "object") {
        flatten_tokens("motion", fm["motion"], tokens);
    }
    // z-index → --z-*
    if (fm["z-index"] && typeof fm["z-index"] === "object") {
        flatten_tokens("z", fm["z-index"], tokens);
    }

    const lines = tokens.map((t) => `    --${t.name}: ${css_value(t.value)};`);
    return `${EXPORT_BEGIN}\n@theme {\n${lines.join("\n")}\n}\n${EXPORT_END}`;
}

/** 替换 globals.css 导出区为新生成内容。 */
export function write_css_tokens(css: string, cssPath = GLOBALS_CSS): void {
    const current = existsSync(cssPath) ? readFileSync(cssPath, "utf8") : "";
    const beginIdx = current.indexOf(EXPORT_BEGIN);
    const endIdx = current.indexOf(EXPORT_END);
    if (beginIdx === -1 || endIdx === -1 || endIdx < beginIdx) {
        // 无导出区：插入到文件头部（@import "tailwindcss" 之后）。
        const importIdx = current.indexOf("@import");
        const insertAt = importIdx !== -1 ? current.indexOf("\n", importIdx) + 1 : 0;
        writeFileSync(cssPath, `${current.slice(0, insertAt)}\n${css}\n${current.slice(insertAt)}`);
        return;
    }
    const before = current.slice(0, beginIdx);
    const after = current.slice(endIdx + EXPORT_END.length);
    writeFileSync(cssPath, `${before}${css}\n${after}`);
}

/** drift check：导出产物与 globals.css 导出区一致。 */
export function check_drift(designPath = DESIGN_MD, cssPath = GLOBALS_CSS): boolean {
    const generated = generate_css_tokens(designPath);
    const current = readFileSync(cssPath, "utf8");
    const beginIdx = current.indexOf(EXPORT_BEGIN);
    const endIdx = current.indexOf(EXPORT_END);
    if (beginIdx === -1 || endIdx === -1) return false;
    const existing = current.slice(beginIdx, endIdx + EXPORT_END.length);
    return existing === generated;
}

function main(): void {
    const [cmd, format] = process.argv.slice(2);
    if (cmd === "export" && format === "--format=css-tailwind") {
        write_css_tokens(generate_css_tokens());
        console.log("designmd: CSS tokens written to globals.css");
        return;
    }
    if (cmd === "check") {
        const ok = check_drift();
        if (!ok) {
            console.error(
                "designmd: drift detected — globals.css 导出区与 DESIGN.md 不一致，请运行 export",
            );
            process.exit(1);
        }
        console.log("designmd: drift check passed");
        return;
    }
    console.error("usage: designmd export --format=css-tailwind | designmd check");
    process.exit(1);
}

// 仅直接运行时执行（tsx scripts/designmd.ts）；测试 import 时不触发。
if (import.meta.url === new URL(`file://${String(process.argv[1])}`).href) {
    main();
}
