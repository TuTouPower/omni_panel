import { createHash, randomBytes, randomUUID } from "node:crypto";
import { shell } from "electron";
import { request as undici_request } from "undici";
import { createLogger } from "../../../shared/lib/logger";
import { keyFor } from "../config/secrets-store";
import { get_proxy_agent } from "../network/proxy-pool";
import type { VaultBackend } from "../vault/vault-backend";
import type { GrokBotErrorCode } from "../../../shared/types/ipc";

const log = createLogger("grok-bot-oauth");

export const GROK_BOT_BACKEND = "https://api2.cursor.sh";
export const GROK_BOT_CLIENT_ID = "KbZUR41cY7W6zRSdpSUJ7I7mLYBKOCmB";
export const GROK_BOT_LOGIN_URL = "https://cursor.com/loginDeepControl";
export const GROK_BOT_POLL_PATH = "/auth/poll";
export const GROK_BOT_TOKEN_PATH = "/oauth/token";

export const ACCESS_TOKEN_SECRET = "ACCESS_TOKEN";
export const REFRESH_TOKEN_SECRET = "REFRESH_TOKEN";

export interface GrokBotPkceStart {
    readonly auth_url: string;
    readonly uuid: string;
    readonly login_id: string;
    readonly verifier?: string | undefined;
}

export interface GrokBotLoginResult {
    readonly saved: boolean;
    readonly token?: string | undefined;
    readonly refresh_token?: string | undefined;
    readonly error?: string | undefined;
    readonly code?: GrokBotErrorCode | undefined;
}

export interface GrokBotRefreshResult {
    readonly ok: boolean;
    readonly access_token?: string | undefined;
    readonly error?: string | undefined;
    readonly code?: GrokBotErrorCode | undefined;
}

export interface GrokBotOAuthManagerDeps {
    readonly vault: VaultBackend;
    readonly get_proxy_url?: () => string | undefined;
    readonly http_get?: (
        url: string,
        headers?: Record<string, string>,
    ) => Promise<{ status: number; data?: unknown }>;
    readonly http_post?: (
        url: string,
        body: string,
        headers?: Record<string, string>,
    ) => Promise<{ status: number; data?: unknown }>;
    readonly open_external?: (url: string) => Promise<void>;
    readonly on_token_expired?: (instance_id: string, reason: string) => void;
}

export interface GrokBotOAuthManager {
    start_login(): Promise<GrokBotPkceStart>;
    await_completion(
        instance_id: string,
        uuid: string,
        login_id_or_verifier: string,
        timeout_ms?: number,
    ): Promise<GrokBotLoginResult>;
    cancel_login(instance_id: string): void;
    refresh_now(instance_id: string): Promise<GrokBotRefreshResult>;
    logout(instance_id: string): Promise<void>;
    schedule_refresh?(instance_id: string, interval_ms?: number): void;
    stop_scheduled_refresh?(instance_id: string): void;
    shutdown(): void;
}

function default_http_get(proxy_url?: string) {
    return async (url: string, headers: Record<string, string> = {}) => {
        const dispatcher = proxy_url ? get_proxy_agent(proxy_url) : undefined;
        const res = await undici_request(url, {
            method: "GET",
            headers,
            signal: AbortSignal.timeout(15_000),
            ...(dispatcher ? { dispatcher } : {}),
        });
        const text = await res.body.text();
        let data: unknown;
        try {
            data = JSON.parse(text);
        } catch {
            data = text;
        }
        return { status: res.statusCode, data };
    };
}

function default_http_post(proxy_url?: string) {
    return async (url: string, body: string, headers: Record<string, string> = {}) => {
        const dispatcher = proxy_url ? get_proxy_agent(proxy_url) : undefined;
        const res = await undici_request(url, {
            method: "POST",
            headers,
            body,
            signal: AbortSignal.timeout(15_000),
            ...(dispatcher ? { dispatcher } : {}),
        });
        const text = await res.body.text();
        let data: unknown;
        try {
            data = JSON.parse(text);
        } catch {
            data = text;
        }
        return { status: res.statusCode, data };
    };
}

