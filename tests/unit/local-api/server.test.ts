import { describe, it, expect } from "vitest";
import { is_within_web_root } from "../../../src/main/core/local-api/server";

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
