import { ipcMain, session } from "electron";
import { IPC_CHANNELS } from "../../shared/types/ipc";
import type { CookieLoginResult, CookieLoginStatus, LocalScanResult } from "../../shared/types/ipc";
import { scan_local_auth, type LocalScannerDeps } from "../core/auth/local-scanner";
import type { IpcResult } from "./helpers";
import { ok, fail, assert_valid_sender } from "./helpers";
import { keyFor, type SecretsStore } from "../core/config/secrets-store";
import type { AppConfigStore } from "../core/config/config-store";
import type { ConnectorDefinition } from "../core/connector/manifest-loader";
import { createLogger } from "../../shared/lib/logger";
import { get_session_login_partition, type SessionManager } from "../core/session/session-manager";
import {
    is_bearer_usable,
    refresh_kimi_web_tokens,
    type KimiWebRefreshResult,
} from "../core/auth/kimi_web_token_refresher";
import { login_auto_close_ms } from "../../shared/constants";
import {
    COOKIE_LOGIN_MESSAGES,
    type CookieLoginErrorCode,
    type CookieLoginLifecycle,
} from "../../shared/lib/cookie-login";

const log = createLogger("ipc:auth");

/**
 * t492：静默刷新的结果。`refreshed` 表示凭据已写回 vault；`credential_changed`
 * 表示凭据值确实变了——刷新服务只把「真的换到了新凭据」当作重登成功，否则
 * 用同一份失效凭据重试是空转（AC-002/003）。
 */
export interface SilentRefreshResult {
    readonly refreshed: boolean;
    readonly credential_changed: boolean;
}

const NO_SILENT_REFRESH: SilentRefreshResult = { refreshed: false, credential_changed: false };

