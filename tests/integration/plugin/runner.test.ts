import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { executePlugin } from "../../../src/main/core/plugin/runner";
import { buildPluginCommand } from "../../../src/main/core/plugin/command-builder";
import { PluginTimeoutError } from "../../../src/shared/errors/plugin-errors";
import { parsePluginOutput } from "../../../src/main/core/plugin/output-parser";

const fakePluginsDir = resolve(__dirname, "../../../fixtures/fake-plugins");

function fakePlugin(name: string): string {
    return resolve(fakePluginsDir, name);
}

describe("executePlugin", () => {
    it("executes valid JSON plugin and captures stdout", async () => {
        const cmd = buildPluginCommand(fakePlugin("prints-valid-json.py"), {}, "zh-Hans");
        const result = await executePlugin(cmd);
        expect(result.exitCode).toBe(0);
        const output = parsePluginOutput(result.stdout);
        expect(output.items.length).toBeGreaterThan(0);
    });

    it("captures stderr on invalid JSON but exits 0", async () => {
        const cmd = buildPluginCommand(fakePlugin("prints-invalid-json.py"), {}, "zh-Hans");
        const result = await executePlugin(cmd);
        expect(result.exitCode).toBe(0);
    });

    it("captures non-zero exit code and stderr", async () => {
        const cmd = buildPluginCommand(fakePlugin("exits-nonzero.py"), {}, "zh-Hans");
        const result = await executePlugin(cmd);
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain("error occurred");
    });

    it("throws PluginTimeoutError on timeout", async () => {
        const cmd = buildPluginCommand(fakePlugin("sleeps-timeout.py"), {}, "zh-Hans");
        await expect(executePlugin(cmd, { timeoutMs: 1000 })).rejects.toThrow(PluginTimeoutError);
    });

    it("captures stderr without failing", async () => {
        const cmd = buildPluginCommand(fakePlugin("prints-to-stderr.py"), {}, "zh-Hans");
        const result = await executePlugin(cmd);
        expect(result.exitCode).toBe(0);
        expect(result.stderr).toContain("debug info");
    });

    it("passes parameters correctly", async () => {
        const cmd = buildPluginCommand(fakePlugin("echoes-params.py"), { KEY: "value" }, "zh-Hans");
        const result = await executePlugin(cmd);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("KEY");
        expect(result.stdout).toContain("value");
    });

    it("kills SIGTERM-ignoring process with SIGKILL", async () => {
        const cmd = buildPluginCommand(fakePlugin("ignores-sigterm.py"), {}, "zh-Hans");
        const start = Date.now();
        await expect(executePlugin(cmd, { timeoutMs: 500 })).rejects.toThrow(PluginTimeoutError);
        const elapsed = Date.now() - start;
        // Should finish within timeout + grace period (500ms + 2000ms + margin)
        expect(elapsed).toBeLessThan(5000);
    });
});
