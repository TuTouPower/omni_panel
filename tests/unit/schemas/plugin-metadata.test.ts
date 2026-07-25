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
        const methods = ["apikey", "oauth_device", "web_login", "cpa_mgmt", "local_cli"] as const;
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
});
