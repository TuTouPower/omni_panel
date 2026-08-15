import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { addTransport } from "../../../src/shared/lib/logger";
import {
    create_device_code_oauth_manager,
    __testing_retry_failure_counts,
    type DeviceCodeOAuthConfig,
} from "../../../src/main/core/auth/device_code_oauth_manager";
import {
    create_grok_oauth_manager,
    GROK_DEVICE_AUTH_URL,
    GROK_TOKEN_URL,
} from "../../../src/main/core/auth/grok_oauth_manager";
import {
    create_kimi_oauth_manager,
    KIMI_DEVICE_AUTH_URL,
    KIMI_TOKEN_URL,
} from "../../../src/main/core/auth/kimi_oauth_manager";
import type { VaultBackend } from "../../../src/main/core/vault/vault-backend";

// t339：验证参数化共享 manager 的「对齐」行为——logout/stop_auto_refresh/shutdown
// 与 kimi 原实现一致（cancel 进行中 device login + 清 retry 计数 + 取消定时器）。

function create_vault(): VaultBackend & { values: Map<string, string> } {
    const values = new Map<string, string>();
    return {
        values,
        get(key: string) {
            return Promise.resolve(values.get(key) ?? null);
        },
        set(key: string, value: string) {
            values.set(key, value);
            return Promise.resolve();
        },
        delete(key: string) {
            values.delete(key);
            return Promise.resolve();
        },
        has(key: string) {
            return Promise.resolve(values.has(key));
        },
        list_keys(prefix?: string) {
            return Promise.resolve(
                [...values.keys()].filter((key) => (prefix ? key.startsWith(prefix) : true)),
            );
        },
        replaceAll(entries: Record<string, string>) {
            values.clear();
            for (const [key, value] of Object.entries(entries)) values.set(key, value);
            return Promise.resolve();
        },
    };
}

interface HttpCall {
    url: string;
    body: string;
}

function create_http_mock(config: DeviceCodeOAuthConfig): {
    calls: HttpCall[];
    post: (
        url: string,
        body: string,
        headers: Record<string, string>,
        proxy_url?: string,
    ) => Promise<unknown>;
} {
    const calls: HttpCall[] = [];
    return {
        calls,
        post(url: string, body: string) {
            calls.push({ url, body });
            if (url === config.device_auth_url) {
                return Promise.resolve({
                    device_code: "dc-shared",
                    user_code: "ABCD-EFGH",
                    verification_uri: "https://example.com/device",
                    expires_in: 1800,
                    interval: 5,
                });
            }
            if (url === config.token_url) {
                return Promise.resolve({ error: "authorization_pending" });
            }
            return Promise.reject(new Error(`unexpected URL: ${url}`));
        },
    };
}

const shared_config: DeviceCodeOAuthConfig = {
    log_name: "test-oauth",
    provider_label: "Test",
    device_auth_url: "https://example.com/device/code",
    token_url: "https://example.com/token",
    client_id: "test-client",
    scope: "test-scope",
    build_headers: () => Promise.resolve({ "Content-Type": "application/x-www-form-urlencoded" }),
};

