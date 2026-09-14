import { ipcMain, session } from "electron";
import { IPC_CHANNELS } from "../../shared/types/ipc";
import type { CookieLoginResult, CookieLoginStatus } from "../../shared/types/ipc";
import type { IpcResult } from "./helpers";
import { ok, fail, assert_valid_sender } from "./helpers";
import { keyFor, type SecretsStore } from "../core/config/secrets-store";
import type { AppConfigStore } from "../core/config/config-store";
import type { ConnectorDefinition } from "../core/connector/manifest-loader";
import { createLogger } from "../../shared/lib/logger";
import { get_session_login_partition, type SessionManager } from "../core/session/session-manager";
import { SESSION_LOGIN_AUTO_CLOSE_MS } from "../../shared/constants";
import {
    COOKIE_LOGIN_MESSAGES,
    type CookieLoginErrorCode,
    type CookieLoginLifecycle,
} from "../../shared/lib/cookie-login";

const log = createLogger("ipc:auth");

export interface AuthIpcDeps {
    configStore: AppConfigStore;
    secretsStore: SecretsStore;
    definitions: readonly ConnectorDefinition[];
    sessionManager: SessionManager;
}

interface CookieLoginState {
    in_progress: boolean;
    state: CookieLoginLifecycle;
    error_code?: CookieLoginErrorCode;
    error?: string;
}

const cookie_login_states = new WeakMap<AuthIpcDeps, Map<string, CookieLoginState>>();

function get_cookie_login_states(deps: AuthIpcDeps): Map<string, CookieLoginState> {
    const existing = cookie_login_states.get(deps);
    if (existing) return existing;
    const created = new Map<string, CookieLoginState>();
    cookie_login_states.set(deps, created);
    return created;
}

function classify_cookie_login_error(
    message: string,
    fallback_code: CookieLoginErrorCode = "INTERNAL_ERROR",
): { code: CookieLoginErrorCode; message: string; state: CookieLoginLifecycle } {
    if (/timed out/i.test(message)) {
        return { code: "TIMEOUT", message: COOKIE_LOGIN_MESSAGES.timeout, state: "timeout" };
    }
    if (/already in progress/i.test(message)) {
        return { code: "CONFLICT", message: COOKIE_LOGIN_MESSAGES.conflict, state: "failed" };
    }
    if (message.includes("未捕获到 Cookie")) {
        return { code: "NO_COOKIE", message: COOKIE_LOGIN_MESSAGES.no_cookie, state: "canceled" };
    }
    if (message.includes("登录态无效") || /invalid cookie/i.test(message)) {
        return {
            code: "INVALID_COOKIE",
            message: COOKIE_LOGIN_MESSAGES.invalid_cookie,
            state: "failed",
        };
    }
    return { code: fallback_code, message, state: "failed" };
}

function update_cookie_login_state(
    state: CookieLoginState,
    failure?: { code: CookieLoginErrorCode; message: string; state: CookieLoginLifecycle },
): void {
    state.in_progress = false;
    if (failure) {
        state.state = failure.state;
        state.error_code = failure.code;
        if (failure.state === "failed") {
            state.error = failure.message;
        } else {
            delete state.error;
        }
        return;
    }
    state.state = "succeeded";
    delete state.error_code;
    delete state.error;
}

