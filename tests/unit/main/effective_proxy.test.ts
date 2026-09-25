import { describe, expect, it } from "vitest";
import {
    resolve_effective_proxy_url,
    proxy_config_changed,
    parse_pac_proxy_result,
    is_valid_proxy_url,
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

    it("uses the detected system proxy when no proxy is configured and use_system_proxy is true", () => {
        expect(resolve_effective_proxy_url(undefined, "http://system.example:7890", true)).toBe(
            "http://system.example:7890",
        );
    });

    it("ignores detected system proxy when use_system_proxy is false", () => {
        expect(
            resolve_effective_proxy_url(undefined, "http://system.example:7890", false),
        ).toBeUndefined();
    });

    it("returns undefined when proxy URL is invalid", () => {
        expect(resolve_effective_proxy_url("invalid-url", undefined)).toBeUndefined();
    });

    // A14 / AC-001: 校验非法协议，仅接受 http/https/socks5
    it("AC-001: rejects invalid protocols and malformed URLs", () => {
        expect(is_valid_proxy_url("ftp://proxy.example:21")).toBe(false);
        expect(is_valid_proxy_url("ws://proxy.example:8080")).toBe(false);
        expect(is_valid_proxy_url("javascript:alert(1)")).toBe(false);
        expect(is_valid_proxy_url("http://valid.example:8080")).toBe(true);
        expect(is_valid_proxy_url("https://valid.example:8080")).toBe(true);
        expect(is_valid_proxy_url("socks5://valid.example:1080")).toBe(true);

        expect(resolve_effective_proxy_url("ftp://bad:21", undefined)).toBeUndefined();
    });

    it("returns undefined when neither proxy is available", () => {
        expect(resolve_effective_proxy_url(undefined, undefined)).toBeUndefined();
    });
});

describe("parse_pac_proxy_result", () => {
    it("parses SOCKS5 and SOCKS PAC results", () => {
        expect(parse_pac_proxy_result("SOCKS5 127.0.0.1:1080")).toBe("socks5://127.0.0.1:1080");
        expect(parse_pac_proxy_result("SOCKS 127.0.0.1:1080; DIRECT")).toBe(
            "socks5://127.0.0.1:1080",
        );
    });

    it("parses PROXY and HTTP PAC results", () => {
        expect(parse_pac_proxy_result("PROXY 127.0.0.1:7890")).toBe("http://127.0.0.1:7890");
        expect(parse_pac_proxy_result("HTTP 127.0.0.1:7890")).toBe("http://127.0.0.1:7890");
    });

    it("returns undefined for DIRECT", () => {
        expect(parse_pac_proxy_result("DIRECT")).toBeUndefined();
        expect(parse_pac_proxy_result("")).toBeUndefined();
    });
});

describe("is_valid_proxy_url", () => {
    it("accepts http, https, and socks5 urls", () => {
        expect(is_valid_proxy_url("http://127.0.0.1:7890")).toBe(true);
        expect(is_valid_proxy_url("https://proxy.example:8443")).toBe(true);
        expect(is_valid_proxy_url("socks5://127.0.0.1:1080")).toBe(true);
    });

    it("rejects invalid or unsafe schemes", () => {
        expect(is_valid_proxy_url("file:///etc/passwd")).toBe(false);
        expect(is_valid_proxy_url("javascript:alert(1)")).toBe(false);
        expect(is_valid_proxy_url("not-a-url")).toBe(false);
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
