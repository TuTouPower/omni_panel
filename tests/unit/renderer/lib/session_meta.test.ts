import { describe, it, expect } from "vitest";
import { session_meta } from "../../../../src/renderer/lib/session_meta";

function get_session_meta(provider: string): { login_url: string; cookie_names: string[] } {
    const meta = session_meta[provider];
    if (!meta) throw new Error(`missing session_meta for ${provider}`);
    return meta;
}

describe("session_meta", () => {
    it("exports a Record of provider metadata with login_url and cookie_names", () => {
        expect(session_meta).toBeTypeOf("object");
        for (const [provider, meta] of Object.entries(session_meta)) {
            expect(provider).toBeTypeOf("string");
            expect(meta).toHaveProperty("login_url");
            expect(meta.login_url).toMatch(/^https?:\/\//);
            expect(meta).toHaveProperty("cookie_names");
            expect(Array.isArray(meta.cookie_names)).toBe(true);
            expect(meta.cookie_names.length).toBeGreaterThan(0);
            for (const name of meta.cookie_names) {
                expect(name).toBeTypeOf("string");
            }
        }
    });

    it("preserves known providers", () => {
        expect(session_meta).toHaveProperty("mimo");
        expect(session_meta).toHaveProperty("kimi");
        expect(session_meta).toHaveProperty("opencode_go");
        expect(get_session_meta("mimo").login_url).toBe(
            "https://platform.xiaomimimo.com/console/plan-manage",
        );
        expect(get_session_meta("mimo").cookie_names).toEqual([
            "api-platform_serviceToken",
            "api-platform_slh",
            "api-platform_ph",
        ]);
        expect(get_session_meta("kimi").login_url).toBe("https://www.kimi.com/login");
        expect(get_session_meta("kimi").cookie_names).toEqual(["access_token", "refresh_token"]);
        expect(get_session_meta("opencode_go").login_url).toBe("https://opencode.ai/auth");
        expect(get_session_meta("opencode_go").cookie_names).toEqual(["*"]);
    });
});
