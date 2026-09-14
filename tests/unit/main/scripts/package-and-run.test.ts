import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
    execSync: vi.fn(),
    spawn: vi.fn(() => ({ unref: vi.fn() })),
}));

import { execSync } from "node:child_process";
import {
    linux_proc_match_pattern,
    omni_proc_match_pattern,
    run_package_build,
} from "../../../../scripts/package-and-run";

const exec_mock = vi.mocked(execSync);

beforeEach(() => {
    exec_mock.mockReset();
});

describe("package-and-run run_package_build", () => {
    it("restores Node ABI even when build fails midway (t375 AC-003)", () => {
        // call 1: ensure electron ABI OK；call 2（build 段）抛错中断；call 3: finally 恢复
        exec_mock
            .mockImplementationOnce(() => Buffer.alloc(0))
            .mockImplementationOnce(() => {
                throw new Error("build interrupted");
            })
            .mockImplementationOnce(() => Buffer.alloc(0));

        expect(() => {
            run_package_build();
        }).toThrow("build interrupted");

        const restore_calls = exec_mock.mock.calls.filter(([cmd]) =>
            cmd.includes("ensure_sqlite_abi.mjs node"),
        );
        expect(restore_calls.length).toBe(1);
    });

    it("restores Node ABI on the success path (t375 AC-003)", () => {
        exec_mock.mockImplementation(() => Buffer.alloc(0));

        run_package_build();

        const calls = exec_mock.mock.calls.map(([cmd]) => cmd);
        expect(calls[calls.length - 1]).toContain("ensure_sqlite_abi.mjs node");
    });
});

describe("package-and-run proc match patterns (p223)", () => {
    it("pattern 命中打包产物，不命中自身 tsx 命令行", () => {
        const pattern = linux_proc_match_pattern();
        const packaged =
            "/home/testuser/testuser_ubuntu/omni_panel/artifacts/linux-unpacked/omni_panel --type=renderer";
        const self_cmdline = "node /home/testuser/testuser_ubuntu/omni_panel/scripts/package-and-run.ts";
        expect(packaged.includes(pattern)).toBe(true);
        expect(self_cmdline.includes(pattern)).toBe(false);
    });

    it("omni_proc_match_pattern 返回当前平台对应 pattern", () => {
        const pattern = omni_proc_match_pattern();
        if (process.platform === "darwin") {
            expect(pattern).toBe("OmniPanel.app/Contents/MacOS/OmniPanel");
        } else if (process.platform === "win32") {
            expect(pattern).toBe("OmniPanel.exe");
        } else {
            expect(pattern).toBe("linux-unpacked/omni_panel");
        }
    });
});
