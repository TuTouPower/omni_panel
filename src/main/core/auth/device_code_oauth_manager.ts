import { createLogger } from "../../../shared/lib/logger";
import type { VaultBackend } from "../vault/vault-backend";
import {
    DEVICE_CODE_GRANT,
    REFRESH_TOKEN_GRANT,
    type HttpPost,
    type DeviceCodeStart,
    type OAuthLoginResult,
    type LoginStatus,
    type RefreshResult,
    type AutoRefreshOptions,
    is_token_response,
    is_error_response,
    form_encode,
    to_error,
    make_default_http_post,
    load_tokens,
    store_tokens,
    clear_tokens,
    is_terminal_grant_error,
    REFRESH_MARGIN_MS,
    REFRESH_RETRY_DELAY_MS,
    MAX_REFRESH_RETRIES,
    MIN_REFRESH_DELAY_MS,
    MAX_TIMEOUT_MS,
    SLOW_DOWN_PENALTY_SECONDS,
    compute_expires_at,
} from "./oauth_helpers";

/**
 * 参数化 device-code OAuth manager（t339）：grok/kimi 的公共实现。
 *
 * 厂商差异全部收敛到 `DeviceCodeOAuthConfig`：
 * - endpoints / client_id / scope（grok 带 scope，kimi 不带）
 * - header builder（kimi 异步注入 device-id 等厂商头，grok 仅 Content-Type）
 * - log_name / provider_label（logger 与告警文案）
 *
 * 行为以 kimi（已实现 cancel/清理）为准对齐：logout 会 cancel 进行中的
 * device login 并清 retry 计数；stop_auto_refresh / shutdown 清 retry 计数。
 */

export interface DeviceCodeOAuthConfig {
    readonly log_name: string;
    readonly provider_label: string;
    readonly device_auth_url: string;
    readonly token_url: string;
    readonly client_id: string;
    /** 可选：存在则同时加入 device-login 与 refresh 请求体（grok 用法）。 */
    readonly scope?: string;
    /** 请求头构建（可异步读 device-id 等）。默认仅 Content-Type。 */
    readonly build_headers: () => Promise<Record<string, string>>;
}

export interface DeviceCodeOAuthManagerDeps {
    readonly vault: VaultBackend;
    readonly get_proxy_url?: () => string | undefined;
    /** Injectable HTTP transport for testing. Defaults to undici with optional proxy. */
    readonly http_post?: HttpPost;
}

export interface DeviceCodeOAuthManager {
    start_device_login(): Promise<DeviceCodeStart>;
    await_completion(
        device_code: string,
        interval: number,
        expires_at_epoch_ms: number,
        instance_id: string,
    ): Promise<OAuthLoginResult>;
    cancel_device_login(instance_id: string): void;
    get_login_status(instance_id: string): Promise<LoginStatus>;
    refresh_now(instance_id: string): Promise<RefreshResult>;
    logout(instance_id: string): Promise<void>;
    start_auto_refresh(instance_id: string, options?: AutoRefreshOptions): void;
    stop_auto_refresh(instance_id: string): void;
    reconcile_auto_refresh(instance_ids: readonly string[]): void;
    shutdown(): void;
}

