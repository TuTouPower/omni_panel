import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { withHttpStub } from "./_helpers/http_stub";
import type { HttpStubRoute } from "./_helpers/http_stub";
import { runBundledPlugin } from "./_helpers/plugin_test_harness";

const PLUGIN = "codex-usage-plugin.ts";

const temp_dirs: string[] = [];

function make_temp_home(): string {
    const dir = mkdtempSync(join(tmpdir(), "codex-test-"));
    temp_dirs.push(dir);
    return dir;
}

function write_auth(home_dir: string, data: unknown): string {
    const codex_dir = join(home_dir, ".codex");
    mkdirSync(codex_dir, { recursive: true });
    const auth_path = join(codex_dir, "auth.json");
    writeFileSync(auth_path, JSON.stringify(data), "utf-8");
    return auth_path;
}

function usage_success_body(): unknown {
    return {
        plan_type: "pro",
        rate_limit: {
            primary_window: {
                used_percent: 30.5,
                reset_at: 1748736000,
            },
            secondary_window: {
                used_percent: 60.0,
                reset_at: 1749340800,
            },
        },
    };
}

afterAll(() => {
    for (const dir of temp_dirs) {
        try {
            rmSync(dir, { recursive: true, force: true });
        } catch {
            // best-effort cleanup
        }
    }
});

describe("Codex plugin subprocess", () => {
    it("returns NETWORK_ERROR when auth file does not exist", async () => {
        const home_dir = make_temp_home();
        // Create codex dir without auth.json
        mkdirSync(join(home_dir, ".codex"), { recursive: true });

        const { parsed } = await runBundledPlugin({
            pluginFile: PLUGIN,
            params: {
                AUTH_FILE: join(home_dir, ".codex", "auth.json"),
                DATA_DIR: join(home_dir, ".codex"),
                ENABLE_STATS: "false",
            },
            env: { HOME: home_dir, USERPROFILE: home_dir },
        });

        expect(parsed.success).toBe(false);
        if (parsed.success) return;

        // Plugin uses failFromHttp({ kind: "network", message: auth_file_not_found })
        expect(parsed.error.code).toBe("NETWORK_ERROR");
        expect(parsed.error.message).toContain("未找到认证文件");
    });

    it("returns NETWORK_ERROR (auth_token_missing) when auth file has no valid token", async () => {
        const home_dir = make_temp_home();
        write_auth(home_dir, { tokens: {} });

        const { parsed } = await runBundledPlugin({
            pluginFile: PLUGIN,
            params: {
                AUTH_FILE: join(home_dir, ".codex", "auth.json"),
                DATA_DIR: join(home_dir, ".codex"),
                ENABLE_STATS: "false",
            },
            env: { HOME: home_dir, USERPROFILE: home_dir },
        });

        expect(parsed.success).toBe(false);
        if (parsed.success) return;

        // Plugin uses failFromHttp({ kind: "network", message: auth_token_missing })
        expect(parsed.error.code).toBe("NETWORK_ERROR");
        expect(parsed.error.message).toContain("认证信息不完整");
    });

    it("returns success with items when endpoint returns usage data", async () => {
        const home_dir = make_temp_home();
        write_auth(home_dir, {
            tokens: {
                access_token: "fake-token",
                account_id: "account-123",
            },
        });

        const routes: HttpStubRoute[] = [
            { path: "/backend-api/wham/usage", body: usage_success_body() },
        ];

        const { parsed } = await withHttpStub(routes, async (handle) => {
            const env = {
                HOME: home_dir,
                USERPROFILE: home_dir,
                OMNI_SOURCE_INSTANCE_ID: "codex-oauth-test",
                OMNI_PLUGIN_ENDPOINTS: JSON.stringify({
                    default: handle.baseUrl,
                }),
            };
            return runBundledPlugin({
                pluginFile: PLUGIN,
                params: {
                    AUTH_FILE: join(home_dir, ".codex", "auth.json"),
                    DATA_DIR: join(home_dir, ".codex"),
                    ENABLE_STATS: "false",
                },
                env,
            });
        });

        expect(parsed.success).toBe(true);
        if (!parsed.success) return;

        expect(parsed.schemaVersion).toBe(2);
        expect(parsed.items.length).toBeGreaterThanOrEqual(2);
        expect(parsed.items).toContainEqual(
            expect.objectContaining({
                id: "codex-five-hour",
                provider: "codex",
                source: "oauth",
                sourceInstanceId: "codex-oauth-test",
                accountId: "codex-oauth-test",
                accountLabel: "Codex",
            }),
        );
        expect(parsed.items.some((item) => item.id === "codex-weekly")).toBe(true);
    });
});
