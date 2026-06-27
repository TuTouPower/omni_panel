import { BrowserWindow, ipcMain, session } from "electron";
import { IPC_CHANNELS } from "../../shared/types/ipc";
import type { IpcResult } from "./helpers";
import { ok, fail, assert_valid_sender } from "./helpers";
import type { SecretsStore } from "../core/config/secrets-store";
import type { AppConfigStore } from "../core/config/config-store";
import type { ConnectorDefinition } from "../core/connector/manifest-loader";
import { createLogger } from "../../shared/lib/logger";

const log = createLogger("ipc:auth");

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const MIMO_LOGIN_PARTITION = "persist:mimo-login";

const ALLOWED_LOGIN_DOMAINS = new Set([
    "kimi.com",
    "mimo.com",
    "platform.xiaomimimo.com",
    "minimaxi.com",
    "www.minimaxi.com",
    "open.bigmodel.cn",
    "api.deepseek.com",
    "api.tavily.com",
    "generativelanguage.googleapis.com",
    "api.anthropic.com",
    "127.0.0.1",
]);

export interface AuthIpcDeps {
    configStore: AppConfigStore;
    secretsStore: SecretsStore;
    definitions: readonly ConnectorDefinition[];
}

export async function handleCookieLogin(
    deps: AuthIpcDeps,
    instanceId: string,
): Promise<IpcResult<{ saved: boolean }>> {
    const config = await deps.configStore.load();
    const plugin = config.plugins.find((p) => p.instanceId === instanceId);
    if (!plugin) return fail("VALIDATION_ERROR", "插件不存在");

    const def = deps.definitions.find((d) => d.executablePath === plugin.executablePath);
    const endpoints = def?.manifest.endpoints;
    const loginUrl = endpoints?.["login"] ?? endpoints?.["default"];
    if (!loginUrl || typeof loginUrl !== "string") {
        return fail("VALIDATION_ERROR", "该插件未配置登录地址");
    }

    const parsed = new URL(loginUrl);
    const hostname = parsed.hostname;
    if (
        !ALLOWED_LOGIN_DOMAINS.has(hostname) &&
        !ALLOWED_LOGIN_DOMAINS.has(hostname.replace(/^www\./, ""))
    ) {
        return fail("VALIDATION_ERROR", `登录域名不被允许: ${hostname}`);
    }

    // Keep each account in its own persistent partition so cookies from one
    // MiMo account never prefill or overwrite another account's login state.
    const partition = get_mimo_login_partition(instanceId);
    const loginSession = session.fromPartition(partition);

    return new Promise<IpcResult<{ saved: boolean }>>((resolve) => {
        let resolved = false;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        let captured_cookie: string | null = null;

        function finish(result: IpcResult<{ saved: boolean }>) {
            if (resolved) return;
            resolved = true;
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            resolve(result);
        }

        let auto_close_id: ReturnType<typeof setTimeout> | null = null;

        // Intercept API requests to capture the exact Cookie header the browser sends.
        // This is more reliable than reading cookies from the session because the
        // browser may send cookies that session.cookies.get({}) doesn't return, or
        // the server may require cookies in a specific format.
        loginSession.webRequest.onBeforeSendHeaders((details, callback) => {
            if (!resolved && details.url.includes("/api/v1/")) {
                const cookie = details.requestHeaders["Cookie"] ?? details.requestHeaders["cookie"];
                if (cookie) {
                    captured_cookie = cookie;
                    log.info(
                        `Captured Cookie header from browser API request to ${details.url.slice(0, 80)}`,
                    );
                    // Auto-close after a short delay so the page finishes loading.
                    auto_close_id ??= setTimeout(() => {
                        auto_close_id = null;
                        if (!resolved && !loginWin.isDestroyed()) {
                            log.info("Auto-closing login window after cookie capture");
                            loginWin.close();
                        }
                    }, 1500);
                }
            }
            callback({ requestHeaders: details.requestHeaders });
        });

        const loginWin = new BrowserWindow({
            width: 520,
            height: 720,
            title: "MiMo 登录 — 登录后将自动关闭",
            webPreferences: {
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: true,
                webSecurity: true,
                allowRunningInsecureContent: false,
                partition,
            },
        });

        loginWin.on("closed", () => {
            if (auto_close_id) {
                clearTimeout(auto_close_id);
                auto_close_id = null;
            }
            if (resolved) return;
            if (captured_cookie) {
                log.info("Saving cookie captured from browser API request");
                void deps.secretsStore
                    .set(`${instanceId}:SESSION_COOKIE`, captured_cookie)
                    .then(() => {
                        log.info("Cookies saved successfully");
                        finish(ok({ saved: true }));
                    })
                    .catch((err: unknown) => {
                        log.error("Failed to save cookies", err);
                        finish(fail("INTERNAL_ERROR", "保存 Cookie 失败"));
                    });
                return;
            }
            // Fallback: read cookies from persistent session
            void loginSession.cookies
                .get({})
                .then((all_cookies) => {
                    const target_names = new Set([
                        "api-platform_serviceToken",
                        "api-platform_slh",
                        "api-platform_ph",
                        "userId",
                    ]);
                    const matched = all_cookies.filter((c) => target_names.has(c.name));
                    if (matched.length === 0) {
                        log.info("No required cookies found on window close");
                        finish(ok({ saved: false }));
                        return;
                    }
                    const cookie_parts: string[] = [];
                    for (const c of matched) {
                        cookie_parts.push(`${c.name}=${c.value}`);
                    }
                    const cookie_header = cookie_parts.join("; ");
                    log.info(
                        `Saving ${String(matched.length)} cookies from persistent session on window close`,
                    );
                    void deps.secretsStore
                        .set(`${instanceId}:SESSION_COOKIE`, cookie_header)
                        .then(() => {
                            log.info("Cookies saved successfully");
                            finish(ok({ saved: true }));
                        })
                        .catch((err: unknown) => {
                            log.error("Failed to save cookies on window close", err);
                            finish(fail("INTERNAL_ERROR", "保存 Cookie 失败"));
                        });
                })
                .catch((err: unknown) => {
                    log.error("Failed to read cookies on window close", err);
                    finish(fail("INTERNAL_ERROR", "读取 Cookie 失败"));
                });
        });

        timeoutId = setTimeout(() => {
            if (auto_close_id) {
                clearTimeout(auto_close_id);
                auto_close_id = null;
            }
            if (!resolved) {
                log.warn("Login window timed out");
                if (!loginWin.isDestroyed()) {
                    loginWin.close();
                }
                finish(fail("TIMEOUT", "登录超时"));
            }
        }, LOGIN_TIMEOUT_MS);

        void loginWin.loadURL(loginUrl);
    });
}

