import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { load_manifest } from "../../../src/main/core/connector/manifest-loader";
import { run_connector } from "../../../src/main/core/connector/runtime";
import type { ConnectorContext } from "../../../src/main/core/connector/host-io";

const ROOT = join(process.cwd(), "connectors", "kimi_web");
const fixture = async (name: string): Promise<unknown> =>
    JSON.parse(
        await readFile(
            join(process.cwd(), "docs/spikes/s036_kimi_web_quota_pump/code", name),
            "utf8",
        ),
    ) as unknown;
function context(payload: unknown, authorization = "Bearer fixture-token"): ConnectorContext {
    return {
        params: { SESSION_COOKIE: "session=fixture", AUTHORIZATION: authorization },
        http: {
            post_json: vi.fn().mockResolvedValue(payload),
            get_json: vi.fn(),
            get_raw: vi.fn(),
        },
        files: { read: vi.fn(), list: vi.fn() },
        log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        status: {
            for_pct: (n) => (n >= 90 ? "critical" : n >= 70 ? "warning" : "normal"),
            for_ratio: () => "normal",
            for_balance: () => "normal",
        },
        report_failed_account: vi.fn(),
    };
}
async function code() {
    return readFile(join(ROOT, "connector.ts"), "utf8");
}

describe("kimi_web connector", () => {
    it("declares session web_login and emits 5h, weekly, and month metrics", async () => {
        const manifest = await load_manifest(ROOT);
        expect(manifest?.auth).toEqual({
            method: "web_login",
            secret_name: "SESSION_COOKIE",
            login_url: "https://www.kimi.com/settings/subscription?tab=quota",
        });
        const ctx = context(await fixture("GetSubscriptionStats.json"));
        if (!manifest) throw new Error("kimi_web manifest missing");
        const result = await run_connector(manifest, await code(), ctx);
        expect(result.error).toBeNull();
        expect(result.observations.map((item) => [item.window, item.raw_label])).toEqual([
            ["second", "five_hour"],
            ["week", "seven_day"],
            ["month", "monthly"],
        ]);
        expect(result.observations[2]?.used).toBe(0.42);
        // eslint-disable-next-line @typescript-eslint/unbound-method
        const post_json = vi.mocked(ctx.http.post_json);
        expect(post_json).toHaveBeenCalledTimes(1);
        expect(post_json.mock.calls[0]?.slice(0, 3)).toEqual([
            "default",
            "/apiv2/kimi.gateway.membership.v2.MembershipService/GetSubscriptionStats",
            {},
        ]);
        expect(post_json.mock.calls[0]?.[3]).toMatchObject({
            headers: { Cookie: "session=fixture", Authorization: "Bearer fixture-token" },
        });
    });

    it("surfaces expired/missing Bearer instead of silently succeeding", async () => {
        const manifest = await load_manifest(ROOT);
        if (!manifest) throw new Error("kimi_web manifest missing");
        const result = await run_connector(
            manifest,
            await code(),
            context(await fixture("GetSubscriptionStats.json"), ""),
        );
        expect(result.observations).toHaveLength(0);
        expect(result.error).toMatch(/Bearer|重新打开网页登录/);
    });
});
