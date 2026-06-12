import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Module from "node:module";

const mockBuild = vi.fn();

vi.mock("esbuild", () => ({ build: mockBuild }));

// Must import after vi.mock
import {
    compilePlugin,
    configure_esbuild_binary_path,
    compute_compile_hash,
} from "../../../src/main/core/plugin/compiler";
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

describe("stale cache whitespace-only rejection", () => {
    it("returns compile_error when cached output file is whitespace-only", async () => {
        const plugin = makePlugin("test.ts");
        await writeFile(plugin.executablePath, `console.log("hello");`, "utf8");
        mockBuild.mockResolvedValue({ errors: [], warnings: [] });

        const cacheDir = join(testDir, "cache");
        await compilePlugin(plugin, cacheDir, sdkDir);

        // Overwrite compiled output with whitespace-only content
        const name = "test";
        const { createHash } = await import("node:crypto");
        const pathHash = createHash("sha256").update("test.ts").digest("hex").slice(0, 8);
        const outPath = join(cacheDir, `${name}-${pathHash}`, "index.js");
        await writeFile(outPath, "   \n  \t  ", "utf8");

        // Change source so hash changes, then fail
        const plugin2 = makePlugin("test.ts");
        await writeFile(plugin2.executablePath, `console.log("changed");`, "utf8");
        mockBuild.mockRejectedValueOnce(new Error("Syntax error"));
        const result = await compilePlugin(plugin2, cacheDir, sdkDir);

        expect(result.status).toBe("compile_error");
    });
});

describe("hash encoding consistency with bundled_resource_verifier", () => {
    it("produces same hash as Buffer-based hash_file", async () => {
        const content = `console.log("test");`;
        const plugin = makePlugin("test.ts");
        await writeFile(plugin.executablePath, content, "utf8");

        const pluginHash = await compute_compile_hash(plugin, sdkDir);
        const { createHash } = await import("node:crypto");
        const expectedHash = createHash("sha256")
            .update("plugin\0")
            .update("test.ts")
            .update("\0")
            .update(Buffer.from(content, "utf8"))
            .update("sdk\0")
            .update("index.ts")
            .update("\0")
            .update(
                await import("node:fs/promises").then((m) => m.readFile(join(sdkDir, "index.ts"))),
            )
            .digest("hex");

        expect(pluginHash).toBe(expectedHash);
    });

    it("handles BOM files consistently with Buffer-based verifier", async () => {
        const bom = Buffer.from([0xef, 0xbb, 0xbf]);
        const content = Buffer.concat([bom, Buffer.from(`console.log("bom");`, "utf8")]);
        const plugin = makePlugin("bom.ts");
        await writeFile(plugin.executablePath, content);

        const pluginHash = await compute_compile_hash(plugin, sdkDir);
        const { createHash } = await import("node:crypto");
        const expectedHash = createHash("sha256")
            .update("plugin\0")
            .update("bom.ts")
            .update("\0")
            .update(content)
            .update("sdk\0")
            .update("index.ts")
            .update("\0")
            .update(
                await import("node:fs/promises").then((m) => m.readFile(join(sdkDir, "index.ts"))),
            )
            .digest("hex");

        expect(pluginHash).toBe(expectedHash);
    });
});

describe("configure_esbuild_binary_path", () => {
    let savedResourcesPath: string | undefined;
    beforeEach(() => {
        delete process.env["ESBUILD_BINARY_PATH"];
        savedResourcesPath = process.resourcesPath;
        // @ts-expect-error intentional readonly override for test
        process.resourcesPath = "/test/resources";
    });
    afterEach(() => {
        if (savedResourcesPath === undefined) {
            // @ts-expect-error intentional readonly override for test
            delete process.resourcesPath;
        } else {
            // @ts-expect-error intentional readonly override for test
            process.resourcesPath = savedResourcesPath;
        }
    });

    it("sets ESBUILD_BINARY_PATH when binary is inside app.asar", () => {
        const originalPlatform = process.platform;
        const origResolve = (Module as unknown as Record<string, unknown>)["_resolveFilename"];
        (Module as unknown as Record<string, unknown>)["_resolveFilename"] = (request: string) => {
            if (request === "@esbuild/win32-x64/esbuild.exe") {
                return "C:\\app\\resources\\app.asar\\node_modules\\@esbuild\\win32-x64\\esbuild.exe";
            }
            return request;
        };
        try {
            Object.defineProperty(process, "platform", { value: "win32" });
            configure_esbuild_binary_path();
            expect(process.env["ESBUILD_BINARY_PATH"]).toBe(
                "C:\\app\\resources\\app.asar.unpacked\\node_modules\\@esbuild\\win32-x64\\esbuild.exe",
            );
        } finally {
            (Module as unknown as Record<string, unknown>)["_resolveFilename"] = origResolve;
            Object.defineProperty(process, "platform", { value: originalPlatform });
        }
    });

    it("does not set ESBUILD_BINARY_PATH when path does not contain app.asar", () => {
        const originalPlatform = process.platform;
        const origResolve = (Module as unknown as Record<string, unknown>)["_resolveFilename"];
        (Module as unknown as Record<string, unknown>)["_resolveFilename"] = (request: string) => {
            if (request === "@esbuild/win32-x64/esbuild.exe") {
                return "/some/other/path/esbuild.exe";
            }
            return request;
        };
        try {
            Object.defineProperty(process, "platform", { value: "win32" });
            configure_esbuild_binary_path();
            expect(process.env["ESBUILD_BINARY_PATH"]).toBeUndefined();
        } finally {
            (Module as unknown as Record<string, unknown>)["_resolveFilename"] = origResolve;
            Object.defineProperty(process, "platform", { value: originalPlatform });
        }
    });

    it("handles require.resolve failure gracefully", () => {
        const originalPlatform = process.platform;
        const origResolve = (Module as unknown as Record<string, unknown>)["_resolveFilename"];
        (Module as unknown as Record<string, unknown>)["_resolveFilename"] = (request: string) => {
            if (request === "@esbuild/win32-x64/esbuild.exe") {
                throw new Error("Cannot find module");
            }
            return request;
        };
        try {
            Object.defineProperty(process, "platform", { value: "win32" });
            configure_esbuild_binary_path();
            expect(process.env["ESBUILD_BINARY_PATH"]).toBeUndefined();
        } finally {
            (Module as unknown as Record<string, unknown>)["_resolveFilename"] = origResolve;
            Object.defineProperty(process, "platform", { value: originalPlatform });
        }
    });
});
