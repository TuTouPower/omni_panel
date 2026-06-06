import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, basename } from "node:path";
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

async function computeHash(filePath: string): Promise<string> {
    const content = await readFile(filePath, "utf8");
    return createHash("sha256").update(content).digest("hex");
}

export async function compilePlugin(
    plugin: PluginDefinition,
    cacheDir: string,
    sdkDir: string,
): Promise<CompileResult> {
    const name = basename(plugin.executablePath, ".ts");
    const pathHash = createHash("sha256").update(plugin.executablePath).digest("hex").slice(0, 8);
    const outDir = join(cacheDir, `${name}-${pathHash}`);
    const outPath = join(outDir, "index.js");
    const manifestPath = join(outDir, "manifest.json");

    const sourceHash = await computeHash(plugin.executablePath);

    // Check cache
    try {
        const raw = await readFile(manifestPath, "utf8");
        const manifest = JSON.parse(raw) as CompileManifest;
        if (manifest.sourceHash === sourceHash) {
            log.debug(`Cache hit for ${name}`);
            return { status: "cached", executablePath: outPath };
        }
    } catch {
        // No cache, compile fresh
    }

    // Compile
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
