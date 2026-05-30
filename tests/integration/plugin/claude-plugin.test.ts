import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { withHttpStub } from "./_helpers/http_stub";
import type { HttpStubRoute } from "./_helpers/http_stub";
import { runBundledPlugin } from "./_helpers/plugin_test_harness";

const PLUGIN = "claude-usage-plugin.ts";

const temp_dirs: string[] = [];

function make_temp_home(): string {
    const dir = mkdtempSync(join(tmpdir(), "claude-test-"));
    temp_dirs.push(dir);
    return dir;
}

function write_credentials(home_dir: string, token: string): void {
    const claude_dir = join(home_dir, ".claude");
    mkdirSync(claude_dir, { recursive: true });
    writeFileSync(
        join(claude_dir, ".credentials.json"),
        JSON.stringify({ claudeAiOauth: { accessToken: token } }),
        "utf-8",
    );
}

function oauth_success_body(): unknown {
    return {
        plan_type: "pro",
        five_hour: { utilization: 25.5, resets_at: "2026-06-01T00:00:00Z" },
        seven_day: { utilization: 40.0, resets_at: "2026-06-08T00:00:00Z" },
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

describe("Claude plugin subprocess", () => {
    it("returns NETWORK_ERROR when DATA_DIR does not exist", async () => {
        const home_dir = make_temp_home();
        const { parsed } = await runBundledPlugin({
            pluginFile: PLUGIN,
            params: { DATA_DIR: join(home_dir, "nonexistent") },
            env: { HOME: home_dir, USERPROFILE: home_dir },
        });

        expect(parsed.success).toBe(false);
        if (parsed.success) return;

        // Plugin uses failFromHttp({ kind: "network", message: no_data_dir })
        expect(parsed.error.code).toBe("NETWORK_ERROR");
    });

    it("returns NETWORK_ERROR (login_hint) when no credentials file exists", async () => {
        const home_dir = make_temp_home();
        // Create .claude dir but no .credentials.json
        mkdirSync(join(home_dir, ".claude"), { recursive: true });

        const { parsed } = await runBundledPlugin({
            pluginFile: PLUGIN,
            params: { DATA_DIR: join(home_dir, ".claude"), PLAN: "pro" },
            env: { HOME: home_dir, USERPROFILE: home_dir },
        });

        expect(parsed.success).toBe(false);
        if (parsed.success) return;

        // Plugin uses failFromHttp({ kind: "network", message: login_hint })
        expect(parsed.error.code).toBe("NETWORK_ERROR");
        expect(parsed.error.message).toContain("登录凭证");
    });

    it("returns success with items when OAuth endpoint returns usage data", async () => {
        const home_dir = make_temp_home();
        write_credentials(home_dir, "fake-token-123");

        const routes: HttpStubRoute[] = [{ path: "/api/oauth/usage", body: oauth_success_body() }];

        const { parsed } = await withHttpStub(routes, async (handle) => {
            const env = {
                HOME: home_dir,
                USERPROFILE: home_dir,
                OMNI_PLUGIN_ENDPOINTS: JSON.stringify({
                    anthropic: handle.baseUrl,
                }),
            };
            return runBundledPlugin({
                pluginFile: PLUGIN,
                params: {
                    DATA_DIR: join(home_dir, ".claude"),
                    PLAN: "pro",
                },
                env,
            });
        });

        expect(parsed.success).toBe(true);
        if (!parsed.success) return;

        expect(parsed.items.length).toBeGreaterThanOrEqual(2);
        expect(parsed.items.some((item) => item.id === "claude-five-hour")).toBe(true);
        expect(parsed.items.some((item) => item.id === "claude-seven-day")).toBe(true);
    });

    it("returns HTTP_401 when OAuth endpoint returns 401", async () => {
        const home_dir = make_temp_home();
        write_credentials(home_dir, "expired-token");

        const routes: HttpStubRoute[] = [
            { path: "/api/oauth/usage", status: 401, body: { error: "unauthorized" } },
        ];

        const { parsed } = await withHttpStub(routes, async (handle) => {
            const env = {
                HOME: home_dir,
                USERPROFILE: home_dir,
                OMNI_PLUGIN_ENDPOINTS: JSON.stringify({
                    anthropic: handle.baseUrl,
                }),
            };
            return runBundledPlugin({
                pluginFile: PLUGIN,
                params: {
                    DATA_DIR: join(home_dir, ".claude"),
                    PLAN: "pro",
                },
                env,
            });
        });

        expect(parsed.success).toBe(false);
        if (parsed.success) return;

        // Plugin returns failFromHttp({ kind: "http", status: 401, body: null })
        expect(parsed.error.code).toBe("HTTP_401");
    });
});
