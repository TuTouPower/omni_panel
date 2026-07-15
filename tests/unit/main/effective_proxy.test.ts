import { describe, expect, it } from "vitest";
import { resolve_effective_proxy_url } from "../../../src/main/core/network/effective_proxy";

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
