import { BrowserWindow, session } from "electron";
import type { AppConfigStore } from "../config/config-store";
import type { SecretsStore } from "../config/secrets-store";
import type { PluginDefinition } from "../plugin/types";
import type { UsageProvider } from "../../../shared/schemas/plugin-output";
import { createLogger } from "../../../shared/lib/logger";

const log = createLogger("cookie-refresh");

const REFRESH_TIMEOUT_MS = 30_000;

interface VendorCookieConfig {
    cookieName: string;
    secretParamName: string;
}

const VENDOR_COOKIE_MAP: Partial<Record<UsageProvider, VendorCookieConfig>> = {
    mimo: { cookieName: "api-platform_serviceToken", secretParamName: "SESSION_COOKIE" },
    kimi: { cookieName: "access_token", secretParamName: "SESSION_COOKIE" },
};

const SECURE_WEB_PREFS = {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
} as const;

export interface CookieRefreshDeps {
    configStore: AppConfigStore;
    secretsStore: SecretsStore;
    definitions: readonly PluginDefinition[];
}

export type CookieRefreshService = ReturnType<typeof createCookieRefreshService>;

export function createCookieRefreshService(deps: CookieRefreshDeps) {
    const in_progress = new Set<string>();

    function refresh_vendor(
        vendor_id: UsageProvider,
        instance_ids: string[],
        login_url: string,
        cookie_config: VendorCookieConfig,
    ): Promise<boolean> {
        const partition = `persist:${vendor_id}-cookie-refresh`;
        const refresh_session = session.fromPartition(partition);

        return new Promise<boolean>((resolve) => {
            let resolved = false;
            let timeout_id: ReturnType<typeof setTimeout> | null = null;

            function cleanup() {
                if (timeout_id) {
                    clearTimeout(timeout_id);
                    timeout_id = null;
                }
                refresh_session.cookies.removeListener("changed", on_cookie_changed);
            }

            function finish(success: boolean) {
                if (resolved) return;
                resolved = true;
                cleanup();
                if (!win.isDestroyed()) {
                    win.close();
                }
                in_progress.delete(vendor_id);
                resolve(success);
            }

            const on_cookie_changed = (
                _event: Electron.Event,
                cookie: Electron.Cookie,
                _cause: string,
                removed: boolean,
            ) => {
                if (removed) return;
                if (cookie.name !== cookie_config.cookieName) return;

                log.info(`Detected ${cookie_config.cookieName} cookie for vendor ${vendor_id}`);

                const cookie_header = `${cookie_config.cookieName}=${cookie.value}`;
                const promises = instance_ids.map((instance_id) =>
                    deps.secretsStore.set(
                        `${instance_id}:${cookie_config.secretParamName}`,
                        cookie_header,
                    ),
                );

                void Promise.allSettled(promises).then((results) => {
                    const succeeded = results.filter((r) => r.status === "fulfilled").length;
                    const failed = results.filter((r) => r.status === "rejected").length;
                    log.info(
                        `Cookie refresh for ${vendor_id}: ${String(succeeded)} saved, ${String(failed)} failed`,
                    );
                    finish(succeeded > 0);
                });
            };

            refresh_session.cookies.on("changed", on_cookie_changed);

            const win = new BrowserWindow({
                show: false,
                webPreferences: {
                    ...SECURE_WEB_PREFS,
                    partition,
                },
            });

            win.on("closed", () => {
                if (!resolved) {
                    log.debug(`Cookie refresh window closed for ${vendor_id}`);
                    finish(false);
                }
            });

            timeout_id = setTimeout(() => {
                if (!resolved) {
                    log.warn(`Cookie refresh timed out for vendor ${vendor_id}`);
                    finish(false);
                }
            }, REFRESH_TIMEOUT_MS);

            void win.loadURL(login_url);
        });
    }

    interface VendorGroup {
        instance_ids: string[];
        login_url: string;
    }

    async function refreshAll(): Promise<{ refreshed: number; failed: number }> {
        const config = await deps.configStore.load();
        const plugins = config.plugins;

        // Build eligible instances grouped by vendor
        const vendor_groups = new Map<UsageProvider, VendorGroup>();

        for (const plugin of plugins) {
            const def = deps.definitions.find((d) => d.executablePath === plugin.executablePath);
            if (!def?.metadata) continue;

            const meta = def.metadata;

            // Requirement 2a: defaultSource !== "cpa"
            if (meta.defaultSource === "cpa") continue;

            // Requirement 2b: has at least one secret type parameter
            const has_secret_param = meta.parameters?.some((p) => p.type === "secret");
            if (!has_secret_param) continue;

            // Requirement 2d: has login or default endpoint
            const endpoints = meta.endpoints;
            const login_url = endpoints?.["login"] ?? endpoints?.["default"];
            if (!login_url || typeof login_url !== "string") continue;

            // Requirement 2c: at least one supportedProvider is in vendor cookie map
            const providers = meta.supportedProviders ?? [];
            for (const provider of providers) {
                const cookie_config = VENDOR_COOKIE_MAP[provider];
                if (!cookie_config) continue;

                let group = vendor_groups.get(provider);
                if (!group) {
                    group = { instance_ids: [], login_url };
                    vendor_groups.set(provider, group);
                }
                if (!group.instance_ids.includes(plugin.instanceId)) {
                    group.instance_ids.push(plugin.instanceId);
                }
            }
        }

        if (vendor_groups.size === 0) {
            log.debug("No eligible plugins for cookie refresh");
            return { refreshed: 0, failed: 0 };
        }

        // Requirement 8: skip vendors already in progress
        const tasks: Promise<boolean>[] = [];
        for (const [vendor_id, group] of vendor_groups) {
            if (in_progress.has(vendor_id)) {
                log.debug(`Skipping ${vendor_id}: already in progress`);
                continue;
            }
            const cookie_config = VENDOR_COOKIE_MAP[vendor_id];
            if (!cookie_config) continue;
            in_progress.add(vendor_id);
            log.info(
                `Starting cookie refresh for ${vendor_id} (${String(group.instance_ids.length)} instances)`,
            );
            tasks.push(
                refresh_vendor(vendor_id, group.instance_ids, group.login_url, cookie_config),
            );
        }

        if (tasks.length === 0) {
            return { refreshed: 0, failed: 0 };
        }

        const results = await Promise.allSettled(tasks);
        const refreshed = results.filter((r) => r.status === "fulfilled" && r.value).length;
        const failed = results.length - refreshed;

        log.info(
            `Cookie refresh complete: ${String(refreshed)} refreshed, ${String(failed)} failed`,
        );

        return { refreshed, failed };
    }

    return {
        refreshAll,
        inProgress: in_progress as ReadonlySet<string>,
    };
}
