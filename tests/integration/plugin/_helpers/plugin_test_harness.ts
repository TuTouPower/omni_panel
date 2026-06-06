import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync, statSync, readdirSync, writeFileSync } from "node:fs";
import { executePlugin } from "../../../../src/main/core/plugin/runner";
import { buildPluginCommand } from "../../../../src/main/core/plugin/command-builder";
import { parsePluginResult } from "../../../../src/main/core/plugin/output-parser";
import type { PluginResult } from "../../../../src/shared/schemas/plugin-output";

const PLUGIN_DIR = resolve(__dirname, "../../../../assets/plugins");
// Shared cache across runs/workers. Each plugin file is compiled by only one
// worker (the test file that owns it), so different workers never write to the
// same out_path. After the first warm-up run, every subsequent run is a cache
// hit, eliminating the Windows file-visibility race entirely.
const CACHE_DIR = resolve(__dirname, "../../../../.cache/test-harness/shared");

export interface PluginRunOptions {
    readonly pluginFile: string;
    readonly params: Record<string, string>;
    readonly env?: Record<string, string>;
    readonly timeoutMs?: number;
    readonly language?: "zh-Hans" | "en";
}

export interface PluginRunResult {
    readonly exec: { stdout: string; stderr: string; exitCode: number; durationMs: number };
    readonly parsed: PluginResult;
}

const ESBUILD_BIN = resolve(
    __dirname,
    "../../../../node_modules/.bin",
    process.platform === "win32" ? "esbuild.cmd" : "esbuild",
);

function newest_mtime_in(dir: string): number {
    let newest = 0;
    try {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = resolve(dir, entry.name);
            if (entry.isDirectory()) {
                newest = Math.max(newest, newest_mtime_in(full));
            } else {
                newest = Math.max(newest, statSync(full).mtimeMs);
            }
        }
    } catch {
        /* ignore */
    }
    return newest;
}

function compile_plugin(pluginFile: string): string {
    const source_path = resolve(PLUGIN_DIR, pluginFile);
    const out_name = pluginFile.replace(/\.ts$/, ".js");
    const out_path = resolve(CACHE_DIR, out_name);
    const sdk_dir = resolve(__dirname, "../../../../src/plugins/sdk");
    mkdirSync(CACHE_DIR, { recursive: true });

    // Skip rebuild if cached output is newer than both source AND SDK tree.
    // Bundle inlines SDK so SDK changes must invalidate the cache.
    if (existsSync(out_path)) {
        const src_mtime = statSync(source_path).mtimeMs;
        const sdk_mtime = newest_mtime_in(sdk_dir);
        const out_mtime = statSync(out_path).mtimeMs;
        if (out_mtime >= Math.max(src_mtime, sdk_mtime)) return out_path;
    }

    execFileSync(
        ESBUILD_BIN,
        [
            source_path,
            "--bundle",
            "--platform=node",
            "--format=cjs",
            `--alias:@omni-usage/plugin-sdk=${sdk_dir}`,
            `--outfile=${out_path}`,
        ],
        { stdio: "pipe", shell: process.platform === "win32" },
    );
    return out_path;
}

function safe_parse(stdout: string, stderr: string): PluginResult {
    try {
        return parsePluginResult(stdout);
    } catch (err) {
        mkdirSync(CACHE_DIR, { recursive: true });
        const dump_path = resolve(
            CACHE_DIR,
            `parse_error_${String(Date.now())}_${String(Math.floor(Math.random() * 1e6))}.log`,
        );
        try {
            writeFileSync(
                dump_path,
                `parse error: ${(err as Error).message}\n=== STDOUT (${String(stdout.length)}B) ===\n${stdout}\n=== STDERR (${String(stderr.length)}B) ===\n${stderr}\n`,
            );
        } catch {
            /* ignore */
        }
        return {
            success: false,
            error: {
                code: "PARSE_ERROR",
                message: `dump=${dump_path}`,
            },
        };
    }
}

export async function runBundledPlugin(opts: PluginRunOptions): Promise<PluginRunResult> {
    const compiled_path = compile_plugin(opts.pluginFile);
    const command = buildPluginCommand(
        compiled_path,
        opts.params,
        opts.language ?? "zh-Hans",
        process.execPath,
    );
    const command_env = {
        ...command.env,
        ...opts.env,
    };
    const exec = await executePlugin(
        { ...command, env: command_env },
        { timeoutMs: opts.timeoutMs ?? 15000 },
    );
    const parsed = safe_parse(exec.stdout, exec.stderr);
    if (!parsed.success && process.env["DEBUG_PLUGIN_HARNESS"] === "1") {
        const dump_path = resolve(
            CACHE_DIR,
            `fail_${opts.pluginFile}_${String(Date.now())}_${String(Math.floor(Math.random() * 1e6))}.log`,
        );
        try {
            writeFileSync(
                dump_path,
                `plugin: ${opts.pluginFile}\nexit: ${String(exec.exitCode)}\ncode: ${parsed.error.code}\nmsg: ${parsed.error.message}\nopts.env: ${JSON.stringify(opts.env ?? {})}\ncommand.env: ${JSON.stringify(command_env)}\n=== STDOUT (${String(exec.stdout.length)}B) ===\n${exec.stdout}\n=== STDERR (${String(exec.stderr.length)}B) ===\n${exec.stderr}\n`,
            );
        } catch {
            /* ignore */
        }
    }
    return { exec, parsed };
}
