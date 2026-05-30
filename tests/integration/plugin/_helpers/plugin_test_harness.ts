import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { executePlugin } from "../../../../src/main/core/plugin/runner";
import { buildPluginCommand } from "../../../../src/main/core/plugin/command-builder";
import { parsePluginResult } from "../../../../src/main/core/plugin/output-parser";
import type { PluginResult } from "../../../../src/shared/schemas/plugin-output";

const PLUGIN_DIR = resolve(__dirname, "../../../../resources/plugins");
const CACHE_DIR = resolve(__dirname, "../../../../.cache/test-harness");

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

function compile_plugin(pluginFile: string): string {
    const source_path = resolve(PLUGIN_DIR, pluginFile);
    const out_name = pluginFile.replace(/\.ts$/, ".js");
    const out_path = resolve(CACHE_DIR, out_name);
    const sdk_dir = resolve(__dirname, "../../../../src/plugins/sdk");
    mkdirSync(CACHE_DIR, { recursive: true });
    execSync(
        `npx esbuild "${source_path}" --bundle --platform=node --format=cjs ` +
            `--alias:@omni-usage/plugin-sdk="${sdk_dir}" ` +
            `--outfile="${out_path}"`,
        { stdio: "pipe" },
    );
    return out_path;
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
    const parsed = parsePluginResult(exec.stdout);
    return { exec, parsed };
}
