import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { pluginMetadataSchema } from "../../../src/shared/schemas/plugin-metadata";
import { authDescriptorSchema } from "../../../src/shared/schemas/auth";

describe("plugin-metadata auth descriptor", () => {
    const valid_auth = {
        method: "apikey",
        secret_name: "API_KEY",
    };

    it("accepts a valid auth block", () => {
        const result = authDescriptorSchema.safeParse(valid_auth);
        expect(result.success).toBe(true);
    });

    it("rejects auth block without secret_name", () => {
        const result = authDescriptorSchema.safeParse({ method: "apikey" });
        expect(result.success).toBe(false);
    });

    it("rejects auth block with empty secret_name", () => {
        const result = authDescriptorSchema.safeParse({ method: "apikey", secret_name: "" });
        expect(result.success).toBe(false);
    });

    it("rejects auth block with method outside enum", () => {
        const result = authDescriptorSchema.safeParse({
            method: "unknown",
            secret_name: "API_KEY",
        });
        expect(result.success).toBe(false);
    });

    it("accepts all valid auth methods", () => {
        const methods = [
            "apikey",
            "oauth_device",
            "web_login",
            "cpa_mgmt",
            "local_cli",
            "oauth_pkce",
        ] as const;
        for (const method of methods) {
            const result = authDescriptorSchema.safeParse({ method, secret_name: "X" });
            expect(result.success).toBe(true);
        }
    });

    it("accepts optional extra_fields", () => {
        const result = authDescriptorSchema.safeParse({
            method: "apikey",
            secret_name: "SERVICE_KEY",
            extra_fields: ["API_KEY_ID"],
        });
        expect(result.success).toBe(true);
    });

    it("accepts optional login_url when it is a valid url", () => {
        const result = authDescriptorSchema.safeParse({
            method: "web_login",
            secret_name: "SESSION_COOKIE",
            login_url: "https://example.com/auth",
        });
        expect(result.success).toBe(true);
    });

    it("rejects invalid login_url", () => {
        const result = authDescriptorSchema.safeParse({
            method: "web_login",
            secret_name: "SESSION_COOKIE",
            login_url: "not-a-url",
        });
        expect(result.success).toBe(false);
    });
});

describe("pluginMetadataSchema with auth", () => {
    const base = {
        schemaVersion: 1,
        name: "test",
        parameters: [],
    };

    it("accepts metadata without auth", () => {
        const result = pluginMetadataSchema.safeParse(base);
        expect(result.success).toBe(true);
    });

    it("accepts metadata with valid auth", () => {
        const result = pluginMetadataSchema.safeParse({
            ...base,
            auth: {
                method: "oauth_device",
                secret_name: "OAUTH_TOKEN",
            },
        });
        expect(result.success).toBe(true);
    });

    it("rejects metadata with invalid auth", () => {
        const result = pluginMetadataSchema.safeParse({
            ...base,
            auth: { method: "apikey" },
        });
        expect(result.success).toBe(false);
    });

    // A78 / AC-002: pluginResultSchema 边界校验测试
    it("AC-002: pluginResultSchema rejects malformed observations and non-contract dirty data", async () => {
        const { pluginResultSchema } = await import("../../../src/shared/schemas/plugin-output");

        const valid_payload = {
            success: true,
            schemaVersion: 2,
            updatedAt: "2026-09-25T12:00:00Z",
            items: [
                {
                    id: "test:m1",
                    provider: "claude",
                    source: "poll",
                    sourceInstanceId: "inst-1",
                    accountId: "acc-1",
                    accountLabel: "Acc 1",
                    raw_label: "5h",
                    normalized_label: "5 Hours",
                    used: 50,
                    limit: 100,
                    displayStyle: "ratio",
                    resetAt: null,
                    observedAt: 1234567890,
                    stale: false,
                },
            ],
        };
        expect(pluginResultSchema.safeParse(valid_payload).success).toBe(true);

        // 脏数据 1: used 为 NaN / 字符串
        const dirty_used = {
            ...valid_payload,
            items: [{ ...valid_payload.items[0], used: "dirty_number" }],
        };
        expect(pluginResultSchema.safeParse(dirty_used).success).toBe(false);

        // 脏数据 2: 缺失必需字段 sourceInstanceId
        const missing_field = {
            ...valid_payload,
            items: [{ ...valid_payload.items[0], sourceInstanceId: undefined }],
        };
        expect(pluginResultSchema.safeParse(missing_field).success).toBe(false);
    });

    // A80 / AC-004: .env.example 包含全部连接器指引
    it("AC-004: .env.example contains configuration guides for all connectors", () => {
        const env_example = readFileSync(resolve(process.cwd(), "config/env/.env.example"), "utf8");
        expect(env_example).toContain("DEEPSEEK_API_KEY");
        expect(env_example).toContain("GLM_API_KEY");
        expect(env_example).toContain("MINIMAX_API_KEY");
        expect(env_example).toContain("TAVILY_API_KEY");
        expect(env_example).toContain("CPA_MGMT_URL");
        expect(env_example).toContain("Claude");
        expect(env_example).toContain("Grok");
        expect(env_example).toContain("MiMo");
        expect(env_example).toContain("Muse AI");
        expect(env_example).toContain("OpenCode Go");
    });
});
