import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join, basename, relative } from "node:path";
import { createLogger } from "../../../shared/lib/logger";
import type { PluginDefinition } from "./types";

const log = createLogger("compiler");
const require_module = createRequire(import.meta.url);

const ESBUILD_PACKAGES: Record<string, string> = {
    "darwin-arm64": "@esbuild/darwin-arm64/bin/esbuild",
    "darwin-x64": "@esbuild/darwin-x64/bin/esbuild",
    "linux-arm64": "@esbuild/linux-arm64/bin/esbuild",
    "linux-x64": "@esbuild/linux-x64/bin/esbuild",
    "win32-arm64": "@esbuild/win32-arm64/esbuild.exe",
    "win32-ia32": "@esbuild/win32-ia32/esbuild.exe",
    "win32-x64": "@esbuild/win32-x64/esbuild.exe",
};

function configure_esbuild_binary_path(): void {
    const package_name = ESBUILD_PACKAGES[`${process.platform}-${process.arch}`];
    if (!package_name || !process.resourcesPath) {
        return;
    }

    try {
        const binary_path = require_module.resolve(package_name);
        if (binary_path.includes("app.asar")) {
            process.env["ESBUILD_BINARY_PATH"] = binary_path.replace(
                "app.asar",
                "app.asar.unpacked",
            );
        }
    } catch {
        return;
    }
}

interface CompileManifest {
    sourcePath: string;
    compiledPath: string;
    sourceHash: string;
    compiledAt: string;
}

export type CompileResult =
    | { status: "compiled"; executablePath: string }
    | { status: "cached"; executablePath: string }
    | { status: "stale_cache"; executablePath: string; error: string }
    | { status: "compile_error"; executablePath: ""; error: string };

async function list_sdk_files(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { recursive: true, withFileTypes: true });
    return entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
        .map((entry) => join(entry.parentPath, entry.name))
        .sort();
}

async function compute_compile_hash(plugin: PluginDefinition, sdk_dir: string): Promise<string> {
    const hash = createHash("sha256");
    const plugin_content = await readFile(plugin.executablePath, "utf8");
    hash.update("plugin\0").update(plugin.scriptName).update("\0").update(plugin_content);

    for (const file_path of await list_sdk_files(sdk_dir)) {
        const sdk_content = await readFile(file_path, "utf8");
        const sdk_key = relative(sdk_dir, file_path).replaceAll("\\", "/");
        hash.update("sdk\0").update(sdk_key).update("\0").update(sdk_content);
    }

    return hash.digest("hex");
}

interface CompileOptions {
    fallbackCacheDir?: string;
}

interface CompileOutputPaths {
    outDir: string;
    outPath: string;
    manifestPath: string;
}

function get_compile_output_paths(plugin: PluginDefinition, cacheDir: string): CompileOutputPaths {
    const name = basename(plugin.executablePath, ".ts");
    const pathHash = createHash("sha256").update(plugin.scriptName).digest("hex").slice(0, 8);
    const outDir = join(cacheDir, `${name}-${pathHash}`);
    return {
        outDir,
        outPath: join(outDir, "index.js"),
        manifestPath: join(outDir, "manifest.json"),
    };
}

async function read_valid_compile_cache(
    plugin: PluginDefinition,
    cacheDir: string,
    sourceHash: string,
): Promise<string | null> {
    const { outPath, manifestPath } = get_compile_output_paths(plugin, cacheDir);
    try {
        const raw = await readFile(manifestPath, "utf8");
        const manifest = JSON.parse(raw) as CompileManifest;
        return manifest.sourceHash === sourceHash ? outPath : null;
    } catch {
        return null;
    }
}

export async function compilePlugin(
    plugin: PluginDefinition,
    cacheDir: string,
    sdkDir: string,
    options: CompileOptions = {},
): Promise<CompileResult> {
    const name = basename(plugin.executablePath, ".ts");
    const { outDir, outPath, manifestPath } = get_compile_output_paths(plugin, cacheDir);
    const sourceHash = await compute_compile_hash(plugin, sdkDir);

    const cachedPath = await read_valid_compile_cache(plugin, cacheDir, sourceHash);
    if (cachedPath) {
        log.debug(`Cache hit for ${name}`);
        return { status: "cached", executablePath: cachedPath };
    }

    if (options.fallbackCacheDir) {
        const fallbackPath = await read_valid_compile_cache(
            plugin,
            options.fallbackCacheDir,
            sourceHash,
        );
        if (fallbackPath) {
            log.debug(`Fallback cache hit for ${name}`);
            return { status: "cached", executablePath: fallbackPath };
        }
    }

    try {
        configure_esbuild_binary_path();
        const esbuild = await import("esbuild");
        await mkdir(outDir, { recursive: true });

        await esbuild.build({
            entryPoints: [plugin.executablePath],
            outfile: outPath,
            bundle: true,
            platform: "node",
            format: "cjs",
            target: "node18",
            sourcemap: true,
            alias: {
                "@omni-usage/plugin-sdk": join(sdkDir, "index.ts"),
            },
        });

        const manifest: CompileManifest = {
            sourcePath: plugin.executablePath,
            compiledPath: outPath,
            sourceHash,
            compiledAt: new Date().toISOString(),
        };
        await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

        log.info(`Compiled ${name}`);
        return { status: "compiled", executablePath: outPath };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error(`Compile failed for ${name}: ${message}`);

        // Fallback: stale cache?
        try {
            const existing = await readFile(outPath, "utf8");
            if (existing) {
                log.warn(`Using stale cache for ${name}`);
                return { status: "stale_cache", executablePath: outPath, error: message };
            }
        } catch {
            // No stale cache
        }
        return { status: "compile_error", executablePath: "", error: message };
    }
}
