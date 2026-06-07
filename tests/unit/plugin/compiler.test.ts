import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const mockBuild = vi.fn();

vi.mock("esbuild", () => ({ build: mockBuild }));

// Must import after vi.mock
import { compilePlugin } from "../../../src/main/core/plugin/compiler";
import type { PluginDefinition } from "../../../src/main/core/plugin/types";

const testDir = join(tmpdir(), `compiler-test-${String(Date.now())}`);
const sdkDir = join(testDir, "sdk");

beforeEach(async () => {
    mockBuild.mockReset();
    await mkdir(testDir, { recursive: true });
    await mkdir(sdkDir, { recursive: true });
    await writeFile(join(sdkDir, "index.ts"), "export function definePlugin() {}", "utf8");
});

afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
});

function makePlugin(filename: string): PluginDefinition {
    const srcPath = join(testDir, filename);
    return { scriptName: filename, executablePath: srcPath, metadata: null, source: "bundled" };
}

describe("compilePlugin", () => {
    it("compiles valid TS and returns status compiled", async () => {
        const plugin = makePlugin("test.ts");
        await writeFile(plugin.executablePath, `console.log("hello");`, "utf8");
        mockBuild.mockResolvedValue({ errors: [], warnings: [] });

        const result = await compilePlugin(plugin, join(testDir, "cache"), sdkDir);

        expect(result.status).toBe("compiled");
        if (result.status === "compiled") {
            expect(result.executablePath).toContain("test");
        }
        expect(mockBuild).toHaveBeenCalledOnce();
    });

    it("returns cached on second compile of same source", async () => {
        const plugin = makePlugin("test.ts");
        await writeFile(plugin.executablePath, `console.log("hello");`, "utf8");
        mockBuild.mockResolvedValue({ errors: [], warnings: [] });

        const cacheDir = join(testDir, "cache");
        await compilePlugin(plugin, cacheDir, sdkDir);
        const result = await compilePlugin(plugin, cacheDir, sdkDir);

        expect(result.status).toBe("cached");
        if (result.status === "cached") {
            expect(result.executablePath).toContain("test");
        }
        // build only called once (second was cache hit)
        expect(mockBuild).toHaveBeenCalledOnce();
    });

    it("recompiles when SDK changes", async () => {
        const plugin = makePlugin("test.ts");
        await writeFile(plugin.executablePath, `console.log("hello");`, "utf8");
        mockBuild.mockResolvedValue({ errors: [], warnings: [] });

        const cacheDir = join(testDir, "cache");
        await compilePlugin(plugin, cacheDir, sdkDir);
        await writeFile(
            join(sdkDir, "index.ts"),
            "export function definePlugin() { return 1; }",
            "utf8",
        );
        const result = await compilePlugin(plugin, cacheDir, sdkDir);

        expect(result.status).toBe("compiled");
        expect(mockBuild).toHaveBeenCalledTimes(2);
    });

    it("returns compile_error for build failure with no cache", async () => {
        const plugin = makePlugin("bad.ts");
        await writeFile(plugin.executablePath, `const x = "unclosed`, "utf8");
        mockBuild.mockRejectedValue(new Error("Unterminated string literal"));

        const result = await compilePlugin(plugin, join(testDir, "cache"), sdkDir);

        expect(result.status).toBe("compile_error");
        if (result.status === "compile_error") {
            expect(result.error).toContain("Unterminated");
        }
    });

    it("returns stale_cache when compile fails but old JS exists", async () => {
        const plugin = makePlugin("test.ts");
        await writeFile(plugin.executablePath, `console.log("hello");`, "utf8");
        const cacheDir = join(testDir, "cache");

        // First compile succeeds — mock must write the output file
        mockBuild.mockImplementationOnce(async (opts: { outfile?: string }) => {
            if (opts.outfile) {
                const { mkdir: mkdirSync } = await import("node:fs/promises");
                const { dirname } = await import("node:path");
                await mkdirSync(dirname(opts.outfile), { recursive: true });
                await writeFile(opts.outfile, "// compiled", "utf8");
            }
            return { errors: [], warnings: [] };
        });
        await compilePlugin(plugin, cacheDir, sdkDir);

        // Change source so hash changes, then fail
        await writeFile(plugin.executablePath, `console.log("modified");`, "utf8");
        mockBuild.mockRejectedValueOnce(new Error("Syntax error"));
        const result = await compilePlugin(plugin, cacheDir, sdkDir);

        expect(result.status).toBe("stale_cache");
        if (result.status === "stale_cache") {
            expect(result.error).toContain("Syntax error");
        }
    });

    it("uses fallback cache before compiling", async () => {
        const plugin = makePlugin("test.ts");
        await writeFile(plugin.executablePath, `console.log("hello");`, "utf8");
        mockBuild.mockResolvedValue({ errors: [], warnings: [] });

        const fallbackDir = join(testDir, "fallback-cache");
        await compilePlugin(plugin, fallbackDir, sdkDir);
        mockBuild.mockClear();

        const result = await compilePlugin(plugin, join(testDir, "cache"), sdkDir, {
            fallbackCacheDir: fallbackDir,
        });

        expect(result.status).toBe("cached");
        expect(result.executablePath).toContain("fallback-cache");
        expect(mockBuild).not.toHaveBeenCalled();
    });

    it("uses fallback cache built from a different resource root", async () => {
        const buildRoot = join(testDir, "build-root");
        const runtimeRoot = join(testDir, "runtime-root");
        const buildSdkDir = join(buildRoot, "sdk");
        const runtimeSdkDir = join(runtimeRoot, "sdk");
        const buildPluginPath = join(buildRoot, "plugins", "test.ts");
        const runtimePluginPath = join(runtimeRoot, "plugins", "test.ts");
        await mkdir(join(buildRoot, "plugins"), { recursive: true });
        await mkdir(join(runtimeRoot, "plugins"), { recursive: true });
        await mkdir(buildSdkDir, { recursive: true });
        await mkdir(runtimeSdkDir, { recursive: true });
        await writeFile(buildPluginPath, `console.log("hello");`, "utf8");
        await writeFile(runtimePluginPath, `console.log("hello");`, "utf8");
        await writeFile(join(buildSdkDir, "index.ts"), "export function definePlugin() {}", "utf8");
        await writeFile(
            join(runtimeSdkDir, "index.ts"),
            "export function definePlugin() {}",
            "utf8",
        );
        mockBuild.mockResolvedValue({ errors: [], warnings: [] });

        const fallbackDir = join(testDir, "fallback-cache");
        const buildPlugin: PluginDefinition = {
            scriptName: "test.ts",
            executablePath: buildPluginPath,
            metadata: null,
            source: "bundled",
        };
        const runtimePlugin: PluginDefinition = {
            scriptName: "test.ts",
            executablePath: runtimePluginPath,
            metadata: null,
            source: "bundled",
        };
        await compilePlugin(buildPlugin, fallbackDir, buildSdkDir);
        mockBuild.mockClear();

        const result = await compilePlugin(runtimePlugin, join(testDir, "cache"), runtimeSdkDir, {
            fallbackCacheDir: fallbackDir,
        });

        expect(result.status).toBe("cached");
        expect(result.executablePath).toContain("fallback-cache");
        expect(mockBuild).not.toHaveBeenCalled();
    });

    it("compiles to primary cache when fallback cache is stale", async () => {
        const plugin = makePlugin("test.ts");
        await writeFile(plugin.executablePath, `console.log("hello");`, "utf8");
        mockBuild.mockResolvedValue({ errors: [], warnings: [] });

        const fallbackDir = join(testDir, "fallback-cache");
        const cacheDir = join(testDir, "cache");
        await compilePlugin(plugin, fallbackDir, sdkDir);
        await writeFile(plugin.executablePath, `console.log("changed");`, "utf8");
        mockBuild.mockClear();

        const result = await compilePlugin(plugin, cacheDir, sdkDir, {
            fallbackCacheDir: fallbackDir,
        });

        expect(result.status).toBe("compiled");
        expect(result.executablePath).toContain("cache");
        expect(result.executablePath).not.toContain("fallback-cache");
        expect(mockBuild).toHaveBeenCalledOnce();
    });
});