export async function handleCookieLogin(
    deps: AuthIpcDeps,
    instanceId: string,
): Promise<IpcResult<{ saved: boolean; reason?: "invalid_cookie" | "no_cookie" }>> {
    const config = await deps.configStore.load();
    const plugin = config.plugins.find((p) => p.instanceId === instanceId);
    if (!plugin) return fail("VALIDATION_ERROR", "插件不存在");

    const def = deps.definitions.find((d) => d.manifest.id === plugin.manifestId);
    if (!def) return fail("VALIDATION_ERROR", "插件定义不存在");
    const endpoints = def.manifest.endpoints;
    const loginUrl = endpoints?.["login"] ?? endpoints?.["default"];
    if (!loginUrl || typeof loginUrl !== "string") {
        return fail("VALIDATION_ERROR", "该插件未配置登录地址");
    }

    const cookie_names = def.manifest.cookieNames ?? [];
    if (!cookie_names.length) {
        return fail("VALIDATION_ERROR", "该插件未配置 cookieNames");
    }

    const parsed = new URL(loginUrl);
    const hostname = parsed.hostname;
    const allowed_domains = def.manifest.loginDomains ?? [];
    if (!allowed_domains.length) {
        return fail("VALIDATION_ERROR", "该插件未配置登录域名");
    }
    const allowed_set = new Set(allowed_domains);
    if (!allowed_set.has(hostname) && !allowed_set.has(hostname.replace(/^www\./, ""))) {
        return fail("VALIDATION_ERROR", `登录域名不被允许: ${hostname}`);
    }

    try {
        const result = await deps.sessionManager.start_login({
            instance_id: instanceId,
            provider: def.manifest.provider,
            login_url: loginUrl,
            cookie_names,
            auto_close_ms: SESSION_LOGIN_AUTO_CLOSE_MS,
        });
        return ok(result);
    } catch (err: unknown) {
        log.error(`Cookie login failed for ${instanceId}`);
        return fail("INTERNAL_ERROR", err instanceof Error ? err.message : String(err));
    }
}

export function startCookieLogin(
    deps: AuthIpcDeps,
    instanceId: string,
): IpcResult<CookieLoginResult> {
    const states = get_cookie_login_states(deps);
    const current = states.get(instanceId);
    if (current?.in_progress || deps.sessionManager.is_login_in_progress?.(instanceId)) {
        return ok({
            started: false,
            conflict: true,
            error_code: "CONFLICT",
            error: COOKIE_LOGIN_MESSAGES.conflict,
        });
    }

    const state: CookieLoginState = { in_progress: true, state: "running" };
    states.set(instanceId, state);
    void handleCookieLogin(deps, instanceId).then(
        (result) => {
            if (result.ok && result.data.saved) {
                update_cookie_login_state(state);
            } else if (result.ok) {
                // t337: 区分「未捕获到 Cookie」与「登录态无效」。
                update_cookie_login_state(
                    state,
                    result.data.reason === "invalid_cookie"
                        ? {
                              code: "INVALID_COOKIE",
                              message: COOKIE_LOGIN_MESSAGES.invalid_cookie,
                              state: "failed",
                          }
                        : {
                              code: "NO_COOKIE",
                              message: COOKIE_LOGIN_MESSAGES.no_cookie,
                              state: "canceled",
                          },
                );
            } else {
                update_cookie_login_state(
                    state,
                    classify_cookie_login_error(
                        result.error.message,
                        result.error.code === "VALIDATION_ERROR"
                            ? "VALIDATION_ERROR"
                            : "INTERNAL_ERROR",
                    ),
                );
            }
        },
        (error: unknown) => {
            update_cookie_login_state(
                state,
                classify_cookie_login_error(error instanceof Error ? error.message : String(error)),
            );
        },
    );
    return ok({ started: true });
}

export async function handleCookieLoginStatus(
    deps: AuthIpcDeps,
    instanceId: string,
): Promise<IpcResult<CookieLoginStatus>> {
    try {
        const saved = (await deps.secretsStore.get(keyFor(instanceId, "SESSION_COOKIE"))) !== null;
        const state = get_cookie_login_states(deps).get(instanceId);
        const manager_in_progress = deps.sessionManager.is_login_in_progress?.(instanceId) ?? false;
        const in_progress = state?.in_progress === true ? true : manager_in_progress;
        const lifecycle = in_progress
            ? "running"
            : (state?.state ?? (saved ? "succeeded" : "canceled"));
        return ok({
            in_progress,
            saved,
            state: lifecycle,
            ...(state?.error_code ? { error_code: state.error_code } : {}),
            ...(state?.error ? { error: state.error } : {}),
        });
    } catch {
        log.error(`Cookie login status failed for ${instanceId}`);
        return fail("INTERNAL_ERROR", "读取登录状态失败");
    }
}

