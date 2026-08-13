import { ipcMain, session } from "electron";
import { IPC_CHANNELS } from "../../shared/types/ipc";
import type { CookieLoginStatus } from "../../shared/types/ipc";
import type { IpcResult } from "./helpers";
import { ok, fail, assert_valid_sender } from "./helpers";
import { keyFor, type SecretsStore } from "../core/config/secrets-store";
import type { AppConfigStore } from "../core/config/config-store";
import type { ConnectorDefinition } from "../core/connector/manifest-loader";
import { createLogger } from "../../shared/lib/logger";
import { get_session_login_partition, type SessionManager } from "../core/session/session-manager";

const log = createLogger("ipc:auth");

const AUTO_CLOSE_MS = 1500;

export interface AuthIpcDeps {
    configStore: AppConfigStore;
    secretsStore: SecretsStore;
    definitions: readonly ConnectorDefinition[];
    sessionManager: SessionManager;
}

interface CookieLoginState {
    in_progress: boolean;
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

function safe_cookie_login_error(message: string): string {
    if (message.includes("graphical display")) return message;
    if (/timed out/i.test(message)) return "网页登录超时，请重试";
    if (/already in progress/i.test(message)) return "已有登录正在进行中，请等待当前登录完成";
    if (message.includes("未捕获到 Cookie")) return message;
    return "网页登录失败，请重试";
}

export async function handleCookieLogin(
    deps: AuthIpcDeps,
    instanceId: string,
): Promise<IpcResult<{ saved: boolean; reason?: "invalid_cookie" | "no_cookie" }>> {
    const config = await deps.configStore.load();
    const plugin = config.plugins.find((p) => p.instanceId === instanceId);
    if (!plugin) return fail("VALIDATION_ERROR", "插件不存在");

    const def = deps.definitions.find((d) => d.executablePath === plugin.executablePath);
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
            auto_close_ms: AUTO_CLOSE_MS,
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
): IpcResult<{ started: true }> {
    const states = get_cookie_login_states(deps);
    const current = states.get(instanceId);
    if (current?.in_progress || deps.sessionManager.is_login_in_progress?.(instanceId)) {
        return fail("CONFLICT", "已有登录正在进行中，请等待当前登录完成");
    }

    const state: CookieLoginState = { in_progress: true };
    states.set(instanceId, state);
    void handleCookieLogin(deps, instanceId).then(
        (result) => {
            state.in_progress = false;
            if (result.ok && result.data.saved) {
                delete state.error;
            } else if (result.ok) {
                // t337: 区分「未捕获到 Cookie」与「登录态无效」。
                state.error =
                    result.data.reason === "invalid_cookie"
                        ? "登录态无效，请重新登录或手动粘贴 Cookie"
                        : "未捕获到 Cookie，请完成登录后再关闭窗口";
            } else {
                state.error = safe_cookie_login_error(result.error.message);
            }
        },
        (error: unknown) => {
            state.in_progress = false;
            state.error = safe_cookie_login_error(
                error instanceof Error ? error.message : String(error),
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
        return ok({
            in_progress: state?.in_progress ?? manager_in_progress,
            saved,
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
    const def = deps.definitions.find((d) => d.executablePath === plugin.executablePath);
    if (!def) {
        log.warn(`Silent refresh: definition not found for ${instanceId}`);
        return false;
    }
    const cookie_names = def.manifest.cookieNames ?? [];
    if (!cookie_names.length) {
        log.debug(`Silent refresh: ${instanceId} declares no cookieNames, skipping`);
        return false;
    }
    const targetNames = new Set(cookie_names);
    const partition = get_session_login_partition(instanceId);
    const loginSession = session.fromPartition(partition);
    try {
        const allCookies = await loginSession.cookies.get({});
        const matched = allCookies.filter((c) => targetNames.has(c.name));
        if (matched.length < targetNames.size) {
            log.debug(
                `Silent refresh: only ${String(matched.length)}/${String(targetNames.size)} cookies found, skipping`,
            );
            return false;
        }
        const cookieHeader = matched.map((c) => `${c.name}=${c.value}`).join("; ");
        await deps.secretsStore.set(keyFor(instanceId, "SESSION_COOKIE"), cookieHeader);
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
        (e, instanceId: string): Promise<IpcResult<{ saved: boolean }>> => {
            assert_valid_sender(e);
            return handleCookieLogin(deps, instanceId);
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
