import { describe, it, expect, vi, beforeAll } from "vitest";

// The handler captured from the plugin's definePlugin call
let captured_handler:
    | ((ctx: {
          params: Record<string, string>;
          http: {
              getJson: ReturnType<typeof vi.fn>;
              postJson: ReturnType<typeof vi.fn>;
              request: ReturnType<typeof vi.fn>;
          };
          language: string;
          t: (key: string) => string;
      }) => Promise<unknown>)
    | null = null;

// Must use @omni-usage/plugin-sdk alias (configured in vitest.config.mts)
vi.mock("@omni-usage/plugin-sdk", async () => {
    const actual = await vi.importActual("@omni-usage/plugin-sdk");
    return {
        ...(actual as Record<string, unknown>),
        definePlugin: (handler: unknown) => {
            captured_handler = handler as typeof captured_handler;
        },
    };
});

function make_http_mock() {
    return {
        getJson: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
        postJson: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
        request: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    };
}

function make_ctx(cookie_value: string, http_mock?: ReturnType<typeof make_http_mock>) {
    return {
        params: { SESSION_COOKIE: cookie_value },
        http: http_mock ?? make_http_mock(),
        language: "zh-Hans" as const,
        t: (key: string): string => {
            const map: Record<string, string> = {
                plan_quota: "套餐额度",
                compensation: "补偿积分",
                balance: "余额",
                invalid_response: "响应数据格式异常",
                expired: "已过期",
            };
            return map[key] ?? key;
        },
    };
}

interface TestItem {
    name: string;
    used: number | null;
    limit: number;
    resetAt?: string;
    status: string;
    color: string;
}

interface TestResult {
    success: boolean;
    items?: TestItem[];
    badge?: string;
    error?: { code: string; message: string };
}

