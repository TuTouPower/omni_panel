import { describe, expect, it } from "vitest";

import { is_safe_cookie_string, MAX_COOKIE_LENGTH } from "../../../src/shared/lib/cookie";

describe("is_safe_cookie_string", () => {
    it("accepts valid normal cookie strings", () => {
        expect(is_safe_cookie_string("session=abc1234; token=xyz")).toBe(true);
    });

    it("rejects non-string or empty input", () => {
        expect(is_safe_cookie_string("")).toBe(false);
        expect(is_safe_cookie_string(null)).toBe(false);
        expect(is_safe_cookie_string(undefined)).toBe(false);
        expect(is_safe_cookie_string(123)).toBe(false);
    });

    it("rejects cookie containing CRLF characters", () => {
        expect(is_safe_cookie_string("session=abc\r\nSet-Cookie: evil=1")).toBe(false);
        expect(is_safe_cookie_string("session=abc\nname=evil")).toBe(false);
        expect(is_safe_cookie_string("session=abc\rname=evil")).toBe(false);
    });

    it("rejects cookie exceeding maximum length", () => {
        const huge = "a".repeat(MAX_COOKIE_LENGTH + 1);
        expect(is_safe_cookie_string(huge)).toBe(false);
    });
});
