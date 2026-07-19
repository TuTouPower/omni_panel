import { request as undici_request } from "undici";
import { createLogger } from "../../../shared/lib/logger";
import { keyFor } from "../config/secrets-store";
import { get_proxy_agent } from "../network/proxy-pool";
import type { VaultBackend } from "../vault/vault-backend";

const log = createLogger("grok-oauth");

/**
 * Public Grok CLI OAuth constants — pulled from the multi-provider-usage-widget
 * reference (Rust) and the xAI OIDC discovery document. These are *public*
 * client identifiers/endpoints, never secrets.
 */
export const GROK_DEVICE_AUTH_URL = "https://auth.x.ai/oauth2/device/code";
export const GROK_TOKEN_URL = "https://auth.x.ai/oauth2/token";
export const GROK_CLIENT_ID = "b1a00492-073a-47ea-816f-4c329264a828";
export const GROK_SCOPE = "offline_access grok-cli:access";

const DEVICE_CODE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";
const REFRESH_TOKEN_GRANT = "refresh_token";

const OAUTH_TOKEN_KEY = "OAUTH_TOKEN";
const OAUTH_REFRESH_TOKEN_KEY = "OAUTH_REFRESH_TOKEN";
const OAUTH_EXPIRES_AT_KEY = "OAUTH_EXPIRES_AT";

const SLOW_DOWN_PENALTY_SECONDS = 5;
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const REFRESH_RETRY_DELAY_MS = 60 * 1000;
// A16: cap consecutive refresh retries so a permanently-failing token (e.g. xAI
// 5xx storm) doesn't poll every 60s forever. Terminal grant errors already
// stop; this bounds non-terminal failures.
const MAX_REFRESH_RETRIES = 10;
const MIN_REFRESH_DELAY_MS = 1000;
const MAX_TIMEOUT_MS = 2_147_483_647;

export type HttpPost = (
    url: string,
    body: string,
    headers: Record<string, string>,
    proxy_url?: string,
) => Promise<unknown>;

export interface GrokOAuthManagerDeps {
    readonly vault: VaultBackend;
    readonly get_proxy_url?: () => string | undefined;
    /** Injectable HTTP transport for testing. Defaults to undici with optional proxy. */
    readonly http_post?: HttpPost;
}

export interface DeviceCodeStart {
    readonly device_code: string;
    readonly user_code: string;
    readonly verification_uri: string;
    readonly verification_uri_complete: string | null;
    readonly expires_in: number;
    readonly interval: number;
}

export interface OAuthLoginResult {
    readonly saved: boolean;
}

export interface LoginStatus {
    readonly has_token: boolean;
    readonly expires_at: string | null;
    readonly can_refresh: boolean;
}

export interface RefreshResult {
    readonly success: boolean;
    readonly error?: string;
}

export interface AutoRefreshOptions {
    readonly refresh_before_ms?: number;
}

export interface GrokOAuthManager {
    start_device_login(): Promise<DeviceCodeStart>;
    await_completion(
        device_code: string,
        interval: number,
        expires_at_epoch_ms: number,
        instance_id: string,
    ): Promise<OAuthLoginResult>;
    get_login_status(instance_id: string): Promise<LoginStatus>;
    refresh_now(instance_id: string): Promise<RefreshResult>;
    logout(instance_id: string): Promise<void>;
    start_auto_refresh(instance_id: string, options?: AutoRefreshOptions): void;
    stop_auto_refresh(instance_id: string): void;
    reconcile_auto_refresh(instance_ids: readonly string[]): void;
    shutdown(): void;
}

interface TokenResponse {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
}

interface TokenErrorResponse {
    error: string;
    error_description?: string;
}

function is_token_response(v: unknown): v is TokenResponse {
    if (typeof v !== "object" || v === null) return false;
    const obj = v as Record<string, unknown>;
    return typeof obj["access_token"] === "string";
}

function is_error_response(v: unknown): v is TokenErrorResponse {
    if (typeof v !== "object" || v === null) return false;
    const obj = v as Record<string, unknown>;
    return typeof obj["error"] === "string";
}

function form_encode(pairs: readonly (readonly [string, string])[]): string {
    return pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
}

function to_error(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
}