describe("mimo-usage-plugin", () => {
    beforeAll(async () => {
        // Import triggers definePlugin which captures the handler
        await import("../../../assets/plugins/mimo-usage-plugin");
    });

    function get_handler() {
        if (!captured_handler) {
            throw new Error("Handler not captured — plugin import failed");
        }
        return captured_handler;
    }

    async function run(ctx: ReturnType<typeof make_ctx>): Promise<TestResult> {
        return get_handler()(ctx) as Promise<TestResult>;
    }

    it("throws MISSING_PARAM when SESSION_COOKIE is empty", async () => {
        expect(captured_handler).not.toBeNull();
        const ctx = make_ctx("");
        await expect(get_handler()(ctx as never)).rejects.toThrow("MISSING_PARAM:SESSION_COOKIE");
    });

    it("returns usage items and balance when all APIs succeed", async () => {
        const http = make_http_mock();
        http.getJson.mockImplementation((_endpoint: unknown, path: unknown) => {
            const p = path as string;
            if (p === "/api/v1/tokenPlan/usage") {
                return Promise.resolve({
                    ok: true,
                    value: {
                        code: 0,
                        data: {
                            usage: {
                                items: [
                                    {
                                        name: "plan_total_token",
                                        used: 75897117361,
                                        limit: 82000000000,
                                        percent: 93,
                                    },
                                    {
                                        name: "compensation_total_token",
                                        used: 24493506494,
                                        limit: 24493506494,
                                        percent: 100,
                                    },
                                ],
                            },
                        },
                    },
                });
            }
            if (p === "/api/v1/tokenPlan/detail") {
                return Promise.resolve({
                    ok: true,
                    value: {
                        code: 0,
                        data: {
                            planName: "Max",
                            currentPeriodEnd: "2026-06-27T23:59:00Z",
                            expired: false,
                        },
                    },
                });
            }
            if (p === "/api/v1/balance") {
                return Promise.resolve({
                    ok: true,
                    value: { code: 0, data: { balance: "-0.36" } },
                });
            }
            return Promise.resolve({ ok: false, error: { kind: "http", status: 404 } });
        });

        const ctx = make_ctx(
            "api-platform_serviceToken=abc; api-platform_slh=xyz; api-platform_ph=123",
            http,
        );
        const result = await run(ctx);

        expect(result.success).toBe(true);
        if (!result.success) return;

        expect(result.badge).toBe("Max");
        expect(result.items).toHaveLength(3);
        const items = result.items ?? [];

        const plan = items.find((i) => i.name === "套餐额度");
        expect(plan).toBeDefined();
        if (plan) {
            expect(plan.used).toBe(75897117361);
            expect(plan.limit).toBe(82000000000);
        }

        const comp = items.find((i) => i.name === "补偿积分");
        expect(comp).toBeDefined();
        if (comp) {
            expect(comp.used).toBe(24493506494);
        }

        const bal = items.find((i) => i.name.startsWith("余额"));
        expect(bal).toBeDefined();
        if (bal) {
            expect(bal.name).toBe("余额 -0.36");
            expect(bal.used).toBeNull();
            expect(bal.status).toBe("critical");
        }

        // Cookie header must be passed through
        for (const call of http.getJson.mock.calls) {
            const opts = call[2] as { headers?: { Cookie?: string } } | undefined;
            expect(opts?.headers?.Cookie).toContain("api-platform_serviceToken=abc");
            expect(opts?.headers?.Cookie).toContain("api-platform_slh=xyz");
            expect(opts?.headers?.Cookie).toContain("api-platform_ph=123");
        }
    });

    it("returns items but skips balance when balance API fails", async () => {
        const http = make_http_mock();
        http.getJson.mockImplementation((_endpoint: unknown, path: unknown) => {
            const p = path as string;
            if (p === "/api/v1/tokenPlan/usage") {
                return Promise.resolve({
                    ok: true,
                    value: {
                        code: 0,
                        data: {
                            usage: {
                                items: [
                                    {
                                        name: "plan_total_token",
                                        used: 100,
                                        limit: 1000,
                                        percent: 10,
                                    },
                                ],
                            },
                        },
                    },
                });
            }
            if (p === "/api/v1/tokenPlan/detail") {
                return Promise.resolve({
                    ok: true,
                    value: { code: 0, data: { planName: "Free" } },
                });
            }
            if (p === "/api/v1/balance") {
                return Promise.resolve({
                    ok: false,
                    error: { kind: "http" as const, status: 500 },
                });
            }
            return Promise.resolve({ ok: false, error: { kind: "http" as const, status: 404 } });
        });

        const ctx = make_ctx("api-platform_serviceToken=abc; api-platform_slh=xyz", http);
        const result = await run(ctx);

        expect(result.success).toBe(true);
        if (!result.success) return;
        const items = result.items ?? [];
        expect(items).toHaveLength(1);
        expect(items[0]?.name).toBe("套餐额度");
        expect(result.badge).toBe("Free");
    });

    it("returns HTTP_401 when main API returns 401", async () => {
        const http = make_http_mock();
        http.getJson.mockResolvedValue({
            ok: false,
            error: { kind: "http" as const, status: 401 },
        });

        const ctx = make_ctx("expired_cookie", http);
        const result = await run(ctx);

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("HTTP_401");
    });

    it("returns MIMO_PARSE_ERROR when usage code is not 0", async () => {
        const http = make_http_mock();
        http.getJson.mockImplementation((_endpoint: unknown, path: unknown) => {
            const p = path as string;
            if (p === "/api/v1/tokenPlan/usage") {
                return Promise.resolve({
                    ok: true,
                    value: { code: 1001, message: "invalid token" },
                });
            }
            if (p === "/api/v1/tokenPlan/detail") {
                return Promise.resolve({
                    ok: true,
                    value: { code: 0, data: { planName: "Free" } },
                });
            }
            return Promise.resolve({
                ok: false,
                error: { kind: "http" as const, status: 404 },
            });
        });

        const ctx = make_ctx("bad_cookie", http);
        const result = await run(ctx);

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("MIMO_PARSE_ERROR");
        expect(result.error?.message).toBe("invalid token");
    });
});