export function create_grok_bot_oauth_manager(deps: GrokBotOAuthManagerDeps): GrokBotOAuthManager {
    const active_cancels = new Map<string, () => void>();
    const pending_verifiers = new Map<
        string,
        { verifier: string; uuid: string; created_at: number }
    >();
    const inflight_refreshes = new Map<string, Promise<GrokBotRefreshResult>>();
    const scheduled_refresh_timers = new Map<string, NodeJS.Timeout>();

    const get_get_fn = () => deps.http_get ?? default_http_get(deps.get_proxy_url?.());
    const get_post_fn = () => deps.http_post ?? default_http_post(deps.get_proxy_url?.());
    const open_external = deps.open_external ?? ((u: string) => shell.openExternal(u));

    // 定期清除过期的 pending_verifiers（超过 10 分钟）
    const clean_expired_verifiers = () => {
        const now = Date.now();
        for (const [key, item] of pending_verifiers.entries()) {
            if (now - item.created_at > 600_000) {
                pending_verifiers.delete(key);
            }
        }
    };

    async function start_login(): Promise<GrokBotPkceStart> {
        clean_expired_verifiers();
        const verifier = randomBytes(32).toString("base64url");
        const challenge = createHash("sha256").update(verifier).digest("base64url");
        const uuid = randomUUID();
        const login_id = randomUUID();
        const auth_url = `${GROK_BOT_LOGIN_URL}?challenge=${challenge}&uuid=${uuid}&mode=login&redirectTarget=cli`;

        // A12: verifier 保存在主进程内存中，不发给渲染层
        pending_verifiers.set(login_id, { verifier, uuid, created_at: Date.now() });

        try {
            await open_external(auth_url);
        } catch (err) {
            log.warn(`Failed to open external browser for Grok Bot login: ${String(err)}`);
            pending_verifiers.delete(login_id);
            throw new Error("BROWSER_OPEN_FAILED");
        }

        return { auth_url, uuid, login_id };
    }

    async function await_completion(
        instance_id: string,
        uuid: string,
        login_id_or_verifier: string,
        timeout_ms = 180_000,
    ): Promise<GrokBotLoginResult> {
        // A12: 优先按 login_id 提取主进程中持有的 verifier；回退兼容存量测试传入的 verifier
        const stored = pending_verifiers.get(login_id_or_verifier);
        let actual_verifier: string;
        if (stored) {
            actual_verifier = stored.verifier;
            pending_verifiers.delete(login_id_or_verifier);
        } else {
            actual_verifier = login_id_or_verifier;
        }

        // A5: 孤儿轮询防护与并发控制：若已有 active cancel，先将其终止
        if (active_cancels.has(instance_id)) {
            const previous_cancel = active_cancels.get(instance_id);
            if (previous_cancel) {
                previous_cancel();
            }
            active_cancels.delete(instance_id);
        }

        const cancel_state = { is_cancelled: false };
        let sleep_timer: NodeJS.Timeout | null = null;
        let sleep_resolver: (() => void) | null = null;

        const my_cancel = () => {
            cancel_state.is_cancelled = true;
            if (sleep_timer !== null) {
                clearTimeout(sleep_timer);
                sleep_timer = null;
            }
            if (sleep_resolver !== null) {
                sleep_resolver();
                sleep_resolver = null;
            }
        };
        active_cancels.set(instance_id, my_cancel);

        const sleep = (ms: number) =>
            new Promise<void>((resolve) => {
                const timer = setTimeout(() => {
                    if (sleep_timer === timer) sleep_timer = null;
                    if (sleep_resolver === resolve) sleep_resolver = null;
                    resolve();
                }, ms);
                timer.unref();
                sleep_timer = timer;
                sleep_resolver = resolve;
            });

        const start_time = Date.now();
        const poll_url = `${GROK_BOT_BACKEND}${GROK_BOT_POLL_PATH}?uuid=${encodeURIComponent(uuid)}&verifier=${encodeURIComponent(actual_verifier)}`;
        const http_get = get_get_fn();

        try {
            while (!cancel_state.is_cancelled && Date.now() - start_time < timeout_ms) {
                try {
                    const res = await http_get(poll_url, { "Content-Type": "application/json" });
                    if (res.status === 200 && res.data && typeof res.data === "object") {
                        const json = res.data as Record<string, unknown>;
                        const access_token =
                            typeof json["accessToken"] === "string"
                                ? json["accessToken"]
                                : undefined;
                        const refresh_token =
                            typeof json["refreshToken"] === "string"
                                ? json["refreshToken"]
                                : undefined;

                        if (access_token) {
                            // A22 & A23: 两步写入原子补偿与错误隔离
                            try {
                                if (refresh_token) {
                                    await deps.vault.set(
                                        keyFor(instance_id, REFRESH_TOKEN_SECRET),
                                        refresh_token,
                                    );
                                }
                                try {
                                    await deps.vault.set(
                                        keyFor(instance_id, ACCESS_TOKEN_SECRET),
                                        access_token,
                                    );
                                } catch (save_access_err) {
                                    if (refresh_token) {
                                        await deps.vault
                                            .delete(keyFor(instance_id, REFRESH_TOKEN_SECRET))
                                            .catch(() => undefined);
                                    }
                                    throw save_access_err;
                                }
                            } catch (vault_err) {
                                log.error(
                                    `Vault write failed for ${instance_id}: ${String(vault_err)}`,
                                );
                                return {
                                    saved: false,
                                    error: "凭据存储失败，请检查文件权限",
                                    code: "SAVE_FAILED",
                                };
                            }

                            log.info(`Grok Bot login succeeded for instance ${instance_id}`);
                            schedule_refresh(instance_id);
                            return { saved: true, token: access_token, refresh_token };
                        }
                    }
                } catch (poll_err) {
                    log.debug(`Poll attempt failed: ${String(poll_err)}`);
                }

                // A25: 轮询退避抖动
                const jitter = Math.floor(Math.random() * 500);
                await sleep(1500 + jitter);
            }

            if (cancel_state.is_cancelled) {
                return { saved: false, error: "已取消登录", code: "CANCELLED" };
            }
            return { saved: false, error: "登录授权超时，请重试", code: "POLL_TIMEOUT" };
        } finally {
            // 仅清理自身写入的 cancel 句柄
            if (active_cancels.get(instance_id) === my_cancel) {
                active_cancels.delete(instance_id);
            }
        }
    }

    function cancel_login(instance_id: string): void {
        active_cancels.get(instance_id)?.();
        active_cancels.delete(instance_id);
    }

    async function execute_refresh(instance_id: string): Promise<GrokBotRefreshResult> {
        const refresh_token = await deps.vault.get(keyFor(instance_id, REFRESH_TOKEN_SECRET));
        if (!refresh_token?.trim()) {
            return {
                ok: false,
                error: "未找到有效的刷新令牌 (REFRESH_TOKEN)",
                code: "REFRESH_FAILED",
            };
        }

        const token_url = `${GROK_BOT_BACKEND}${GROK_BOT_TOKEN_PATH}`;
        const http_post = get_post_fn();

        const do_post = async () => {
            const body = JSON.stringify({
                client_id: GROK_BOT_CLIENT_ID,
                grant_type: "refresh_token",
                refresh_token: refresh_token.trim(),
            });
            return http_post(token_url, body, { "Content-Type": "application/json" });
        };

        // A26: 单次失败自动重试 1 次（仅针对网络错误/5xx）
        let res: { status: number; data?: unknown };
        try {
            res = await do_post();
            if (res.status >= 500) {
                await new Promise((r) => setTimeout(r, 1000));
                res = await do_post();
            }
        } catch {
            try {
                await new Promise((r) => setTimeout(r, 1000));
                res = await do_post();
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { ok: false, error: `换票网络异常: ${message}`, code: "REFRESH_FAILED" };
            }
        }

        if (res.status === 200 && res.data && typeof res.data === "object") {
            const json = res.data as Record<string, unknown>;
            const new_access_token =
                typeof json["access_token"] === "string" ? json["access_token"] : undefined;
            const new_refresh_token =
                typeof json["refresh_token"] === "string" ? json["refresh_token"] : undefined;

            if (new_access_token) {
                try {
                    // A149: token 轮换处理：若服务端下发了新的 refresh token，先写入新的 refresh token
                    if (new_refresh_token) {
                        await deps.vault.set(
                            keyFor(instance_id, REFRESH_TOKEN_SECRET),
                            new_refresh_token,
                        );
                    }
                    try {
                        await deps.vault.set(
                            keyFor(instance_id, ACCESS_TOKEN_SECRET),
                            new_access_token,
                        );
                    } catch (save_err) {
                        if (new_refresh_token) {
                            // 失败补偿：恢复原 refresh_token
                            await deps.vault
                                .set(keyFor(instance_id, REFRESH_TOKEN_SECRET), refresh_token)
                                .catch(() => undefined);
                        }
                        throw save_err;
                    }
                } catch (vault_err) {
                    log.error(
                        `Vault write failed during refresh for ${instance_id}: ${String(vault_err)}`,
                    );
                    return { ok: false, error: "更新凭据存储失败", code: "SAVE_FAILED" };
                }

                log.info(`Grok Bot token refreshed successfully for instance ${instance_id}`);
                return { ok: true, access_token: new_access_token };
            }
        }

        // A27: 错误文案脱敏，不透传服务端内部敏感调试体
        const status_code = res.status;
        const safe_msg =
            status_code === 401 || status_code === 403
                ? "会话已过期，请重新登录"
                : `服务端拒绝换票 (HTTP ${String(status_code)})`;
        return { ok: false, error: safe_msg, code: "REFRESH_FAILED" };
    }

    // A6: 基于 instance_id 的 Promise 去重机制
    function refresh_now(instance_id: string): Promise<GrokBotRefreshResult> {
        const existing = inflight_refreshes.get(instance_id);
        if (existing) {
            return existing;
        }
        const promise = execute_refresh(instance_id).finally(() => {
            inflight_refreshes.delete(instance_id);
        });
        inflight_refreshes.set(instance_id, promise);
        return promise;
    }

    // A51: logout 并行删除 access 与 refresh 凭据
    async function logout(instance_id: string): Promise<void> {
        cancel_login(instance_id);
        stop_scheduled_refresh(instance_id);
        const results = await Promise.allSettled([
            deps.vault.delete(keyFor(instance_id, ACCESS_TOKEN_SECRET)),
            deps.vault.delete(keyFor(instance_id, REFRESH_TOKEN_SECRET)),
        ]);
        const rejected = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
        if (rejected) {
            throw rejected.reason;
        }
    }

    // A149: 后台定时刷新支持与失效告警
    function schedule_refresh(instance_id: string, interval_ms = 3_600_000): void {
        stop_scheduled_refresh(instance_id);
        const timer = setInterval(() => {
            void refresh_now(instance_id)
                .then((res) => {
                    if (!res.ok) {
                        log.warn(
                            `Scheduled refresh failed for ${instance_id}: ${res.error ?? "unknown"}`,
                        );
                        deps.on_token_expired?.(instance_id, res.error ?? "定时换票失败");
                    }
                })
                .catch((err: unknown) => {
                    log.warn(`Scheduled refresh crashed for ${instance_id}: ${String(err)}`);
                });
        }, interval_ms);
        timer.unref();
        scheduled_refresh_timers.set(instance_id, timer);
    }

    function stop_scheduled_refresh(instance_id: string): void {
        const timer = scheduled_refresh_timers.get(instance_id);
        if (timer) {
            clearInterval(timer);
            scheduled_refresh_timers.delete(instance_id);
        }
    }

    function shutdown(): void {
        for (const cancel of active_cancels.values()) {
            cancel();
        }
        active_cancels.clear();
        for (const timer of scheduled_refresh_timers.values()) {
            clearInterval(timer);
        }
        scheduled_refresh_timers.clear();
        pending_verifiers.clear();
        inflight_refreshes.clear();
    }

    return {
        start_login,
        await_completion,
        cancel_login,
        refresh_now,
        logout,
        schedule_refresh,
        stop_scheduled_refresh,
        shutdown,
    };
}
