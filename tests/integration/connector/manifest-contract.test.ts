import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { load_manifest } from "../../../src/main/core/connector/manifest-loader";
import { connectorProviderSchema } from "../../../src/shared/schemas/manifest";

const CONNECTORS_DIR = join(process.cwd(), "connectors");

const EXPECTED_PROVIDERS = {
    deepseek: { secret_param: "API_KEY", label: "API 密钥" },
    glm: { secret_param: "API_KEY", label: "API 密钥" },
    gemini: { secret_param: "API_KEY", label: "API 密钥" },
    tavily: { secret_param: "API_KEY", label: "API 密钥" },
    firecrawl: { secret_param: "API_KEY", label: "API 密钥" },
    minimax: { secret_param: "API_KEY", label: "API 密钥" },
    mimo: { secret_param: "SESSION_COOKIE", label: "登录 Cookie" },
    kimi: { secret_param: "SESSION_COOKIE", label: "登录 Cookie" },
    opencode_go: { secret_param: "SESSION_COOKIE", label: "登录 Cookie" },
} as const;

describe("connector manifest contract", () => {
    for (const [provider, expected] of Object.entries(EXPECTED_PROVIDERS)) {
        describe(`${provider} connector`, () => {
            it("manifest loads and declares required secret parameter", async () => {
                const manifest = await load_manifest(join(CONNECTORS_DIR, provider));
                expect(manifest, `${provider} manifest must exist and be valid`).not.toBeNull();
                if (!manifest) return;

                expect(manifest.provider).toBe(provider);

                const secret_param = manifest.parameters.find(
                    (p) => p.name === expected.secret_param,
                );
                expect(
                    secret_param,
                    `${provider} must declare ${expected.secret_param}`,
                ).toBeDefined();
                expect(secret_param?.type).toBe("secret");
                expect(secret_param?.required).toBe(true);
                expect(secret_param?.exposeToScript).toBe(true);
                expect(secret_param?.["label@zh-Hans"]).toBe(expected.label);
            });
        });
    }

    it("all UI-exposed API key providers have connectors", async () => {
        const api_key_providers = ["deepseek", "glm", "gemini", "tavily", "firecrawl", "minimax"];
        for (const provider of api_key_providers) {
            const manifest = await load_manifest(join(CONNECTORS_DIR, provider));
            expect(manifest, `${provider} connector missing`).not.toBeNull();
        }
    });

    it("all UI-exposed session providers have connectors", async () => {
        const session_providers = ["mimo", "kimi", "opencode_go"];
        for (const provider of session_providers) {
            const manifest = await load_manifest(join(CONNECTORS_DIR, provider));
            expect(manifest, `${provider} connector missing`).not.toBeNull();
        }
    });

    it("local providers have connectors with local capability", async () => {
        const local_providers = ["claude", "codex", "antigravity"];
        for (const provider of local_providers) {
            const manifest = await load_manifest(join(CONNECTORS_DIR, provider));
            expect(manifest, `${provider} connector missing`).not.toBeNull();
            if (!manifest) continue;
            expect(manifest.capabilities).toContain("local");
            expect(manifest.local?.paths.length).toBeGreaterThan(0);
        }
    });

    it("all connector providers must belong to connectorProviderSchema", async () => {
        const entries = await readdir(CONNECTORS_DIR, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const manifest = await load_manifest(join(CONNECTORS_DIR, entry.name));
            if (!manifest) continue;
            expect(
                connectorProviderSchema.safeParse(manifest.provider).success,
                `Connector ${entry.name} has invalid provider "${manifest.provider}"`,
            ).toBe(true);
        }
    });

    it("no test-* connectors exist in connectors directory", async () => {
        const entries = await readdir(CONNECTORS_DIR, { withFileTypes: true });
        const test_dirs = entries.filter((e) => e.isDirectory() && e.name.startsWith("test-"));
        expect(test_dirs, "test-* connectors must not exist in connectors/").toHaveLength(0);
    });

    it("manifest provider string is validated against connectorProviderSchema", () => {
        const invalid = connectorProviderSchema.safeParse("test-observe");
        expect(invalid.success).toBe(false);

        const valid_claude = connectorProviderSchema.safeParse("claude");
        expect(valid_claude.success).toBe(true);

        const valid_cpa = connectorProviderSchema.safeParse("cpa");
        expect(valid_cpa.success).toBe(true);
    });
});
