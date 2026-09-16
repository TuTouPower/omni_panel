import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("node:child_process", () => ({
    execSync: vi.fn(),
    spawn: vi.fn(() => ({ unref: vi.fn() })),
}));

import { execSync } from "node:child_process";
import {
    linux_proc_match_pattern,
    mac_sign_identity,
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

describe("package-and-run mac signing identity (p245)", () => {
    const original = process.env["OMNIPANEL_MAC_SIGN_IDENTITY"];

    afterEach(() => {
        if (original === undefined) delete process.env["OMNIPANEL_MAC_SIGN_IDENTITY"];
        else process.env["OMNIPANEL_MAC_SIGN_IDENTITY"] = original;
    });

    it("环境变量覆盖优先，不再查钥匙串", () => {
        process.env["OMNIPANEL_MAC_SIGN_IDENTITY"] = "OVERRIDE-ID";
        expect(mac_sign_identity()).toBe("OVERRIDE-ID");
        expect(exec_mock).not.toHaveBeenCalled();
    });

    it("从 security find-identity 取稳定自签身份", () => {
        delete process.env["OMNIPANEL_MAC_SIGN_IDENTITY"];
        exec_mock.mockReturnValueOnce(
            [
                '  1) 577801370FC267A881778008B3D564F286D739A8 "OmniPanel Local Dev"',
                "     1 valid identities found",
            ].join("\n"),
        );
        expect(mac_sign_identity()).toBe("577801370FC267A881778008B3D564F286D739A8");
    });

    it("证书缺失时回退 ad-hoc（`-`），不抛错", () => {
        delete process.env["OMNIPANEL_MAC_SIGN_IDENTITY"];
        exec_mock.mockReturnValueOnce("     0 valid identities found");
        expect(mac_sign_identity()).toBe("-");

        exec_mock.mockImplementationOnce(() => {
            throw new Error("security unavailable");
        });
        expect(mac_sign_identity()).toBe("-");
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
