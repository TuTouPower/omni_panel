import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "node:path";
import { executePlugin } from "../../../src/main/core/plugin/runner";
import { buildPluginCommand } from "../../../src/main/core/plugin/command-builder";
import { findPython } from "../../../src/main/core/plugin/python-detect";
import { parsePluginOutputOrError } from "../../../src/main/core/plugin/output-parser";
import type { PluginErrorOutput } from "../../../src/shared/schemas/plugin-output";

const pluginPath = resolve(__dirname, "../../../resources/plugins/cpa-usage-plugin.py");

let pythonCommand = "python3";

function isError(output: unknown): output is PluginErrorOutput {
    return typeof output === "object" && output !== null && "error" in output;
}

describe("CPA plugin subprocess", () => {
    beforeAll(async () => {
        pythonCommand = await findPython();
    });

    it("outputs error JSON when httpx is not available", async () => {
        const cmd = buildPluginCommand(
            pluginPath,
            { cpa_mgmt_key: "test-key", cpa_mgmt_url: "http://127.0.0.1:1" },
            "zh-Hans",
            pythonCommand,
        );
        const isolatedCmd = {
            ...cmd,
            env: { PYTHONPATH: resolve(__dirname, "../../../fixtures/empty-dir") },
        };
        const result = await executePlugin(isolatedCmd);
        expect(result.exitCode).toBe(0);
        const output = parsePluginOutputOrError(result.stdout);
        expect(isError(output)).toBe(true);
        if (isError(output)) {
            expect(output.error).toContain("httpx");
        }
    });

    it("outputs error JSON when CPA-Manager is unreachable", async () => {
        const cmd = buildPluginCommand(
            pluginPath,
            {
                cpa_mgmt_url: "http://127.0.0.1:1",
                cpa_mgmt_key: "test-key",
            },
            "zh-Hans",
            pythonCommand,
        );
        const result = await executePlugin(cmd);
        expect(result.exitCode).toBe(0);
        const output = parsePluginOutputOrError(result.stdout);
        expect(isError(output)).toBe(true);
    });
});
