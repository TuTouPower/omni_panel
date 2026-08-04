import { describe, expect, it } from "vitest";
import {
    resolve_effective_proxy_url,
    proxy_config_changed,
} from "../../../src/main/core/network/effective_proxy";

describe("resolve_effective_proxy_url", () => {
    it("prefers the configured proxy over the detected system proxy", () => {
        expect(
            resolve_effective_proxy_url(
                "http://configured.example:8080",
                "http://system.example:7890",
            ),
        ).toBe("http://configured.example:8080");
    });

    it("uses the detected system proxy when no proxy is configured", () => {
        expect(resolve_effective_proxy_url(undefined, "http://system.example:7890")).toBe(
            "http://system.example:7890",
        );
    });

    it("returns undefined when neither proxy is available", () => {
        expect(resolve_effective_proxy_url(undefined, undefined)).toBeUndefined();
    });
});

describe("proxy_config_changed (t195 AC5)", () => {
    it("detects a change from undefined to a configured proxy", () => {
        expect(proxy_config_changed(undefined, { url: "http://p:8080" })).toBe(true);
    });

    it("detects a URL change", () => {
        expect(proxy_config_changed({ url: "http://a:8080" }, { url: "http://b:8080" })).toBe(true);
    });

    it("detects a noProxy change", () => {
        expect(
            proxy_config_changed(
                { url: "http://a:8080", noProxy: ["example.com"] },
                { url: "http://a:8080" },
            ),
        ).toBe(true);
    });

    it("returns false when both are undefined or value-equal", () => {
        expect(proxy_config_changed(undefined, undefined)).toBe(false);
        expect(
            proxy_config_changed(
                { url: "http://a:8080", noProxy: ["x"] },
                { url: "http://a:8080", noProxy: ["x"] },
            ),
        ).toBe(false);
    });
});
