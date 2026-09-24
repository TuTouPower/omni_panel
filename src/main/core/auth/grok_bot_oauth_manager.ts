import { createHash, randomBytes, randomUUID } from "node:crypto";
import { shell } from "electron";
import { request as undici_request } from "undici";
import { createLogger } from "../../../shared/lib/logger";
import { keyFor } from "../config/secrets-store";
import { get_proxy_agent } from "../network/proxy-pool";
import type { VaultBackend } from "../vault/vault-backend";

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
    readonly verifier: string;
}

export interface GrokBotLoginResult {
    readonly saved: boolean;
    readonly token?: string | undefined;
    readonly refresh_token?: string | undefined;
    readonly error?: string | undefined;
}

export interface GrokBotRefreshResult {
    readonly ok: boolean;
    readonly access_token?: string | undefined;
    readonly error?: string | undefined;
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
}

export interface GrokBotOAuthManager {
    start_login(): Promise<GrokBotPkceStart>;
    await_completion(
        instance_id: string,
        uuid: string,
        verifier: string,
        timeout_ms?: number,
    ): Promise<GrokBotLoginResult>;
    cancel_login(instance_id: string): void;
    refresh_now(instance_id: string): Promise<GrokBotRefreshResult>;
    logout(instance_id: string): Promise<void>;
    shutdown(): void;
}

function default_http_get(proxy_url?: string) {
    return async (url: string, headers: Record<string, string> = {}) => {
        const dispatcher = proxy_url ? get_proxy_agent(proxy_url) : undefined;
        const res = await undici_request(url, {
            method: "GET",
            headers,
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

    const get_get_fn = () => deps.http_get ?? default_http_get(deps.get_proxy_url?.());
    const get_post_fn = () => deps.http_post ?? default_http_post(deps.get_proxy_url?.());
    const open_external = deps.open_external ?? ((u: string) => shell.openExternal(u));

    async function start_login(): Promise<GrokBotPkceStart> {
        const verifier = randomBytes(32).toString("base64url");
        const challenge = createHash("sha256").update(verifier).digest("base64url");
        const uuid = randomUUID();
        const auth_url = `${GROK_BOT_LOGIN_URL}?challenge=${challenge}&uuid=${uuid}&mode=login&redirectTarget=cli`;

        try {
            await open_external(auth_url);
        } catch (err) {
            log.warn(`Failed to open external browser for Grok Bot login: ${String(err)}`);
        }

        return { auth_url, uuid, verifier };
    }

    async function await_completion(
        instance_id: string,
        uuid: string,
        verifier: string,
        timeout_ms = 180_000,
    ): Promise<GrokBotLoginResult> {
        const cancel_state = { is_cancelled: false };
        let sleep_timer: NodeJS.Timeout | null = null;
        let sleep_resolver: (() => void) | null = null;

        active_cancels.set(instance_id, () => {
            cancel_state.is_cancelled = true;
            if (sleep_timer !== null) {
                clearTimeout(sleep_timer);
                sleep_timer = null;
            }
            if (sleep_resolver !== null) {
                sleep_resolver();
                sleep_resolver = null;
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

        const start_time = Date.now();
        const poll_url = `${GROK_BOT_BACKEND}${GROK_BOT_POLL_PATH}?uuid=${encodeURIComponent(uuid)}&verifier=${encodeURIComponent(verifier)}`;
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
                            await deps.vault.set(
                                keyFor(instance_id, ACCESS_TOKEN_SECRET),
                                access_token,
                            );
                            if (refresh_token) {
                                await deps.vault.set(
                                    keyFor(instance_id, REFRESH_TOKEN_SECRET),
                                    refresh_token,
                                );
                            }
                            log.info(`Grok Bot login succeeded for instance ${instance_id}`);
                            return { saved: true, token: access_token, refresh_token };
                        }
                    }
                } catch (poll_err) {
                    log.debug(`Poll attempt failed: ${String(poll_err)}`);
                }

                await sleep(1500);
            }

            if (cancel_state.is_cancelled) {
                return { saved: false, error: "已取消登录" };
            }
            return { saved: false, error: "登录授权超时，请重试" };
        } finally {
            active_cancels.delete(instance_id);
        }
    }

    function cancel_login(instance_id: string): void {
        active_cancels.get(instance_id)?.();
        active_cancels.delete(instance_id);
    }

    async function refresh_now(instance_id: string): Promise<GrokBotRefreshResult> {
        const refresh_token = await deps.vault.get(keyFor(instance_id, REFRESH_TOKEN_SECRET));
        if (!refresh_token?.trim()) {
            return { ok: false, error: "未找到有效的刷新令牌 (REFRESH_TOKEN)" };
        }

        const token_url = `${GROK_BOT_BACKEND}${GROK_BOT_TOKEN_PATH}`;
        const http_post = get_post_fn();

        try {
            const body = JSON.stringify({
                client_id: GROK_BOT_CLIENT_ID,
                grant_type: "refresh_token",
                refresh_token: refresh_token.trim(),
            });
            const res = await http_post(token_url, body, { "Content-Type": "application/json" });

            if (res.status === 200 && res.data && typeof res.data === "object") {
                const json = res.data as Record<string, unknown>;
                const new_access_token =
                    typeof json["access_token"] === "string" ? json["access_token"] : undefined;
                const new_refresh_token =
                    typeof json["refresh_token"] === "string" ? json["refresh_token"] : undefined;

                if (new_access_token) {
                    await deps.vault.set(
                        keyFor(instance_id, ACCESS_TOKEN_SECRET),
                        new_access_token,
                    );
                    if (new_refresh_token) {
                        await deps.vault.set(
                            keyFor(instance_id, REFRESH_TOKEN_SECRET),
                            new_refresh_token,
                        );
                    }
                    log.info(`Grok Bot token refreshed successfully for instance ${instance_id}`);
                    return { ok: true, access_token: new_access_token };
                }
            }

            const err_msg =
                typeof res.data === "object" && res.data !== null && "error" in res.data
                    ? String((res.data as Record<string, unknown>)["error"])
                    : `HTTP ${String(res.status)}`;
            return { ok: false, error: `换票被拒: ${err_msg}` };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { ok: false, error: `换票异常: ${message}` };
        }
    }

    async function logout(instance_id: string): Promise<void> {
        cancel_login(instance_id);
        await deps.vault.delete(keyFor(instance_id, ACCESS_TOKEN_SECRET));
        await deps.vault.delete(keyFor(instance_id, REFRESH_TOKEN_SECRET));
    }

    function shutdown(): void {
        for (const cancel of active_cancels.values()) {
            cancel();
        }
        active_cancels.clear();
    }

    return {
        start_login,
        await_completion,
        cancel_login,
        refresh_now,
        logout,
        shutdown,
    };
}
