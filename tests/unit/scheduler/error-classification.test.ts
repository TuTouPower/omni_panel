import { describe, it, expect } from "vitest";
import {
    is_auth_error,
    is_connection_error,
} from "../../../src/main/core/scheduler/refresh-service";

describe("is_auth_error", () => {
    it("matches 401 / unauthorized / token / credential", () => {
        expect(is_auth_error("401 Unauthorized")).toBe(true);
        expect(is_auth_error("invalid_grant: bad token")).toBe(true);
        expect(is_auth_error("missing credentials")).toBe(true);
    });

    it("is not fooled by 'auth' substring in non-auth contexts (A11)", () => {
        // "auth" alone matched too broadly - a rate-limit or preflight message
        // would trigger an unnecessary interactive re-login.
        expect(is_auth_error("batch auth rate limited")).toBe(false);
        expect(is_auth_error("oauth preflight skipped")).toBe(false);
    });
});

describe("is_connection_error", () => {
    it("matches errno / undici socket codes / TLS strings", () => {
        expect(is_connection_error("request failed: ECONNRESET")).toBe(true);
        expect(is_connection_error("UND_ERR_SOCKET")).toBe(true);
        expect(is_connection_error("UND_ERR_CONNECT timeout")).toBe(true);
        expect(is_connection_error("socket hang up")).toBe(true);
        expect(is_connection_error("ETIMEDOUT")).toBe(true);
        // Real TLS errors carry "TLS" in the message - kept on purpose.
        expect(
            is_connection_error(
                "Client network socket disconnected before secure TLS connection was established",
            ),
        ).toBe(true);
    });

    it("returns false for unrelated parse errors", () => {
        expect(is_connection_error("failed to parse metrics.jsonl")).toBe(false);
    });
});
