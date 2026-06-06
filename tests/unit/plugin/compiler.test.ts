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

    it("passes correct options to esbuild", async () => {
        const plugin = makePlugin("test.ts");
        await writeFile(plugin.executablePath, `console.log("hello");`, "utf8");
        mockBuild.mockResolvedValue({ errors: [], warnings: [] });

        await compilePlugin(plugin, join(testDir, "cache"), sdkDir);

        interface EsbuildOptions {
            alias?: Record<string, string>;
            platform?: string;
            format?: string;
            bundle?: boolean;
        }
        const callArgs = mockBuild.mock.calls[0]?.[0] as EsbuildOptions | undefined;
        expect(callArgs?.alias?.["@omni-usage/plugin-sdk"]).toBe(join(sdkDir, "index.ts"));
        expect(callArgs?.platform).toBe("node");
        expect(callArgs?.format).toBe("cjs");
        expect(callArgs?.bundle).toBe(true);
    });
});
