import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 构建产物代码分割断言（t249 AC1 / AC2）。
 * 前置：产物由 `pnpm build` 生成（out/web、out/renderer）；本测试只读产物，
 * 不在测试内执行构建（会触发 better-sqlite3 ABI 切换，污染并行 worker）。
 * 产物缺失时（CI `pnpm test` 全新 checkout、未来 task 全新 worktree）整组跳过，
 * 避免 ENOENT 让 `pnpm test` 门禁失去自含性；跳过时注明需先 `pnpm build`。
 */

const REPO_ROOT = resolve(__dirname, "../..");

const WEB_HTML = resolve(REPO_ROOT, "out/web/index.html");
const RENDERER_HTML = resolve(REPO_ROOT, "out/renderer/index.html");

const has_build_output = existsSync(WEB_HTML) && existsSync(RENDERER_HTML);

const ECHARTS_RUNTIME_MARK = "echarts_instance_";
const SESSION_SHELL_MARK = "session-shell";

function read_entry_chunk(build_dir: "out/web" | "out/renderer"): string {
    const html_path = resolve(REPO_ROOT, build_dir, "index.html");
    const html = readFileSync(html_path, "utf8");
    const match = /<script type="module"[^>]*src="\.\/([^"]+\.js)"/.exec(html);
    if (!match?.[1]) throw new Error(`${build_dir}/index.html 未找到入口 module script`);
    return readFileSync(resolve(REPO_ROOT, build_dir, match[1]), "utf8");
}

function list_asset_chunks(build_dir: "out/web" | "out/renderer"): string[] {
    const dir = resolve(REPO_ROOT, build_dir, "assets");
    return readdirSync(dir).filter((f) => f.endsWith(".js"));
}

function chunk_containing(build_dir: "out/web" | "out/renderer", mark: string): string | undefined {
    for (const name of list_asset_chunks(build_dir)) {
        const content = readFileSync(resolve(REPO_ROOT, build_dir, "assets", name), "utf8");
        if (content.includes(mark)) return name;
    }
    return undefined;
}

describe.skipIf(!has_build_output)("t249 构建产物代码分割", () => {
    it("产物存在（前置：pnpm build）", () => {
        expect(readFileSync(resolve(REPO_ROOT, "out/web/index.html"), "utf8")).toBeTruthy();
        expect(readFileSync(resolve(REPO_ROOT, "out/renderer/index.html"), "utf8")).toBeTruthy();
    });

    for (const build_dir of ["out/web", "out/renderer"] as const) {
        describe(build_dir, () => {
            it("入口 chunk 不含 echarts 运行时与 SessionShell 代码", () => {
                const entry = read_entry_chunk(build_dir);
                expect(entry).not.toContain(ECHARTS_RUNTIME_MARK);
                expect(entry).not.toContain(SESSION_SHELL_MARK);
            });

            it("echarts 运行时代码位于独立非入口 chunk", () => {
                const chunk = chunk_containing(build_dir, ECHARTS_RUNTIME_MARK);
                expect(chunk).toBeTruthy();
                expect(chunk).not.toMatch(/^index-/);
            });

            it("SessionShell 子树位于独立非入口 chunk", () => {
                const chunk = chunk_containing(build_dir, SESSION_SHELL_MARK);
                expect(chunk).toBeTruthy();
                expect(chunk).not.toMatch(/^index-/);
            });
        });
    }
});
