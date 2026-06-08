import { randomUUID } from "node:crypto";
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

    const partition = `persist:mimo-login-${randomUUID()}`;
    const loginSession = session.fromPartition(partition);

    return new Promise<IpcResult<{ saved: boolean }>>((resolve) => {
        let resolved = false;
        let cleanupTimer: ReturnType<typeof setTimeout> | null = null;

        function cleanup() {
            if (cleanupTimer) {
                clearTimeout(cleanupTimer);
                cleanupTimer = null;
            }
            loginSession.cookies.removeListener("changed", onCookieChanged);
        }

        function finish(result: IpcResult<{ saved: boolean }>) {
            if (resolved) return;
            resolved = true;
            cleanup();
            resolve(result);
        }

        const onCookieChanged = (
            _event: Electron.Event,
            cookie: Electron.Cookie,
            _cause: string,
            removed: boolean,
        ) => {
            if (removed) return;
            if (cookie.name !== "api-platform_serviceToken") return;

            log.info("Detected api-platform_serviceToken cookie, saving...");
            const cookieHeader = `api-platform_serviceToken=${cookie.value}`;
            void deps.secretsStore
                .set(`${instanceId}:SESSION_COOKIE`, cookieHeader)
                .then(() => {
                    log.info("Cookie saved successfully");
                    finish(ok({ saved: true }));
                    if (!loginWin.isDestroyed()) {
                        loginWin.close();
                    }
                })
                .catch((err: unknown) => {
                    log.error("Failed to save cookie", err);
                    finish(fail("INTERNAL_ERROR", "保存 Cookie 失败"));
                });
        };

        loginSession.cookies.on("changed", onCookieChanged);

        const loginWin = new BrowserWindow({
            width: 520,
            height: 720,
            title: "MiMo 登录",
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
            if (!resolved) {
                finish(ok({ saved: false }));
            }
        });

        cleanupTimer = setTimeout(() => {
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
