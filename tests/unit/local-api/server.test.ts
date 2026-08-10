import { describe, it, expect } from "vitest";
import {
    is_within_web_root,
    sse_cleanup_should_unsubscribe,
} from "../../../src/main/core/local-api/server";
import type { Env } from "../../../src/main/core/session-history/subscription-service";

describe("is_within_web_root (path traversal guard)", () => {
    it("accepts file inside web_root", () => {
        expect(is_within_web_root("/app/web", "/app/web/index.html")).toBe(true);
    });

    it("accepts the web_root itself", () => {
        expect(is_within_web_root("/app/web", "/app/web")).toBe(true);
    });

    it("rejects same-prefix sibling directory (web vs web-secret)", () => {
        // String startsWith("/app/web") would pass this — the bug A6 fixes.
        expect(is_within_web_root("/app/web", "/app/web-secret/leak.txt")).toBe(false);
    });

    it("rejects parent traversal target", () => {
        expect(is_within_web_root("/app/web", "/app/etc/passwd")).toBe(false);
    });

    it("rejects fully unrelated absolute path", () => {
        expect(is_within_web_root("/app/web", "/etc/passwd")).toBe(false);
    });

    it("rejects nested same-prefix sibling", () => {
        expect(is_within_web_root("/app/web", "/app/web-evil/sub/file")).toBe(false);
    });
});

describe("sse_cleanup_should_unsubscribe (t279 f005 race guard)", () => {
    const env: Env = "win";
    const sub_entry = (client: unknown) => ({
        source: "claude_code",
        env,
        session_id: "sess-1",
        client: client as Parameters<typeof sse_cleanup_should_unsubscribe>[1],
    });

    it("mapping still points to the closing connection -> unsubscribe proceeds", () => {
        const closing = {} as Parameters<typeof sse_cleanup_should_unsubscribe>[1];
        expect(
            sse_cleanup_should_unsubscribe(
                "web-1",
                closing,
                new Map([["web-1", sub_entry(closing)]]),
                new Map([["web-1", closing]]),
            ),
        ).toBe(true);
    });

    it("new connection already re-registered (old close late) -> skip unsubscribe", () => {
        const closing = {} as Parameters<typeof sse_cleanup_should_unsubscribe>[1];
        const fresh = {} as Parameters<typeof sse_cleanup_should_unsubscribe>[1];
        expect(
            sse_cleanup_should_unsubscribe(
                "web-1",
                closing,
                new Map([["web-1", sub_entry(fresh)]]),
                new Map([["web-1", fresh]]),
            ),
        ).toBe(false);
    });

    it("subscriber id no longer registered -> skip", () => {
        const closing = {} as Parameters<typeof sse_cleanup_should_unsubscribe>[1];
        expect(sse_cleanup_should_unsubscribe("web-1", closing, new Map(), new Map())).toBe(false);
    });
});
