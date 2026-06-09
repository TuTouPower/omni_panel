import { BrowserWindow, ipcMain, session } from "electron";
import { IPC_CHANNELS } from "../../shared/types/ipc";
import type { IpcResult } from "./helpers";
import { ok, fail, assert_valid_sender } from "./helpers";
import type { SecretsStore } from "../core/config/secrets-store";
import type { AppConfigStore } from "../core/config/config-store";
import type { PluginDefinition } from "../core/plugin/types";
import type { CookieRefreshService } from "../core/cookie-refresh/cookie-refresh-service";
import { createLogger } from "../../shared/lib/logger";

const log = createLogger("ipc:auth");

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

export interface AuthIpcDeps {
    configStore: AppConfigStore;
    secretsStore: SecretsStore;
    definitions: readonly PluginDefinition[];
    cookieRefreshService: CookieRefreshService;
}

export async function handleCookieLogin(
    deps: AuthIpcDeps,
    instanceId: string,
): Promise<IpcResult<{ saved: boolean }>> {
    const config = await deps.configStore.load();
    const plugin = config.plugins.find((p) => p.instanceId === instanceId);
    if (!plugin) return fail("VALIDATION_ERROR", "插件不存在");

    const def = deps.definitions.find((d) => d.executablePath === plugin.executablePath);
    const endpoints = def?.metadata?.endpoints;
    const loginUrl = endpoints?.["login"] ?? endpoints?.["default"];
    if (!loginUrl || typeof loginUrl !== "string") {
        return fail("VALIDATION_ERROR", "该插件未配置登录地址");
    }

    // Fixed persistent partition keeps the session alive across window opens/closes.
    // The user can close and reopen the login window without losing cookies.
    const partition = "persist:mimo-login";
    const loginSession = session.fromPartition(partition);

    return new Promise<IpcResult<{ saved: boolean }>>((resolve) => {
        let resolved = false;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;

        function finish(result: IpcResult<{ saved: boolean }>) {
            if (resolved) return;
            resolved = true;
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            resolve(result);
        }

        const loginWin = new BrowserWindow({
            width: 520,
            height: 720,
            title: "MiMo 登录 — 登录完成后关闭此窗口",
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
            if (resolved) return;
            // Read all required cookies from the persistent session.
            void loginSession.cookies
                .get({})
                .then((all_cookies) => {
                    const target_names = new Set([
                        "api-platform_serviceToken",
                        "api-platform_slh",
                        "api-platform_ph",
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

export function registerAuthIpc(deps: AuthIpcDeps): void {
    ipcMain.handle(
        IPC_CHANNELS.AUTH_COOKIE_LOGIN,
        (e, instanceId: string): Promise<IpcResult<{ saved: boolean }>> => {
            assert_valid_sender(e);
            return handleCookieLogin(deps, instanceId);
        },
    );
    ipcMain.handle(
        IPC_CHANNELS.AUTH_REFRESH_COOKIES,
        (e): Promise<IpcResult<{ refreshed: number; failed: number }>> => {
            assert_valid_sender(e);
            return deps.cookieRefreshService.refreshAll().then((result) => ok(result));
        },
    );
}
