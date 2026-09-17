import { describe, it, expect } from "vitest";
import { scan_local_auth } from "../../../../../src/main/core/auth/local-scanner";

describe("scan_local_auth", () => {
    it("returns found=true with email and accountId when ~/.codex/auth.json contains valid token", async () => {
        // payload: {"email": "test@example.com"} in base64 is eyJlbWFpbCI6ICJ0ZXN0QGV4YW1wbGUuY29tIn0=
        const fake_id_token = "header.eyJlbWFpbCI6ICJ0ZXN0QGV4YW1wbGUuY29tIn0=.signature";
        const auth_json_content = JSON.stringify({
            auth_mode: "chatgpt",
            tokens: {
                access_token: "test-access-token",
                account_id: "acct-12345",
                id_token: fake_id_token,
            },
        });

        const mock_reader = (path: string) => {
            if (path.includes(".codex/auth.json")) {
                return Promise.resolve(auth_json_content);
            }
            return Promise.reject(new Error("ENOENT"));
        };

        const result = await scan_local_auth("codex", { read_file: mock_reader });
        expect(result.found).toBe(true);
        expect(result.path).toContain(".codex/auth.json");
        expect(result.details?.valid).toBe(true);
        expect(result.details?.email).toBe("test@example.com");
        expect(result.details?.accountId).toBe("acct-12345");
    });

    it("returns found=false when auth.json does not exist", async () => {
        const mock_reader = () => Promise.reject(new Error("ENOENT"));
        const result = await scan_local_auth("codex", { read_file: mock_reader });
        expect(result.found).toBe(false);
    });

    it("returns found=true, valid=false when auth.json has no access_token", async () => {
        const auth_json_content = JSON.stringify({
            auth_mode: "chatgpt",
            tokens: {},
        });
        const mock_reader = () => Promise.resolve(auth_json_content);
        const result = await scan_local_auth("codex", { read_file: mock_reader });
        expect(result.found).toBe(true);
        expect(result.details?.valid).toBe(false);
    });
});
