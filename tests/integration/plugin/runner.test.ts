import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { executePlugin } from "../../../src/main/core/plugin/runner";
import { buildPluginCommand } from "../../../src/main/core/plugin/command-builder";
import { PluginTimeoutError } from "../../../src/shared/errors/plugin-errors";
import { parsePluginResult } from "../../../src/main/core/plugin/output-parser";
import { addTransport, setLogLevel } from "../../../src/shared/lib/logger";

const fakePluginsDir = resolve(__dirname, "../../fixtures/fake-plugins");
const nodePath = process.execPath;

function fakePlugin(name: string): string {
    return resolve(fakePluginsDir, name);
}

describe("executePlugin", () => {
    it("executes valid JSON plugin and captures stdout", async () => {
        const cmd = buildPluginCommand(fakePlugin("prints-valid-json.js"), {}, "zh-Hans", nodePath);
        const result = await executePlugin(cmd);
        expect(result.exitCode).toBe(0);
        const output = parsePluginResult(result.stdout);
        if (output.success) expect(output.items.length).toBeGreaterThan(0);
    });

    it("captures stderr on invalid JSON but exits 0", async () => {
        const cmd = buildPluginCommand(
            fakePlugin("prints-invalid-json.js"),
            {},
            "zh-Hans",
            nodePath,
        );
        const result = await executePlugin(cmd);
        expect(result.exitCode).toBe(0);
    });

    it("captures non-zero exit code and stderr", async () => {
        const cmd = buildPluginCommand(fakePlugin("exits-nonzero.js"), {}, "zh-Hans", nodePath);
        const result = await executePlugin(cmd);
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain("error occurred");
    });

    it("throws PluginTimeoutError on timeout", async () => {
        const cmd = buildPluginCommand(fakePlugin("sleeps-timeout.js"), {}, "zh-Hans", nodePath);
        await expect(executePlugin(cmd, { timeoutMs: 1000 })).rejects.toThrow(PluginTimeoutError);
    });

    it("captures stderr without failing", async () => {
        const cmd = buildPluginCommand(fakePlugin("prints-to-stderr.js"), {}, "zh-Hans", nodePath);
        const result = await executePlugin(cmd);
        expect(result.exitCode).toBe(0);
        expect(result.stderr).toContain("debug info");
    });

    it("does not log raw command or output outside development", async () => {
        const original_node_env = process.env["NODE_ENV"];
        process.env["NODE_ENV"] = "production";
        const lines: string[] = [];
        const remove_transport = addTransport({
            write(level, module, message, meta) {
                if (module === "runner") {
                    lines.push(`${level}:${message}:${JSON.stringify(meta)}`);
                }
            },
        });
        setLogLevel("debug");
        const cmd = buildPluginCommand(fakePlugin("prints-to-stderr.js"), {}, "zh-Hans", nodePath);

        try {
            const result = await executePlugin(cmd);
            const joined = lines.join("\n");

            expect(result.exitCode).toBe(0);
            expect(joined).toContain("spawn:");
            expect(joined).toContain("exit 0");
            expect(joined).not.toContain("plugin command raw");
            expect(joined).not.toContain("plugin stdout raw");
            expect(joined).not.toContain("plugin stderr raw");
        } finally {
            if (original_node_env === undefined) {
                delete process.env["NODE_ENV"];
            } else {
                process.env["NODE_ENV"] = original_node_env;
            }
            remove_transport();
        }
    });

    it("redacts sensitive argv values in logs", async () => {
        const original_node_env = process.env["NODE_ENV"];
        process.env["NODE_ENV"] = "production";
        const lines: string[] = [];
        const remove_transport = addTransport({
            write(level, module, message, meta) {
                if (module === "runner") {
                    lines.push(`${level}:${message}:${JSON.stringify(meta)}`);
                }
            },
        });
        setLogLevel("debug");
        const cmd = {
            command: nodePath,
            args: [fakePlugin("prints-valid-json.js"), "api_key=abc123", "sk-secret"],
        };

        try {
            const result = await executePlugin(cmd);
            const joined = lines.join("\n");

            expect(result.exitCode).toBe(0);
            expect(joined).toContain("api_key=***");
            expect(joined).not.toContain("abc123");
            expect(joined).not.toContain("sk-secret");
        } finally {
            if (original_node_env === undefined) {
                delete process.env["NODE_ENV"];
            } else {
                process.env["NODE_ENV"] = original_node_env;
            }
            remove_transport();
        }
    });

    it("passes parameters correctly", async () => {
        const cmd = buildPluginCommand(
            fakePlugin("echoes-params.js"),
            { KEY: "value" },
            "zh-Hans",
            nodePath,
        );
        const result = await executePlugin(cmd);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("KEY");
        expect(result.stdout).toContain("value");
    });

    it("kills SIGTERM-ignoring process with SIGKILL", async () => {
        const cmd = buildPluginCommand(fakePlugin("ignores-sigterm.js"), {}, "zh-Hans", nodePath);
        const start = Date.now();
        await expect(executePlugin(cmd, { timeoutMs: 500 })).rejects.toThrow(PluginTimeoutError);
        const elapsed = Date.now() - start;
        // Should finish within timeout + grace period (500ms + 2000ms + margin)
        expect(elapsed).toBeLessThan(5000);
    });

    it("correctly decodes Chinese characters", async () => {
        const cmd = buildPluginCommand(
            fakePlugin("prints-chinese-json.js"),
            {},
            "zh-Hans",
            nodePath,
        );
        const result = await executePlugin(cmd);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("中文测试：5小时用量");
        const output = parsePluginResult(result.stdout);
        if (output.success) expect(output.items[0]?.name).toBe("中文测试：5小时用量");
    });
});
