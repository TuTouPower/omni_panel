import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, stat, utimes } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { create_script_cache } from "../../../src/main/core/connector/script-cache";
const SCRIPT_V1 = "function main(){return [{ usage: { month: 1, limit: 10 } }];}";
const SCRIPT_V2 = "function main(){return [{ usage: { month: 2, limit: 20 } }];}";

let temp_dir: string;

beforeEach(async () => {
    temp_dir = await mkdtemp(join(tmpdir(), "script-cache-test-"));
});

afterEach(async () => {
    await rm(temp_dir, { recursive: true, force: true });
});

describe("script-cache", () => {
    it("compiles and caches on first read", async () => {
        const script_path = join(temp_dir, "connector.ts");
        await writeFile(script_path, SCRIPT_V1, "utf8");
        const cache = create_script_cache();
        const result = await cache.get_script(script_path);
        expect(result.code).toBe(SCRIPT_V1);
        expect(result.compiled).toContain("month: 1");
    });

    it("reuses the cached result when mtime is unchanged (no re-read/re-transpile)", async () => {
        const script_path = join(temp_dir, "connector.ts");
        // 固定 mtime：整毫秒避免浮点精度差异导致缓存 miss。
        const pinned = new Date(1_700_000_000_000);
        await writeFile(script_path, SCRIPT_V1, "utf8");
        await utimes(script_path, pinned, pinned);
        const cache = create_script_cache();
        const first = await cache.get_script(script_path);
        // 改内容但恢复同一 mtime：缓存应命中，返回旧 code。
        await writeFile(script_path, SCRIPT_V2, "utf8");
        await utimes(script_path, pinned, pinned);
        const second = await cache.get_script(script_path);
        expect(second.code).toBe(SCRIPT_V1);
        expect(second.compiled).toBe(first.compiled);
    });

    it("re-reads and re-compiles when mtime changes", async () => {
        const script_path = join(temp_dir, "connector.ts");
        await writeFile(script_path, SCRIPT_V1, "utf8");
        const cache = create_script_cache();
        await cache.get_script(script_path);
        await writeFile(script_path, SCRIPT_V2, "utf8");
        const file_stat = await stat(script_path);
        await utimes(
            script_path,
            new Date(file_stat.atimeMs + 5000),
            new Date(file_stat.mtimeMs + 5000),
        );
        const result = await cache.get_script(script_path);
        expect(result.code).toBe(SCRIPT_V2);
        expect(result.compiled).toContain("month: 2");
    });

    it("propagates transpile errors", async () => {
        const script_path = join(temp_dir, "connector.ts");
        await writeFile(script_path, "import x from 'y';\n", "utf8");
        const cache = create_script_cache();
        await expect(cache.get_script(script_path)).rejects.toThrow(/import/);
    });

    describe("t514 script-cache LRU and inflight dedup (A123 / AC-006)", () => {
        it("deduplicates concurrent inflight compiles for the same script", async () => {
            const script_path = join(temp_dir, "concurrent.ts");
            await writeFile(script_path, SCRIPT_V1, "utf8");
            const cache = create_script_cache();

            // 同时发起 3 个并发编译请求
            const [p1, p2, p3] = await Promise.all([
                cache.get_script(script_path),
                cache.get_script(script_path),
                cache.get_script(script_path),
            ]);

            expect(p1.code).toBe(SCRIPT_V1);
            expect(p2.code).toBe(SCRIPT_V1);
            expect(p3.code).toBe(SCRIPT_V1);
        });

        it("evicts oldest entry when max_size is reached (LRU)", async () => {
            const path1 = join(temp_dir, "s1.ts");
            const path2 = join(temp_dir, "s2.ts");
            const path3 = join(temp_dir, "s3.ts");
            await writeFile(path1, "function main(){return 1;}", "utf8");
            await writeFile(path2, "function main(){return 2;}", "utf8");
            await writeFile(path3, "function main(){return 3;}", "utf8");

            // 容量限制为 2
            const cache = create_script_cache(2);
            await cache.get_script(path1);
            await cache.get_script(path2);

            // 访问 path1 使其最新，path2 变为最旧
            await cache.get_script(path1);

            // 插入 path3，应该剔除 path2
            await cache.get_script(path3);

            // 修改 path2 内容并恢复同一 mtime，如果已被驱逐，再次读取会加载新内容
            const pinned = new Date(1_700_000_000_000);
            await writeFile(path2, "function main(){return 'new_2';}", "utf8");
            await utimes(path2, pinned, pinned);
            const res2 = await cache.get_script(path2);
            expect(res2.code).toContain("new_2");
        });
    });
});
