import { request as undici_request } from "undici";
import { keyFor } from "../config/secrets-store";
import { get_proxy_agent } from "../network/proxy-pool";
import type { VaultBackend } from "../vault/vault-backend";

export const DEVICE_CODE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";
export const REFRESH_TOKEN_GRANT = "refresh_token";

export const OAUTH_TOKEN_KEY = "OAUTH_TOKEN";
export const OAUTH_REFRESH_TOKEN_KEY = "OAUTH_REFRESH_TOKEN";
export const OAUTH_EXPIRES_AT_KEY = "OAUTH_EXPIRES_AT";

export const SLOW_DOWN_PENALTY_SECONDS = 5;
export const REFRESH_MARGIN_MS = 5 * 60 * 1000;
export const REFRESH_RETRY_DELAY_MS = 60 * 1000;
// A16: cap consecutive refresh retries so a permanently-failing token (e.g. upstream
// 5xx storm) doesn't poll every 60s forever. Terminal grant errors already stop;
// this bounds non-terminal failures.
export const MAX_REFRESH_RETRIES = 10;
export const MIN_REFRESH_DELAY_MS = 1000;
export const MAX_TIMEOUT_MS = 2_147_483_647;

export type HttpPost = (
    url: string,
    body: string,
    headers: Record<string, string>,
    proxy_url?: string,
) => Promise<unknown>;

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
    readonly token?: string;
    readonly refresh_token?: string;
    readonly expires_at?: string;
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

export interface TokenResponse {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
}

export interface TokenErrorResponse {
    error: string;
    error_description?: string;
}

export interface StoredTokens {
    access: string | null;
    refresh: string | null;
    expires_at: string | null;
}

export function is_token_response(v: unknown): v is TokenResponse {
    if (typeof v !== "object" || v === null) return false;
    const obj = v as Record<string, unknown>;
    return typeof obj["access_token"] === "string";
}

export function is_error_response(v: unknown): v is TokenErrorResponse {
    if (typeof v !== "object" || v === null) return false;
    const obj = v as Record<string, unknown>;
    return typeof obj["error"] === "string";
}

export function form_encode(pairs: readonly (readonly [string, string])[]): string {
    return pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
}

export function to_error(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
}

export function make_default_http_post(): HttpPost {
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
            // Never include the response body: an upstream error body may contain tokens.
            throw new Error(
                `OAuth endpoint returned a non-JSON response (status ${String(response.statusCode)})`,
            );
        }
    };
}

export async function load_tokens(vault: VaultBackend, instance_id: string): Promise<StoredTokens> {
    const [access, refresh, expires_at] = await Promise.all([
        vault.get(keyFor(instance_id, OAUTH_TOKEN_KEY)),
        vault.get(keyFor(instance_id, OAUTH_REFRESH_TOKEN_KEY)),
        vault.get(keyFor(instance_id, OAUTH_EXPIRES_AT_KEY)),
    ]);
    return { access, refresh, expires_at };
}

export function compute_expires_at(token_response: TokenResponse): string | undefined {
    if (typeof token_response.expires_in !== "number") return undefined;
    return String(Date.now() + token_response.expires_in * 1000);
}

export async function store_tokens(
    vault: VaultBackend,
    instance_id: string,
    tokens: TokenResponse,
): Promise<void> {
    const access_key = keyFor(instance_id, OAUTH_TOKEN_KEY);
    const refresh_key = keyFor(instance_id, OAUTH_REFRESH_TOKEN_KEY);
    const expires_key = keyFor(instance_id, OAUTH_EXPIRES_AT_KEY);

    // t340: 写前快照旧值；任一步写失败时回滚已写键，避免 vault 半更新中间态。
    const prev_access = await vault.get(access_key);
    const prev_refresh = await vault.get(refresh_key);
    const prev_expires = await vault.get(expires_key);

    try {
        await vault.set(access_key, tokens.access_token);
        // Refresh token rotation: store the new refresh_token if returned; otherwise
        // keep the existing one (some servers do not return a new refresh_token).
        if (tokens.refresh_token) {
            await vault.set(refresh_key, tokens.refresh_token);
        }
        const expires_at = compute_expires_at(tokens);
        if (expires_at) {
            await vault.set(expires_key, expires_at);
        }
    } catch (error) {
        const rollback = async (key: string, prev: string | null): Promise<void> => {
            if (prev === null) await vault.delete(key);
            else await vault.set(key, prev);
        };
        // 回滚尽力而为：仅恢复本次可能写过的键。回滚自身失败时以原始写入错误
        // 为根因抛出（附加回滚失败消息），使上层记录的一致性告警指向真正原因。
        const rollback_errors: string[] = [];
        try {
            await rollback(access_key, prev_access);
        } catch (rollback_error) {
            rollback_errors.push(to_error(rollback_error).message);
        }
        if (tokens.refresh_token) {
            try {
                await rollback(refresh_key, prev_refresh);
            } catch (rollback_error) {
                rollback_errors.push(to_error(rollback_error).message);
            }
        }
        if (compute_expires_at(tokens) !== undefined) {
            try {
                await rollback(expires_key, prev_expires);
            } catch (rollback_error) {
                rollback_errors.push(to_error(rollback_error).message);
            }
        }
        if (rollback_errors.length > 0) {
            throw new Error(
                `${to_error(error).message} (rollback also failed: ${rollback_errors.join("; ")})`,
            );
        }
        throw error;
    }
}

export async function clear_tokens(vault: VaultBackend, instance_id: string): Promise<void> {
    await vault.delete(keyFor(instance_id, OAUTH_TOKEN_KEY));
    await vault.delete(keyFor(instance_id, OAUTH_REFRESH_TOKEN_KEY));
    await vault.delete(keyFor(instance_id, OAUTH_EXPIRES_AT_KEY));
}

export function is_terminal_grant_error(error: string): boolean {
    return (
        error === "invalid_grant" ||
        error === "refresh_token_expired" ||
        error === "refresh_token_reused" ||
        error === "refresh_token_invalidated"
    );
}
