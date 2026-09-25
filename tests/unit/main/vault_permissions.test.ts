import os from "node:os";
import { describe, expect, it, vi } from "vitest";

import { build_icacls_args } from "../../../src/main/core/vault/file-vault-backend";

describe("build_icacls_args (A74 / AC-006)", () => {
    it("uses default resolver to fetch real userInfo username even when USERNAME env is spoofed", () => {
        const orig_user = process.env["USERNAME"];
        const user_info_spy = vi.spyOn(os, "userInfo").mockReturnValue({
            username: "trusted_system_user",
            uid: 1000,
            gid: 1000,
            homedir: "/home/user",
            shell: "/bin/bash",
        });

        try {
            process.env["USERNAME"] = "malicious_spoofed_env_user";
            // 不传第二个参数，直接走生产的默认解析器
            const args = build_icacls_args("C:\\data\\secrets.vault");
            expect(args).toEqual([
                "C:\\data\\secrets.vault",
                "/inheritance:r",
                "/grant:r",
                "trusted_system_user:F",
            ]);
            expect(args).not.toContain("malicious_spoofed_env_user:F");
        } finally {
            user_info_spy.mockRestore();
            if (orig_user !== undefined) {
                process.env["USERNAME"] = orig_user;
            } else {
                delete process.env["USERNAME"];
            }
        }
    });

    it("falls back to env when userInfo throws and returns null if no user is found", () => {
        const user_info_spy = vi.spyOn(os, "userInfo").mockImplementation(() => {
            throw new Error("cannot get user info");
        });
        const orig_user = process.env["USERNAME"];
        const orig_user_env = process.env["USER"];
        try {
            delete process.env["USERNAME"];
            delete process.env["USER"];
            const args = build_icacls_args("C:\\data\\secrets.vault");
            expect(args).toBeNull();
        } finally {
            user_info_spy.mockRestore();
            if (orig_user !== undefined) process.env["USERNAME"] = orig_user;
            if (orig_user_env !== undefined) process.env["USER"] = orig_user_env;
        }
    });
});