/**
 * Try to silently refresh cookies from the persisted login session
 * without opening a login window. Returns the cookie string if the
 * session still has valid cookies, or null if not.
 */
export async function trySilentCookieRefresh(
    secretsStore: SecretsStore,
    instanceId: string,
): Promise<boolean> {
    const partition = get_mimo_login_partition(instanceId);
    const loginSession = session.fromPartition(partition);
    try {
        const allCookies = await loginSession.cookies.get({});
        const targetNames = new Set([
            "api-platform_serviceToken",
            "api-platform_slh",
            "api-platform_ph",
            "userId",
        ]);
        const matched = allCookies.filter((c) => targetNames.has(c.name));
        if (matched.length < targetNames.size) {
            log.debug(
                `Silent refresh: only ${String(matched.length)}/${String(targetNames.size)} cookies found, skipping`,
            );
            return false;
        }
        const cookieHeader = matched.map((c) => `${c.name}=${c.value}`).join("; ");
        await secretsStore.set(`${instanceId}:SESSION_COOKIE`, cookieHeader);
        log.info(`Silent cookie refresh succeeded for ${instanceId}`);
        return true;
    } catch (err: unknown) {
        log.warn(
            `Silent cookie refresh failed for ${instanceId}: ${err instanceof Error ? err.message : String(err)}`,
        );
        return false;
    }
}

export function get_mimo_login_partition(instanceId: string): string {
    return `${MIMO_LOGIN_PARTITION}:${instanceId}`;
}

export function registerAuthIpc(deps: AuthIpcDeps): void {
    ipcMain.handle(
        IPC_CHANNELS.AUTH_COOKIE_LOGIN,
        (e, instanceId: string): Promise<IpcResult<{ saved: boolean }>> => {
            assert_valid_sender(e);
            return handleCookieLogin(deps, instanceId);
        },
    );
}