export interface AuthIpcDeps {
    configStore: AppConfigStore;
    secretsStore: SecretsStore;
    definitions: readonly ConnectorDefinition[];
    sessionManager: SessionManager;
    /** kimi_web 续期请求的代理解析（与 connector/oauth 路径同源）；缺省直连。 */
    get_proxy_url?: () => string | undefined;
    /** 测试 seam：kimi_web 的 HTTP 续期实现；缺省用真实端点。 */
    kimi_web_refresh?: (refresh_token: string) => Promise<KimiWebRefreshResult>;
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
    options: { auto?: boolean } = {},
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
        const provider = def.manifest.provider;
        // p239/t464: kimi_web 的续期材料由登录页在存活期间写入会话，不能按 1.5s 定时关窗。
        const auto_close_ms = login_auto_close_ms(provider);
        // 自动重登（refresh-service 触发）不允许无人值守下等满 120s 超时丢凭据，
        // 改为「捕获到新 Bearer 即关窗」；手动登录仍由用户关窗（t464）。
        const close_when_credential_refreshed =
            provider === "kimi_web" && options.auto === true ? true : undefined;
        // p240: 自动重登不弹屏（kimi_web 的 Bearer 15 分钟一过期，闪窗会周期性出现）；
        // 手动登录仍显示窗口。
        const hidden = provider === "kimi_web" && options.auto === true ? true : undefined;
        const result = await deps.sessionManager.start_login({
            instance_id: instanceId,
            provider,
            login_url: loginUrl,
            cookie_names,
            ...(auto_close_ms === undefined ? {} : { auto_close_ms }),
            ...(close_when_credential_refreshed === undefined
                ? {}
                : { close_when_credential_refreshed }),
            ...(hidden === undefined ? {} : { hidden }),
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
 * Try to silently refresh the stored session without opening a login window.
 *
 * - 普通 session 连接器：从持久化 partition 重读 cookie 并写回（cookie 自身
 *   就是凭据）。
 * - kimi_web：cookie 不是凭据，用 vault 里的 refresh token 调 HTTP 续期端点换
 *   新 Bearer（t492/d060）；没有 refresh token 的旧凭据则要求现有 Bearer 仍在
 *   有效期内，否则按「无法续期」返回。
 *
 * `refreshed:false` 表示刷新未完成（调用方应回退交互式登录）；`credential_changed`
 * 为 false 表示写回的凭据与原来一致——刷新服务不得据此认定重登成功。
 */
export async function trySilentCookieRefresh(
    deps: AuthIpcDeps,
    instanceId: string,
): Promise<SilentRefreshResult> {
    const config = await deps.configStore.load();
    const plugin = config.plugins.find((p) => p.instanceId === instanceId);
    if (!plugin) {
        log.warn(`Silent refresh: instance ${instanceId} not found in config`);
        return NO_SILENT_REFRESH;
    }
    const def = deps.definitions.find((d) => d.manifest.id === plugin.manifestId);
    if (!def) {
        log.warn(`Silent refresh: definition not found for ${instanceId}`);
        return NO_SILENT_REFRESH;
    }
    const is_kimi_web = def.manifest.provider === "kimi_web";
    const cookie_names = def.manifest.cookieNames ?? [];
    if (!cookie_names.length) {
        log.debug(`Silent refresh: ${instanceId} declares no cookieNames, skipping`);
        return NO_SILENT_REFRESH;
    }
    const is_wildcard = cookie_names.includes("*");
    const targetNames = new Set(cookie_names);
    const partition = get_session_login_partition(instanceId);
    const loginSession = session.fromPartition(partition);
    const secretKey = keyFor(instanceId, "SESSION_COOKIE");
    try {
        const allCookies = await loginSession.cookies.get({});
        const matched = is_wildcard
            ? allCookies
            : allCookies.filter((cookie) => targetNames.has(cookie.name));
        if (matched.length === 0 || (!is_wildcard && matched.length < targetNames.size)) {
            // kimi_web 的凭据是 Bearer（cookie 非必需），partition 无 cookie 时
            // 仍可凭 refresh token 续期；其它 session 连接器没有 cookie 就无从刷新。
            if (!is_kimi_web) {
                log.debug(
                    is_wildcard
                        ? `Silent refresh: no cookies found, skipping`
                        : `Silent refresh: only ${String(matched.length)}/${String(targetNames.size)} cookies found, skipping`,
                );
                return NO_SILENT_REFRESH;
            }
            log.debug(`Silent refresh: no cookies in partition for ${instanceId}`);
        }
        const cookieHeader =
            matched.length > 0 ? matched.map((c) => `${c.name}=${c.value}`).join("; ") : null;

        if (is_kimi_web) {
            return await refresh_kimi_web_session(deps, instanceId, secretKey, cookieHeader);
        }
        if (!cookieHeader) return NO_SILENT_REFRESH;
        return await write_session_secret(deps, instanceId, secretKey, cookieHeader);
    } catch (err: unknown) {
        log.warn(
            `Silent cookie refresh failed for ${instanceId}: ${err instanceof Error ? err.message : String(err)}`,
        );
        return NO_SILENT_REFRESH;
    }
}

/**
 * 写回 secret 并报告凭据是否真的发生变化。
 * `options.credential_changed` 用于「写回内容变了但凭据本身没变」的场景
 * （kimi_web 旧凭据只更新 cookie、Bearer 未换），此时不得报成换到新凭据。
 */
async function write_session_secret(
    deps: AuthIpcDeps,
    instanceId: string,
    secretKey: string,
    savedSecret: string,
    options?: { credential_changed?: boolean },
): Promise<SilentRefreshResult> {
    const previous = await deps.secretsStore.get(secretKey);
    await deps.secretsStore.set(secretKey, savedSecret);
    const credential_changed = options?.credential_changed ?? previous !== savedSecret;
    log.info(
        `Silent session refresh succeeded for ${instanceId} (credential changed: ${String(credential_changed)})`,
    );
    return { refreshed: true, credential_changed };
}

/**
 * kimi_web 静默续期：优先用 refresh token 换新 Bearer（顺带把轮换后的 refresh
 * token 与到期时间写回）；没有 refresh token 时退化为「现有 Bearer 是否仍可用」
 * 的判定，不可用即返回未刷新，交给交互式登录（AC-002）。
 */
async function refresh_kimi_web_session(
    deps: AuthIpcDeps,
    instanceId: string,
    secretKey: string,
    cookieHeader: string | null,
): Promise<SilentRefreshResult> {
    const existing = await deps.secretsStore.get(secretKey);
    if (!existing) {
        log.debug(`Silent refresh: Kimi session secret missing, skipping`);
        return NO_SILENT_REFRESH;
    }
    let parsed: Record<string, unknown>;
    try {
        const value: unknown = JSON.parse(existing);
        if (typeof value !== "object" || value === null || Array.isArray(value)) {
            return NO_SILENT_REFRESH;
        }
        parsed = value as Record<string, unknown>;
    } catch {
        log.debug(`Silent refresh: Kimi session secret is not JSON, skipping`);
        return NO_SILENT_REFRESH;
    }

    const refresh_token =
        typeof parsed["refresh_token"] === "string" ? parsed["refresh_token"].trim() : "";
    const cookie = cookieHeader ?? (typeof parsed["cookie"] === "string" ? parsed["cookie"] : "");

    if (!refresh_token) {
        // 旧凭据（t492 之前登录）：没有续期材料，只更新 cookie；Bearer 已过期
        // 或无法解析时不得报成功。
        if (!is_bearer_usable(parsed["authorization"])) {
            log.warn(
                `Silent refresh: Kimi session for ${instanceId} has no refresh token and the stored Bearer is not usable`,
            );
            return NO_SILENT_REFRESH;
        }
        if (!cookieHeader) return NO_SILENT_REFRESH;
        return await write_session_secret(
            deps,
            instanceId,
            secretKey,
            JSON.stringify({ ...parsed, cookie }),
            // 只换 cookie、Bearer 未变：不算「换到新凭据」（AC-003），刷新服务据此
            // 不再用同一份 Bearer 重试。
            { credential_changed: false },
        );
    }

    const get_proxy_url = deps.get_proxy_url;
    const refresh =
        deps.kimi_web_refresh ??
        ((token: string) => refresh_kimi_web_tokens(token, get_proxy_url ? { get_proxy_url } : {}));
    const result: KimiWebRefreshResult = await refresh(refresh_token);
    if (!result.ok) {
        log.warn(
            `Silent refresh: Kimi token refresh failed for ${instanceId}${result.unauthenticated ? " (refresh token rejected)" : ""}: ${result.error}`,
        );
        return NO_SILENT_REFRESH;
    }
    return await write_session_secret(
        deps,
        instanceId,
        secretKey,
        JSON.stringify({
            ...parsed,
            cookie,
            authorization: `Bearer ${result.tokens.access_token}`,
            refresh_token: result.tokens.refresh_token,
        }),
    );
}

export async function handleAuthScanLocal(
    vendor_id: string,
    deps?: LocalScannerDeps,
): Promise<IpcResult<LocalScanResult>> {
    try {
        const result = await scan_local_auth(vendor_id, deps);
        return ok(result);
    } catch (err: unknown) {
        log.error(`Local auth scan failed for ${vendor_id}`);
        return fail("INTERNAL_ERROR", err instanceof Error ? err.message : String(err));
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
    ipcMain.handle(
        IPC_CHANNELS.AUTH_SCAN_LOCAL,
        (e, vendor_id: string): Promise<IpcResult<LocalScanResult>> => {
            assert_valid_sender(e);
            return handleAuthScanLocal(vendor_id);
        },
    );
}
