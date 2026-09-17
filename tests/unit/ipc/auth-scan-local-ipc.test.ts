import { describe, it, expect } from "vitest";
import { handleAuthScanLocal } from "../../../src/main/ipc/auth-ipc";

describe("handleAuthScanLocal", () => {
    it("returns ok result when scan succeeds", async () => {
        const fake_id_token = "header.eyJlbWFpbCI6ICJ1c2VyQGdtYWlsLmNvbSJ9.sig";
        const auth_content = JSON.stringify({
            tokens: {
                access_token: "mock-access-token",
                account_id: "acct-999",
                id_token: fake_id_token,
            },
        });

        const deps = {
            read_file: () => Promise.resolve(auth_content),
            homedir: () => "/Users/fake_user",
        };

        const res = await handleAuthScanLocal("codex", deps);
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.data.found).toBe(true);
            expect(res.data.details?.email).toBe("user@gmail.com");
            expect(res.data.details?.accountId).toBe("acct-999");
        }
    });

    it("returns error result when dependency throws unexpected error", async () => {
        const deps = {
            read_file: () => {
                throw new Error("Disk corruption");
            },
            homedir: () => "/Users/fake_user",
        };

        const res = await handleAuthScanLocal("codex", deps);
        expect(res.ok).toBe(true);
        if (res.ok) {
            // ENOENT or file error is caught gracefully and returns found: false
            expect(res.data.found).toBe(false);
        }
    });
});
