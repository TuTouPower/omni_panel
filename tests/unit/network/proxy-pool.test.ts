import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
    get_proxy_agent,
    close_all_proxy_agents,
    sanitize_proxy_url,
} from "../../../src/main/core/network/proxy-pool";

describe("proxy-pool", () => {
    beforeEach(async () => {
        await close_all_proxy_agents();
    });

    afterEach(async () => {
        await close_all_proxy_agents();
    });

    it("reuses the same ProxyAgent for the same proxy URL", () => {
        const a = get_proxy_agent("http://proxy-a.example:8080");
        const b = get_proxy_agent("http://proxy-a.example:8080");
        expect(a).toBe(b);
    });

    it("creates distinct agents for different proxy URLs", () => {
        const a = get_proxy_agent("http://proxy-a.example:8080");
        const b = get_proxy_agent("http://proxy-b.example:8080");
        expect(a).not.toBe(b);
    });

    it("close_all clears the pool so next get returns a new agent", async () => {
        const a = get_proxy_agent("http://proxy-c.example:8080");
        await close_all_proxy_agents();
        const b = get_proxy_agent("http://proxy-c.example:8080");
        expect(b).not.toBe(a);
    });

    // A73 / AC-003: 密码脱敏测试
    it("AC-003: sanitizes username and password in proxy URL to prevent leakage", () => {
        const sanitized = sanitize_proxy_url("http://user:secret123@proxy.example:8080");
        expect(sanitized).toBe("http://***:***@proxy.example:8080/");
        expect(sanitized).not.toContain("secret123");
        expect(sanitized).not.toContain("user");

        // 没有凭据的代理 URL 保持原样
        expect(sanitize_proxy_url("http://proxy.example:8080")).toBe("http://proxy.example:8080/");
    });
});
