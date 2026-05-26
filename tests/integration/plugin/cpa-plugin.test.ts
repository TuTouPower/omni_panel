import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { executePlugin } from "../../../src/main/core/plugin/runner";
import { buildPluginCommand } from "../../../src/main/core/plugin/command-builder";
import { parsePluginResult } from "../../../src/main/core/plugin/output-parser";
import { getSdkDir } from "../../../src/main/core/paths";

const pluginSource = resolve(__dirname, "../../../resources/plugins/cpa-usage-plugin.ts");
const cacheDir = resolve(__dirname, "../../../.cache/cpa-test");
const nodePath = process.execPath;

function compileCpaPlugin(): string {
    const outPath = resolve(cacheDir, "cpa-usage-plugin.js");
    if (existsSync(outPath)) return outPath;
    mkdirSync(cacheDir, { recursive: true });
    const sdkDir = getSdkDir();
    execSync(
        `npx esbuild "${pluginSource}" --bundle --platform=node --format=cjs ` +
            `--alias:@omni-usage/plugin-sdk="${sdkDir}" ` +
            `--outfile="${outPath}"`,
        { stdio: "pipe" },
    );
    return outPath;
}

describe("CPA plugin subprocess", () => {
    let compiledPath: string;

    try {
        compiledPath = compileCpaPlugin();
    } catch {
        it.skip("skips — esbuild not available in test environment");
        return;
    }

    it("outputs error JSON when CPA-Manager is unreachable", async () => {
        const cmd = buildPluginCommand(
            compiledPath,
            {
                cpa_mgmt_url: "http://127.0.0.1:1",
                cpa_mgmt_key: "test-key",
            },
            "zh-Hans",
            nodePath,
        );
        const result = await executePlugin(cmd);
        expect(result.exitCode).toBe(0);
        const output = parsePluginResult(result.stdout);
        expect(output.success).toBe(false);
    });

    afterAll(() => {
        if (existsSync(cacheDir)) {
            rmSync(cacheDir, { recursive: true, force: true });
        }
    });
});