export function create_device_code_oauth_manager(
    config: DeviceCodeOAuthConfig,
    deps: DeviceCodeOAuthManagerDeps,
): DeviceCodeOAuthManager {
    const log = createLogger(config.log_name);
    const http_post: HttpPost = deps.http_post ?? make_default_http_post();
    const auto_refresh_timers = new Map<string, ReturnType<typeof setTimeout>>();
    const auto_refresh_options = new Map<string, AutoRefreshOptions>();
    const enabled_auto_refresh_ids = new Set<string>();
    const retry_failure_counts = new Map<string, number>();
    const token_generations = new Map<string, number>();
    const token_mutation_tails = new Map<string, Promise<void>>();
    const refresh_in_flight = new Map<string, Promise<RefreshResult>>();
    const active_login_cancels = new Map<string, () => void>();

    async function post_form(
        url: string,
        pairs: readonly (readonly [string, string])[],
    ): Promise<unknown> {
        const body = form_encode(pairs);
        const headers = await config.build_headers();
        return http_post(url, body, headers, deps.get_proxy_url?.());
    }

    function device_login_pairs(): readonly (readonly [string, string])[] {
        return [
            ["client_id", config.client_id],
            ...(config.scope ? [["scope", config.scope] as const] : []),
        ];
    }

    function poll_pairs(device_code: string): readonly (readonly [string, string])[] {
        return [
            ["grant_type", DEVICE_CODE_GRANT],
            ["client_id", config.client_id],
            ["device_code", device_code],
        ];
    }

    function refresh_pairs(refresh_token: string): readonly (readonly [string, string])[] {
        return [
            ["grant_type", REFRESH_TOKEN_GRANT],
            ["client_id", config.client_id],
            ["refresh_token", refresh_token],
            ...(config.scope ? [["scope", config.scope] as const] : []),
        ];
    }

    function get_token_generation(instance_id: string): number {
        return token_generations.get(instance_id) ?? 0;
    }

    function advance_token_generation(instance_id: string): number {
        const next = get_token_generation(instance_id) + 1;
        token_generations.set(instance_id, next);
        return next;
    }

    function enqueue_token_mutation<T>(
        instance_id: string,
        mutation: () => Promise<T>,
    ): Promise<T> {
        const previous = token_mutation_tails.get(instance_id) ?? Promise.resolve();
        const operation = previous.then(mutation, mutation);
        const tail = operation.then(
            () => undefined,
            () => undefined,
        );
        token_mutation_tails.set(instance_id, tail);
        void tail.then(() => {
            if (token_mutation_tails.get(instance_id) === tail) {
                token_mutation_tails.delete(instance_id);
            }
        });
        return operation;
    }

    async function start_device_login(): Promise<DeviceCodeStart> {
        log.info("Starting device-code login");
        const response = await post_form(config.device_auth_url, device_login_pairs());
        if (typeof response !== "object" || response === null) {
            throw new Error("Invalid device-code response");
        }
        const r = response as Record<string, unknown>;
        const device_code = r["device_code"];
        const user_code = r["user_code"];
        const verification_uri = r["verification_uri"];
        if (
            typeof device_code !== "string" ||
            typeof user_code !== "string" ||
            typeof verification_uri !== "string"
        ) {
            throw new Error("device-code response missing required fields");
        }
        return {
            device_code,
            user_code,
            verification_uri,
            verification_uri_complete:
                typeof r["verification_uri_complete"] === "string"
                    ? r["verification_uri_complete"]
                    : null,
            expires_in: typeof r["expires_in"] === "number" ? r["expires_in"] : 1800,
            interval: typeof r["interval"] === "number" ? r["interval"] : 5,
        };
    }

    function poll_once(device_code: string): Promise<unknown> {
        return post_form(config.token_url, poll_pairs(device_code));
    }

    async function await_completion(
        device_code: string,
        interval: number,
        expires_at_epoch_ms: number,
        instance_id: string,
    ): Promise<OAuthLoginResult> {
        const generation = get_token_generation(instance_id);
        let current_interval = Math.max(1, interval);
        const cancelled_ref = { current: false };
        let sleep_timer: ReturnType<typeof setTimeout> | null = null;
        let sleep_resolver: (() => void) | null = null;

        // t340: 取消闭包在函数开头持久注册（而非仅 sleep 窗口内），使 HTTP 轮询
        // 窗口内 cancel_device_login 也生效；同时 clearTimeout 当前 sleep 并 resolve，
        // 使取消在 sleep 窗口内也能立即返回 {saved:false}。
        active_login_cancels.set(instance_id, () => {
            cancelled_ref.current = true;
            if (sleep_timer !== null) {
                clearTimeout(sleep_timer);
                sleep_timer = null;
            }
            if (sleep_resolver !== null) {
                const resolve = sleep_resolver;
                sleep_resolver = null;
                resolve();
            }
        });

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

        const cleanup = () => {
            active_login_cancels.delete(instance_id);
        };

        try {
            // First poll is immediate.
            let response = await poll_once(device_code);

            for (;;) {
                if (cancelled_ref.current) {
                    return { saved: false };
                }
                if (is_token_response(response)) {
                    const token_response = response;
                    return await enqueue_token_mutation(instance_id, async () => {
                        if (
                            generation !== get_token_generation(instance_id) ||
                            cancelled_ref.current
                        ) {
                            return { saved: false };
                        }
                        await store_tokens(deps.vault, instance_id, token_response);
                        advance_token_generation(instance_id);
                        log.info(`Device-code login succeeded for ${instance_id}`);
                        void schedule_auto_refresh_if_enabled(instance_id);
                        const expires_at = compute_expires_at(token_response);
                        return {
                            saved: true,
                            token: token_response.access_token,
                            ...(token_response.refresh_token
                                ? { refresh_token: token_response.refresh_token }
                                : {}),
                            ...(expires_at ? { expires_at } : {}),
                        };
                    });
                }
                if (!is_error_response(response)) {
                    throw new Error("Unexpected token endpoint response");
                }
                const err = response.error;
                if (err === "authorization_pending") {
                    // continue polling after interval
                } else if (err === "slow_down") {
                    current_interval += SLOW_DOWN_PENALTY_SECONDS;
                    log.warn(`Slow down received; interval now ${String(current_interval)}s`);
                } else if (err === "expired_token") {
                    throw new Error(
                        "expired_token: device code expired before user completed login",
                    );
                } else if (err === "access_denied") {
                    throw new Error("access_denied: user denied the authorization request");
                } else {
                    throw new Error(`OAuth error: ${err}`);
                }

                if (Date.now() >= expires_at_epoch_ms) {
                    throw new Error("device code expired before user completed login");
                }

                await sleep(current_interval * 1000);
                // cancelled_ref may be set to true by the cancel closure registered in sleep().
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                if (cancelled_ref.current) {
                    return { saved: false };
                }
                response = await poll_once(device_code);
            }
        } finally {
            cleanup();
        }
    }

    function cancel_device_login(instance_id: string): void {
        const cancel = active_login_cancels.get(instance_id);
        if (cancel) {
            cancel();
        }
    }

    async function get_login_status(instance_id: string): Promise<LoginStatus> {
        const stored = await load_tokens(deps.vault, instance_id);
        if (!stored.access) {
            return { has_token: false, expires_at: null, can_refresh: false };
        }
        return {
            has_token: true,
            expires_at: stored.expires_at,
            can_refresh: stored.refresh !== null,
        };
    }

    function refresh_now(instance_id: string): Promise<RefreshResult> {
        const current = refresh_in_flight.get(instance_id);
        if (current) {
            return current;
        }

        const generation = get_token_generation(instance_id);
        const refresh = (async (): Promise<RefreshResult> => {
            try {
                // t340: load_tokens 移入 try，vault 读失败不再落 unhandledRejection。
                const stored = await load_tokens(deps.vault, instance_id);
                if (!stored.refresh) {
                    log.warn(`refresh_now: no refresh_token stored for ${instance_id}`);
                    return { success: false, error: "no refresh_token stored" };
                }
                const response = await post_form(config.token_url, refresh_pairs(stored.refresh));
                return await enqueue_token_mutation(instance_id, async () => {
                    if (generation !== get_token_generation(instance_id)) {
                        return { success: false, error: "token state changed during refresh" };
                    }
                    if (is_error_response(response)) {
                        const err = response.error;
                        if (is_terminal_grant_error(err)) {
                            log.warn(
                                `refresh_now: refresh_token rejected (${err}); clearing tokens for ${instance_id}`,
                            );
                            await clear_tokens(deps.vault, instance_id);
                            advance_token_generation(instance_id);
                            cancel_auto_refresh_timer(instance_id);
                            return { success: false, error: err };
                        }
                        return { success: false, error: err };
                    }
                    if (!is_token_response(response)) {
                        return { success: false, error: "unexpected token response shape" };
                    }
                    await store_tokens(deps.vault, instance_id, response);
                    advance_token_generation(instance_id);
                    log.info(`refresh_now: refreshed tokens for ${instance_id}`);
                    void schedule_auto_refresh_if_enabled(instance_id);
                    return { success: true };
                });
            } catch (error) {
                const msg = to_error(error).message;
                log.error(`refresh_now failed for ${instance_id}: ${msg}`);
                return { success: false, error: msg };
            }
        })();

        refresh_in_flight.set(instance_id, refresh);
        void refresh.finally(() => {
            if (refresh_in_flight.get(instance_id) === refresh) {
                refresh_in_flight.delete(instance_id);
            }
        });
        return refresh;
    }

    // t339: logout 对齐 kimi —— cancel 进行中的 device login 并清 retry 计数。
    async function logout(instance_id: string): Promise<void> {
        log.info(`logout: clearing OAuth tokens for ${instance_id}`);
        cancel_device_login(instance_id);
        cancel_auto_refresh_timer(instance_id);
        retry_failure_counts.delete(instance_id);
        await enqueue_token_mutation(instance_id, async () => {
            advance_token_generation(instance_id);
            await clear_tokens(deps.vault, instance_id);
        });
    }

    function cancel_auto_refresh_timer(instance_id: string): void {
        const timer = auto_refresh_timers.get(instance_id);
        if (!timer) return;
        clearTimeout(timer);
        auto_refresh_timers.delete(instance_id);
    }

    function schedule_retry(instance_id: string): void {
        if (!enabled_auto_refresh_ids.has(instance_id)) return;
        cancel_auto_refresh_timer(instance_id);
        const failures = (retry_failure_counts.get(instance_id) ?? 0) + 1;
        if (failures > MAX_REFRESH_RETRIES) {
            log.error(
                `${config.provider_label} OAuth refresh gave up after ${String(MAX_REFRESH_RETRIES)} consecutive non-terminal failures for ${instance_id}`,
            );
            retry_failure_counts.delete(instance_id);
            return;
        }
        retry_failure_counts.set(instance_id, failures);
        const timer = setTimeout(() => {
            auto_refresh_timers.delete(instance_id);
            void refresh_now(instance_id)
                .then((result) => {
                    if (result.success) {
                        retry_failure_counts.delete(instance_id);
                    } else if (!is_terminal_grant_error(result.error ?? "")) {
                        schedule_retry(instance_id);
                    }
                })
                .catch((error: unknown) => {
                    log.error(
                        `auto_refresh: refresh failed in retry timer for ${instance_id}: ${to_error(error).message}`,
                    );
                });
        }, REFRESH_RETRY_DELAY_MS);
        auto_refresh_timers.set(instance_id, timer);
    }

    // t340: 整体 try/catch，vault 读失败时不产生 unhandled rejection，
    // 记录含 instance_id 的错误日志并保留 instance 待下次调度。
    async function schedule_auto_refresh_if_enabled(instance_id: string): Promise<void> {
        try {
            cancel_auto_refresh_timer(instance_id);
            if (!enabled_auto_refresh_ids.has(instance_id)) return;

            const stored = await load_tokens(deps.vault, instance_id);
            if (!enabled_auto_refresh_ids.has(instance_id) || !stored.refresh) return;
            cancel_auto_refresh_timer(instance_id);

            const refresh_before_ms =
                auto_refresh_options.get(instance_id)?.refresh_before_ms ?? REFRESH_MARGIN_MS;
            const expires_at_epoch = stored.expires_at ? Number(stored.expires_at) : NaN;
            const delay_ms = Number.isFinite(expires_at_epoch)
                ? Math.max(MIN_REFRESH_DELAY_MS, expires_at_epoch - refresh_before_ms - Date.now())
                : REFRESH_RETRY_DELAY_MS;
            const needs_replan = delay_ms > MAX_TIMEOUT_MS;
            const timer = setTimeout(
                () => {
                    auto_refresh_timers.delete(instance_id);
                    if (needs_replan) {
                        void schedule_auto_refresh_if_enabled(instance_id);
                        return;
                    }
                    void refresh_now(instance_id)
                        .then((result) => {
                            if (!result.success && !is_terminal_grant_error(result.error ?? "")) {
                                schedule_retry(instance_id);
                            }
                        })
                        .catch((error: unknown) => {
                            log.error(
                                `auto_refresh: refresh failed in schedule timer for ${instance_id}: ${to_error(error).message}`,
                            );
                        });
                },
                Math.min(delay_ms, MAX_TIMEOUT_MS),
            );
            auto_refresh_timers.set(instance_id, timer);
            log.debug(
                `auto_refresh: scheduled ${instance_id} in ${String(Math.min(delay_ms, MAX_TIMEOUT_MS))}ms`,
            );
        } catch (error) {
            const msg = to_error(error).message;
            log.error(`auto_refresh: failed to schedule for ${instance_id}: ${msg}`);
        }
    }

    function start_auto_refresh(instance_id: string, options?: AutoRefreshOptions): void {
        enabled_auto_refresh_ids.add(instance_id);
        if (options) auto_refresh_options.set(instance_id, options);
        void schedule_auto_refresh_if_enabled(instance_id);
    }

    // t339: stop_auto_refresh 对齐 kimi —— 清 retry 计数。
    function stop_auto_refresh(instance_id: string): void {
        enabled_auto_refresh_ids.delete(instance_id);
        auto_refresh_options.delete(instance_id);
        retry_failure_counts.delete(instance_id);
        cancel_auto_refresh_timer(instance_id);
    }

    function reconcile_auto_refresh(instance_ids: readonly string[]): void {
        const active_ids = new Set(instance_ids);
        for (const instance_id of enabled_auto_refresh_ids) {
            if (!active_ids.has(instance_id)) {
                stop_auto_refresh(instance_id);
            }
        }
        for (const instance_id of active_ids) {
            enabled_auto_refresh_ids.add(instance_id);
            void schedule_auto_refresh_if_enabled(instance_id);
        }
    }

    // t339: shutdown 对齐 kimi —— 清 retry 计数。
    function shutdown(): void {
        enabled_auto_refresh_ids.clear();
        auto_refresh_options.clear();
        retry_failure_counts.clear();
        for (const instance_id of auto_refresh_timers.keys()) {
            cancel_auto_refresh_timer(instance_id);
        }
        log.info("shutdown: all auto-refresh timers stopped");
    }

    return {
        start_device_login,
        await_completion,
        cancel_device_login,
        get_login_status,
        refresh_now,
        logout,
        start_auto_refresh,
        stop_auto_refresh,
        reconcile_auto_refresh,
        shutdown,
    };
}