describe("device_code_oauth_manager (t339 对齐)", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it("logout 取消进行中的 device login（对齐 kimi）", async () => {
        const vault = create_vault();
        const http = create_http_mock(shared_config);
        const manager = create_device_code_oauth_manager(shared_config, {
            vault,
            http_post: http.post,
        });

        const login = manager.await_completion("dc-align", 5, Date.now() + 1_800_000, "inst-align");
        // 首次 poll 返回 authorization_pending → 循环进入 sleep。
        await vi.waitFor(() => {
            expect(http.calls).toHaveLength(1);
        });
        await Promise.resolve();

        await manager.logout("inst-align");

        await expect(login).resolves.toEqual({ saved: false });
        await expect(vault.get("inst-align:OAUTH_TOKEN")).resolves.toBeNull();
        await expect(vault.get("inst-align:OAUTH_REFRESH_TOKEN")).resolves.toBeNull();
    });

    it("stop_auto_refresh 取消定时器且不再 refresh（对齐 kimi）", async () => {
        const vault = create_vault();
        vault.values.set("inst-stop:OAUTH_TOKEN", "access");
        vault.values.set("inst-stop:OAUTH_REFRESH_TOKEN", "refresh");
        vault.values.set("inst-stop:OAUTH_EXPIRES_AT", String(Date.now() - 1));
        const http = create_http_mock(shared_config);
        const manager = create_device_code_oauth_manager(shared_config, {
            vault,
            http_post: http.post,
        });

        manager.start_auto_refresh("inst-stop");
        await vi.advanceTimersByTimeAsync(0);
        const calls_before_stop = http.calls.length;

        manager.stop_auto_refresh("inst-stop");
        await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

        // 定时器已取消：stop 后不再有新请求。
        expect(http.calls.length).toBe(calls_before_stop);
    });

    it("grok 与 kimi 两个工厂的 logout 对齐产生相同副作用", async () => {
        const grok_vault = create_vault();
        const grok = create_http_mock({
            ...shared_config,
            device_auth_url: GROK_DEVICE_AUTH_URL,
            token_url: GROK_TOKEN_URL,
        });
        const grok_manager = create_grok_oauth_manager({ vault: grok_vault, http_post: grok.post });
        const grok_login = grok_manager.await_completion(
            "dc-grok",
            5,
            Date.now() + 1_800_000,
            "grok-align",
        );
        await vi.waitFor(() => {
            expect(grok.calls).toHaveLength(1);
        });
        await grok_manager.logout("grok-align");
        await expect(grok_login).resolves.toEqual({ saved: false });
        await expect(grok_vault.get("grok-align:OAUTH_TOKEN")).resolves.toBeNull();

        const kimi_vault = create_vault();
        const kimi = create_http_mock({
            ...shared_config,
            device_auth_url: KIMI_DEVICE_AUTH_URL,
            token_url: KIMI_TOKEN_URL,
        });
        const kimi_manager = create_kimi_oauth_manager({ vault: kimi_vault, http_post: kimi.post });
        const kimi_login = kimi_manager.await_completion(
            "dc-kimi",
            5,
            Date.now() + 1_800_000,
            "kimi-align",
        );
        await vi.waitFor(() => {
            expect(kimi.calls).toHaveLength(1);
        });
        await kimi_manager.logout("kimi-align");
        await expect(kimi_login).resolves.toEqual({ saved: false });
        await expect(kimi_vault.get("kimi-align:OAUTH_TOKEN")).resolves.toBeNull();
    });

    it("poll 窗口内 cancel_device_login 生效，取消后不落库（t340 AC-002）", async () => {
        const vault = create_vault();
        // 挂起的 token 响应：模拟 HTTP 轮询请求进行中 cancel。
        let resolve_token: ((v: unknown) => void) | undefined;
        const pending_token = new Promise<unknown>((resolve) => {
            resolve_token = resolve;
        });
        let poll_started = false;
        const http = create_http_mock(shared_config);
        const manager = create_device_code_oauth_manager(shared_config, {
            vault,
            http_post: async (url: string, body: string) => {
                if (url === shared_config.token_url) {
                    poll_started = true;
                    return pending_token;
                }
                return http.post(url, body, {});
            },
        });

        const login = manager.await_completion("dc-poll", 5, Date.now() + 1_800_000, "inst-poll");
        // 首次 poll 请求已发出且挂起（HTTP 轮询窗口内）。
        await vi.waitFor(() => {
            expect(poll_started).toBe(true);
        });

        manager.cancel_device_login("inst-poll");
        resolve_token?.({
            access_token: "access-late",
            refresh_token: "refresh-late",
            expires_in: 3600,
        });

        await expect(login).resolves.toEqual({ saved: false });
        // 取消后即使 token 响应晚到，也不写入 vault。
        await expect(vault.get("inst-poll:OAUTH_TOKEN")).resolves.toBeNull();
        await expect(vault.get("inst-poll:OAUTH_REFRESH_TOKEN")).resolves.toBeNull();
    });

    it("vault 读失败时 schedule 不产生 unhandled rejection 且记录含 instance_id 日志（t340 AC-001）", async () => {
        const vault = create_vault();
        vault.get = () => Promise.reject(new Error("vault read boom"));
        const http = create_http_mock(shared_config);
        const manager = create_device_code_oauth_manager(shared_config, {
            vault,
            http_post: http.post,
        });

        const unhandled: unknown[] = [];
        const on_unhandled = (reason: unknown) => {
            unhandled.push(reason);
        };
        const logs: { level: string; message: string }[] = [];
        const remove_transport = addTransport({
            write(level, _module, message) {
                logs.push({ level, message });
            },
        });
        process.on("unhandledRejection", on_unhandled);
        try {
            manager.start_auto_refresh("inst-vault-fail");
            await vi.advanceTimersByTimeAsync(1000);
            // 若 schedule 内部未 catch，load_tokens 的 rejection 会落 unhandledRejection。
            await Promise.resolve();
            expect(unhandled).toHaveLength(0);
            // AC-001 分句 b：记录含 instance_id 的错误日志。
            expect(
                logs.some((l) => l.level === "error" && l.message.includes("inst-vault-fail")),
            ).toBe(true);
        } finally {
            remove_transport();
            process.off("unhandledRejection", on_unhandled);
        }
    });

    // t394 AC-002：logout/stop_auto_refresh/shutdown 三处清 retry_failure_counts。
    // 删除任一清理代码测试即失败（探针断言残留），防测试假绿。
    function retry_manager(instance_id: string): {
        manager: ReturnType<typeof create_device_code_oauth_manager>;
        vault: ReturnType<typeof create_vault>;
    } {
        const vault = create_vault();
        vault.values.set(`${instance_id}:OAUTH_TOKEN`, "access");
        vault.values.set(`${instance_id}:OAUTH_REFRESH_TOKEN`, "refresh");
        vault.values.set(`${instance_id}:OAUTH_EXPIRES_AT`, String(Date.now() - 1));
        const http = create_http_mock(shared_config);
        const manager = create_device_code_oauth_manager(shared_config, {
            vault,
            http_post: async (url: string, body: string) => {
                // 非终态刷新错误（server_error）：触发 retry 计数，不落 terminal 清 token 分支。
                if (url === shared_config.token_url) return { error: "server_error" };
                return http.post(url, body, {});
            },
        });
        return { manager, vault };
    }

    async function trigger_retry(
        manager: ReturnType<typeof create_device_code_oauth_manager>,
        instance_id: string,
    ): Promise<void> {
        manager.start_auto_refresh(instance_id);
        await vi.advanceTimersByTimeAsync(1000);
        await vi.advanceTimersByTimeAsync(0);
    }

    it("logout 清 retry_failure_counts（t394 AC-002）", async () => {
        const { manager } = retry_manager("inst-lg");
        await trigger_retry(manager, "inst-lg");
        expect(__testing_retry_failure_counts(manager).get("inst-lg")).toBe(1);

        await manager.logout("inst-lg");
        expect(__testing_retry_failure_counts(manager).has("inst-lg")).toBe(false);
    });

    it("stop_auto_refresh 清 retry_failure_counts（t394 AC-002）", async () => {
        const { manager } = retry_manager("inst-sr");
        await trigger_retry(manager, "inst-sr");
        expect(__testing_retry_failure_counts(manager).get("inst-sr")).toBe(1);

        manager.stop_auto_refresh("inst-sr");
        expect(__testing_retry_failure_counts(manager).has("inst-sr")).toBe(false);
    });

    it("shutdown 清全部 retry_failure_counts（t394 AC-002）", async () => {
        const { manager, vault } = retry_manager("inst-sd-a");
        vault.values.set("inst-sd-b:OAUTH_TOKEN", "access");
        vault.values.set("inst-sd-b:OAUTH_REFRESH_TOKEN", "refresh");
        vault.values.set("inst-sd-b:OAUTH_EXPIRES_AT", String(Date.now() - 1));
        await trigger_retry(manager, "inst-sd-a");
        await trigger_retry(manager, "inst-sd-b");
        expect(__testing_retry_failure_counts(manager).get("inst-sd-a")).toBe(1);
        expect(__testing_retry_failure_counts(manager).get("inst-sd-b")).toBe(1);

        manager.shutdown();
        expect(__testing_retry_failure_counts(manager).size).toBe(0);
    });
});
