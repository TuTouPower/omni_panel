import { describe, it, expect } from "vitest";
import { runBundledPlugin } from "../integration/plugin/_helpers/plugin_test_harness";
import type { PluginResult } from "../../src/shared/schemas/plugin-output";

const TIMEOUT_MS = 30_000;

const env_key = (k: string): string => process.env[k] ?? "";

const has_deepseek = !!process.env["DEEPSEEK_API_KEY"];
const has_glm = !!process.env["GLM_API_KEY"];
const has_minimax = !!process.env["MINIMAX_API_KEY"];
const has_tavily = !!process.env["TAVILY_API_KEY"];
const has_cpa_key = !!process.env["CPA_MGMT_KEY"];
const has_cpa_url = !!process.env["CPA_MGMT_URL"];
const has_cpa = has_cpa_key && has_cpa_url;

function assert_success_shape(result: PluginResult): void {
    expect(result.success).toBe(true);
    if (!result.success) return;

    const out = result;
    expect(typeof out.updatedAt).toBe("string");
    expect(Number.isNaN(Date.parse(out.updatedAt))).toBe(false);
    expect(Array.isArray(out.items)).toBe(true);

    for (const item of out.items) {
        expect(typeof item.id).toBe("string");
        expect(typeof item.name).toBe("string");
        expect(typeof item.used).toBe("number");
        expect(typeof item.limit).toBe("number");
        expect(["percent", "ratio"]).toContain(item.displayStyle);
        expect(["normal", "warning", "critical", "unknown"]).toContain(item.status);
    }
}

describe("live contract: external plugins", () => {
    it.skipIf(!has_deepseek)(
        "deepseek-usage-plugin returns valid shape",
        { timeout: TIMEOUT_MS },
        async () => {
            const { exec, parsed } = await runBundledPlugin({
                pluginFile: "deepseek-usage-plugin.ts",
                params: { API_KEY: env_key("DEEPSEEK_API_KEY") },
                timeoutMs: TIMEOUT_MS,
            });

            expect(exec.exitCode).toBe(0);
            assert_success_shape(parsed);
        },
    );

    it.skipIf(!has_glm)(
        "glm-usage-plugin returns valid shape",
        { timeout: TIMEOUT_MS },
        async () => {
            const { exec, parsed } = await runBundledPlugin({
                pluginFile: "glm-usage-plugin.ts",
                params: { API_KEY: env_key("GLM_API_KEY") },
                timeoutMs: TIMEOUT_MS,
            });

            expect(exec.exitCode).toBe(0);
            assert_success_shape(parsed);
        },
    );

    it.skipIf(!has_minimax)(
        "minimax-usage-plugin returns valid shape",
        { timeout: TIMEOUT_MS },
        async () => {
            const { exec, parsed } = await runBundledPlugin({
                pluginFile: "minimax-usage-plugin.ts",
                params: { API_KEY: env_key("MINIMAX_API_KEY") },
                timeoutMs: TIMEOUT_MS,
            });

            expect(exec.exitCode).toBe(0);
            assert_success_shape(parsed);
        },
    );

    it.skipIf(!has_tavily)(
        "tavily-usage-plugin returns valid shape",
        { timeout: TIMEOUT_MS },
        async () => {
            const { exec, parsed } = await runBundledPlugin({
                pluginFile: "tavily-usage-plugin.ts",
                params: { API_KEY: env_key("TAVILY_API_KEY") },
                timeoutMs: TIMEOUT_MS,
            });

            expect(exec.exitCode).toBe(0);
            assert_success_shape(parsed);
        },
    );

    it.skipIf(!has_cpa)(
        "cpa-usage-plugin returns valid shape",
        { timeout: TIMEOUT_MS },
        async () => {
            const { exec, parsed } = await runBundledPlugin({
                pluginFile: "cpa-usage-plugin.ts",
                params: { cpa_mgmt_key: env_key("CPA_MGMT_KEY") },
                env: {
                    OMNI_PLUGIN_ENDPOINTS: JSON.stringify({
                        default: env_key("CPA_MGMT_URL"),
                    }),
                },
                timeoutMs: TIMEOUT_MS,
            });

            expect(exec.exitCode).toBe(0);
            assert_success_shape(parsed);
        },
    );
});