function make_default_http_post(): HttpPost {
    return async (url, body, headers, proxy_url) => {
        // Shared process-level ProxyAgent (pooled by proxy URL). Reusing the
        // agent restores TCP/TLS connection reuse across refreshes; lifecycle is
        // managed centrally at shutdown, so no per-request close here.
        const dispatcher = proxy_url ? get_proxy_agent(proxy_url) : undefined;
        const response = await undici_request(url, {
            method: "POST",
            headers,
            body,
            headersTimeout: 15_000,
            bodyTimeout: 15_000,
            ...(dispatcher ? { dispatcher } : {}),
        });
        const text = await response.body.text();
        if (text.length === 0) {
            return {};
        }
        try {
            return JSON.parse(text) as unknown;
        } catch {
            // Some OAuth error responses may be non-JSON; surface the raw text.
            throw new Error(`Non-JSON response from ${url}: ${text.slice(0, 200)}`);
        }
    };
}

interface StoredTokens {
    access: string | null;
    refresh: string | null;
    expires_at: string | null;
}

async function load_tokens(vault: VaultBackend, instance_id: string): Promise<StoredTokens> {
    const access = await vault.get(keyFor(instance_id, OAUTH_TOKEN_KEY));
    const refresh = await vault.get(keyFor(instance_id, OAUTH_REFRESH_TOKEN_KEY));
    const expires_at = await vault.get(keyFor(instance_id, OAUTH_EXPIRES_AT_KEY));
    return { access, refresh, expires_at };
}

async function store_tokens(
    vault: VaultBackend,
    instance_id: string,
    tokens: TokenResponse,
): Promise<void> {
    await vault.set(keyFor(instance_id, OAUTH_TOKEN_KEY), tokens.access_token);
    // Refresh token rotation: store the new refresh_token if returned; otherwise
    // keep the existing one (some servers do not return a new refresh_token).
    if (tokens.refresh_token) {
        await vault.set(keyFor(instance_id, OAUTH_REFRESH_TOKEN_KEY), tokens.refresh_token);
    }
    if (typeof tokens.expires_in === "number") {
        const expires_at_epoch = Date.now() + tokens.expires_in * 1000;
        await vault.set(keyFor(instance_id, OAUTH_EXPIRES_AT_KEY), String(expires_at_epoch));
    }
}

async function clear_tokens(vault: VaultBackend, instance_id: string): Promise<void> {
    await vault.delete(keyFor(instance_id, OAUTH_TOKEN_KEY));
    await vault.delete(keyFor(instance_id, OAUTH_REFRESH_TOKEN_KEY));
    await vault.delete(keyFor(instance_id, OAUTH_EXPIRES_AT_KEY));
}

function is_terminal_grant_error(error: string): boolean {
    return (
        error === "invalid_grant" ||
        error === "refresh_token_expired" ||
        error === "refresh_token_reused" ||
        error === "refresh_token_invalidated"
    );
}

