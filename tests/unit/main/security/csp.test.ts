import { describe, expect, it } from "vitest";
import {
    build_csp_connect_src,
    build_csp_header,
    build_csp_script_src,
} from "../../../../src/main/security/csp";

describe("build_csp_script_src", () => {
    it("dev includes self, dev origin, unsafe-eval and unsafe-inline for vite plugin-react preamble", () => {
        const src = build_csp_script_src("http://localhost:5173");
        expect(src).toBe("'self' http://localhost:5173 'unsafe-eval' 'unsafe-inline'");
    });

    it("prod is strict self only (no unsafe-inline / unsafe-eval)", () => {
        const src = build_csp_script_src(null);
        expect(src).toBe("'self'");
        expect(src).not.toContain("unsafe-inline");
    });
});

describe("build_csp_connect_src", () => {
    it("dev scopes ws/wss to dev host", () => {
        expect(build_csp_connect_src("http://localhost:5173", "localhost:5173")).toBe(
            "'self' http://localhost:5173 ws://localhost:5173 wss://localhost:5173",
        );
    });

    it("dev with null host falls back to wildcard ws/wss (regression guard for dev_host ?? '*')", () => {
        expect(build_csp_connect_src("http://localhost:5173", null)).toBe(
            "'self' http://localhost:5173 ws://* wss://*",
        );
    });

    it("prod is self only", () => {
        expect(build_csp_connect_src(null, null)).toBe("'self'");
    });
});

describe("build_csp_header", () => {
    it("dev header composes all directives with unsafe-inline in script-src", () => {
        const header = build_csp_header("http://localhost:5173", "localhost:5173");
        expect(header).toContain(
            "script-src 'self' http://localhost:5173 'unsafe-eval' 'unsafe-inline'",
        );
        expect(header).toContain("style-src 'self' 'unsafe-inline'");
        expect(header).toContain("img-src 'self' data:");
        expect(header).toContain(
            "connect-src 'self' http://localhost:5173 ws://localhost:5173 wss://localhost:5173",
        );
    });

    it("dev header with null host falls back to wildcard ws/wss in connect-src", () => {
        const header = build_csp_header("http://localhost:5173", null);
        expect(header).toContain("connect-src 'self' http://localhost:5173 ws://* wss://*");
    });

    it("prod header keeps strict self script-src without unsafe-inline", () => {
        const header = build_csp_header(null, null);
        expect(header).toContain("script-src 'self';");
        expect(header).not.toMatch(/unsafe-inline.*localhost/);
    });
});
