import { describe, expect, it } from "vitest";
import { parse_cookie_text } from "../../../src/shared/lib/cookie_parser";

describe("parse_cookie_text", () => {
    it("parses cookie header strings", () => {
        expect(parse_cookie_text("a=1; b=hello%20world")).toEqual({
            header: "a=1; b=hello%20world",
            names: ["a", "b"],
        });
    });

    it("parses JSON cookie arrays", () => {
        const raw = JSON.stringify([
            { name: "session", value: "abc" },
            { name: "workspace", value: "ws_1" },
        ]);

        expect(parse_cookie_text(raw)).toEqual({
            header: "session=abc; workspace=ws_1",
            names: ["session", "workspace"],
        });
    });

    it("parses a single JSON cookie object", () => {
        expect(parse_cookie_text(JSON.stringify({ name: "session", value: "abc" }))).toEqual({
            header: "session=abc",
            names: ["session"],
        });
    });

    it("parses Netscape cookie files", () => {
        const raw = [
            "# Netscape HTTP Cookie File",
            ".opencode.ai\tTRUE\t/\tTRUE\t2147483647\tsession\tabc",
            "opencode.ai\tFALSE\t/\tTRUE\t2147483647\tworkspace\tws_1",
        ].join("\n");

        expect(parse_cookie_text(raw)).toEqual({
            header: "session=abc; workspace=ws_1",
            names: ["session", "workspace"],
        });
    });

    it("parses EditThisCookie exports with extra fields", () => {
        const raw = JSON.stringify([
            {
                domain: ".opencode.ai",
                expirationDate: 2147483647,
                hostOnly: false,
                httpOnly: true,
                name: "session",
                path: "/",
                sameSite: "lax",
                secure: true,
                value: "abc",
            },
        ]);

        expect(parse_cookie_text(raw)).toEqual({
            header: "session=abc",
            names: ["session"],
        });
    });

    it("rejects JSON cookie values that cannot be represented as cookie values", () => {
        expect(() =>
            parse_cookie_text(JSON.stringify({ name: "session", value: { token: "abc" } })),
        ).toThrow("无法识别 Cookie 格式");
    });

    it("rejects JSON cookie values containing semicolons", () => {
        expect(() =>
            parse_cookie_text(JSON.stringify({ name: "session", value: "abc; injected=1" })),
        ).toThrow("无法识别 Cookie 格式");
    });

    it("rejects Netscape cookie values containing semicolons", () => {
        const raw = ".opencode.ai\tTRUE\t/\tTRUE\t2147483647\tsession\tabc; injected=1";

        expect(() => parse_cookie_text(raw)).toThrow("无法识别 Cookie 格式");
    });

    it("rejects Netscape cookie values containing control characters", () => {
        const raw = ".opencode.ai\tTRUE\t/\tTRUE\t2147483647\tsession\tabc";

        expect(() => parse_cookie_text(raw)).toThrow("无法识别 Cookie 格式");
    });

    it("rejects unrecognized cookie text", () => {
        expect(() => parse_cookie_text("not a cookie")).toThrow("无法识别 Cookie 格式");
    });
});