export function create_grok_oauth_manager(deps: GrokOAuthManagerDeps): GrokOAuthManager {
    const http_post: HttpPost = deps.http_post ?? make_default_http_post();
    const auto_refresh_timers = new Map<string, ReturnType<typeof setTimeout>>();
    const auto_refresh_options = new Map<string, AutoRefreshOptions>();
    const enabled_auto_refresh_ids = new Set<string>();
    const retry_failure_counts = new Map<string, number>();
    const token_generations = new Map<string, number>();
    const token_mutation_tails = new Map<string, Promise<void>>();
    const refresh_in_flight = new Map<string, Promise<RefreshResult>>();

    function form_headers(): Record<string, string> {
        return { "Content-Type": "application/x-www-form-urlencoded" };
    }

    async function post_form(
        url: string,
        pairs: readonly (readonly [string, string])[],
    ): Promise<unknown> {
        const body = form_encode(pairs);
        return http_post(url, body, form_headers(), deps.get_proxy_url?.());
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
        const response = await post_form(GROK_DEVICE_AUTH_URL, [
            ["client_id", GROK_CLIENT_ID],
            ["scope", GROK_SCOPE],
        ]);
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
        return post_form(GROK_TOKEN_URL, [
            ["grant_type", DEVICE_CODE_GRANT],
            ["client_id", GROK_CLIENT_ID],
            ["device_code", device_code],
        ]);
    }

    async function await_completion(
        device_code: string,
        interval: number,
        expires_at_epoch_ms: number,
        instance_id: string,
    ): Promise<OAuthLoginResult> {
        const generation = get_token_generation(instance_id);
        let current_interval = Math.max(1, interval);
        const sleep = (ms: number) =>
            new Promise<void>((resolve) => {
                const timer = setTimeout(() => {
                    resolve();
                }, ms);
                timer.unref();
            });

        // First poll is immediate.
        let response = await poll_once(device_code);

        for (;;) {
            if (is_token_response(response)) {
                const token_response = response;
                return enqueue_token_mutation(instance_id, async () => {
                    if (generation !== get_token_generation(instance_id)) {
                        return { saved: false };
                    }
                    await store_tokens(deps.vault, instance_id, token_response);
                    advance_token_generation(instance_id);
                    log.info(`Device-code login succeeded for ${instance_id}`);
                    void schedule_auto_refresh_if_enabled(instance_id);
                    return { saved: true };
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
                throw new Error("expired_token: device code expired before user completed login");
            } else if (err === "access_denied") {
                throw new Error("access_denied: user denied the authorization request");
            } else {
                throw new Error(`OAuth error: ${err}`);
            }

            if (Date.now() >= expires_at_epoch_ms) {
                throw new Error("device code expired before user completed login");
            }

            await sleep(current_interval * 1000);
            response = await poll_once(device_code);
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
            const stored = await load_tokens(deps.vault, instance_id);
            if (!stored.refresh) {
                log.warn(`refresh_now: no refresh_token stored for ${instance_id}`);
                return { success: false, error: "no refresh_token stored" };
            }
            try {
                const response = await post_form(GROK_TOKEN_URL, [
                    ["grant_type", REFRESH_TOKEN_GRANT],
                    ["client_id", GROK_CLIENT_ID],
                    ["refresh_token", stored.refresh],
                    ["scope", GROK_SCOPE],
                ]);
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

    async function logout(instance_id: string): Promise<void> {
        log.info(`logout: clearing OAuth tokens for ${instance_id}`);
        cancel_auto_refresh_timer(instance_id);
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
                `Grok OAuth refresh gave up after ${String(MAX_REFRESH_RETRIES)} consecutive non-terminal failures for ${instance_id}`,
            );
            retry_failure_counts.delete(instance_id);
            return;
        }
        retry_failure_counts.set(instance_id, failures);
        const timer = setTimeout(() => {
            auto_refresh_timers.delete(instance_id);
            void refresh_now(instance_id).then((result) => {
                if (result.success) {
                    retry_failure_counts.delete(instance_id);
                } else if (!is_terminal_grant_error(result.error ?? "")) {
                    schedule_retry(instance_id);
                }
            });
        }, REFRESH_RETRY_DELAY_MS);
        auto_refresh_timers.set(instance_id, timer);
    }

    async function schedule_auto_refresh_if_enabled(instance_id: string): Promise<void> {
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
                void refresh_now(instance_id).then((result) => {
                    if (!result.success && !is_terminal_grant_error(result.error ?? "")) {
                        schedule_retry(instance_id);
                    }
                });
            },
            Math.min(delay_ms, MAX_TIMEOUT_MS),
        );
        auto_refresh_timers.set(instance_id, timer);
        log.debug(
            `auto_refresh: scheduled ${instance_id} in ${String(Math.min(delay_ms, MAX_TIMEOUT_MS))}ms`,
        );
    }

    function start_auto_refresh(instance_id: string, options?: AutoRefreshOptions): void {
        enabled_auto_refresh_ids.add(instance_id);
        if (options) auto_refresh_options.set(instance_id, options);
        void schedule_auto_refresh_if_enabled(instance_id);
    }

    function stop_auto_refresh(instance_id: string): void {
        enabled_auto_refresh_ids.delete(instance_id);
        auto_refresh_options.delete(instance_id);
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

    function shutdown(): void {
        enabled_auto_refresh_ids.clear();
        auto_refresh_options.clear();
        for (const instance_id of auto_refresh_timers.keys()) {
            cancel_auto_refresh_timer(instance_id);
        }
        log.info("shutdown: all auto-refresh timers stopped");
    }

    return {
        start_device_login,
        await_completion,
        get_login_status,
        refresh_now,
        logout,
        start_auto_refresh,
        stop_auto_refresh,
        reconcile_auto_refresh,
        shutdown,
    };
}