/**
 * Try to silently refresh cookies from the persisted login session
 * without opening a login window. Returns true if the session still
 * has all required cookies (declared in manifest.cookieNames) and
 * they were saved, or false if not.
 */
export async function trySilentCookieRefresh(
    deps: AuthIpcDeps,
    instanceId: string,
): Promise<boolean> {
    const config = await deps.configStore.load();
    const plugin = config.plugins.find((p) => p.instanceId === instanceId);
    if (!plugin) {
        log.warn(`Silent refresh: instance ${instanceId} not found in config`);
        return false;
    }
    const def = deps.definitions.find((d) => d.manifest.id === plugin.manifestId);
    if (!def) {
        log.warn(`Silent refresh: definition not found for ${instanceId}`);
        return false;
    }
    const cookie_names = def.manifest.cookieNames ?? [];
    if (!cookie_names.length) {
        log.debug(`Silent refresh: ${instanceId} declares no cookieNames, skipping`);
        return false;
    }
    const is_wildcard = cookie_names.includes("*");
    const targetNames = new Set(cookie_names);
    const partition = get_session_login_partition(instanceId);
    const loginSession = session.fromPartition(partition);
    try {
        const allCookies = await loginSession.cookies.get({});
        const matched = is_wildcard
            ? allCookies
            : allCookies.filter((cookie) => targetNames.has(cookie.name));
        if (matched.length === 0 || (!is_wildcard && matched.length < targetNames.size)) {
            log.debug(
                is_wildcard
                    ? `Silent refresh: no cookies found, skipping`
                    : `Silent refresh: only ${String(matched.length)}/${String(targetNames.size)} cookies found, skipping`,
            );
            return false;
        }
        const cookieHeader = matched.map((c) => `${c.name}=${c.value}`).join("; ");
        let savedSecret = cookieHeader;
        if (def.manifest.provider === "kimi_web") {
            const existing = await deps.secretsStore.get(keyFor(instanceId, "SESSION_COOKIE"));
            if (!existing) {
                log.debug(`Silent refresh: Kimi session secret missing, skipping`);
                return false;
            }
            let parsed: Record<string, unknown>;
            try {
                const value: unknown = JSON.parse(existing);
                if (typeof value !== "object" || value === null || Array.isArray(value)) {
                    return false;
                }
                parsed = value as Record<string, unknown>;
            } catch {
                log.debug(`Silent refresh: Kimi session secret is not JSON, skipping`);
                return false;
            }
            if (typeof parsed["authorization"] !== "string" || !parsed["authorization"].trim()) {
                log.debug(`Silent refresh: Kimi authorization missing, skipping`);
                return false;
            }
            savedSecret = JSON.stringify({
                ...parsed,
                cookie: cookieHeader,
            });
        }
        await deps.secretsStore.set(keyFor(instanceId, "SESSION_COOKIE"), savedSecret);
        log.info(`Silent cookie refresh succeeded for ${instanceId}`);
        return true;
    } catch (err: unknown) {
        log.warn(
            `Silent cookie refresh failed for ${instanceId}: ${err instanceof Error ? err.message : String(err)}`,
        );
        return false;
    }
}

export function registerAuthIpc(deps: AuthIpcDeps): void {
    ipcMain.handle(
        IPC_CHANNELS.AUTH_COOKIE_LOGIN,
        (e, instanceId: string): IpcResult<CookieLoginResult> => {
            assert_valid_sender(e);
            return startCookieLogin(deps, instanceId);
        },
    );
    ipcMain.handle(
        IPC_CHANNELS.AUTH_COOKIE_LOGIN_STATUS,
        (e, instanceId: string): Promise<IpcResult<CookieLoginStatus>> => {
            assert_valid_sender(e);
            return handleCookieLoginStatus(deps, instanceId);
        },
    );
}
