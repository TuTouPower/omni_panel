import { session } from "electron";
import type { AppConfigStore } from "../config/config-store";
import type { SecretsStore } from "../config/secrets-store";
import type { ConnectorDefinition } from "../connector/manifest-loader";
import type { UsageProvider } from "../../../shared/schemas/plugin-output";
import { usageProviderSchema } from "../../../shared/schemas/plugin-output";
import { createLogger } from "../../../shared/lib/logger";

const log = createLogger("cookie-refresh");

// Cookie / token values are frequently echoed into Error messages when a
// parser, validator, or HTTP layer rejects a payload that embeds them.
// Strip anything that looks like `key=<long-value>` before logging so we
// never persist a raw secret, even when the upstream library is careless.
const SECRET_VALUE_PATTERN = /([A-Za-z_][\w-]*)=([^\s;,"'`<>]{8,})/g;

function redact_secret_in_text(input: string): string {
    if (!input) return input;
    return input.replace(SECRET_VALUE_PATTERN, (_match, key: string, value: string) => {
        const head = value.slice(0, 8);
        return `${key}=${head}***`;
    });
}

function redact_error(err: unknown): { name: string; message: string; stack?: string } {
    if (err instanceof Error) {
        return {
            name: err.name,
            message: redact_secret_in_text(err.message),
            stack: err.stack ? redact_secret_in_text(err.stack) : undefined,
        };
    }
    if (typeof err === "string") {
        return { name: "Error", message: redact_secret_in_text(err) };
    }
    // For non-Error objects we can't safely stringify without risking
    // `[object Object]` or recursing into unknown shapes. Record the
    // constructor name only.
    const ctor_name =
        err !== null && typeof err === "object" && "constructor" in err
            ? String((err as { constructor: { name?: unknown } }).constructor.name)
            : "unknown";
    return { name: "Error", message: `non-Error throw: ${ctor_name}` };
}

interface VendorCookieConfig {
    cookieNames: string[];
    secretParamName: string;
    domains?: string[];
}

const VENDOR_COOKIE_MAP: Partial<Record<UsageProvider, VendorCookieConfig>> = {
    mimo: {
        cookieNames: ["api-platform_serviceToken", "api-platform_slh", "api-platform_ph", "userId"],
        domains: [".platform.xiaomimimo.com", ".xiaomimimo.com"],
        secretParamName: "SESSION_COOKIE",
    },
    kimi: { cookieNames: ["access_token"], secretParamName: "SESSION_COOKIE" },
};

export interface CookieRefreshDeps {
    configStore: AppConfigStore;
    secretsStore: SecretsStore;
    definitions: readonly ConnectorDefinition[];
}

export type CookieRefreshService = ReturnType<typeof createCookieRefreshService>;

export function createCookieRefreshService(deps: CookieRefreshDeps) {
    const in_progress = new Set<string>();

    async function refresh_vendor(
        vendor_id: UsageProvider,
        instance_ids: string[],
        cookie_config: VendorCookieConfig,
    ): Promise<boolean> {
        // Use the same persistent partition as the login window.
        // Cookies set during manual login survive across app restarts
        // and are available here without opening any window.
        const partition = `persist:${vendor_id}-login`;
        const refresh_session = session.fromPartition(partition);

        try {
            let matched: Electron.Cookie[];
            if (cookie_config.domains && cookie_config.domains.length > 0) {
                // Domain-based: fetch all cookies for each domain, no name filtering.
                // This picks up any new cookies the platform adds without code changes.
                const domain_cookies = await Promise.all(
                    cookie_config.domains.map((domain) => refresh_session.cookies.get({ domain })),
                );
                const seen = new Set<string>();
                matched = [];
                for (const batch of domain_cookies) {
                    for (const c of batch) {
                        const key = `${c.name}:${c.domain ?? ""}`;
                        if (!seen.has(key)) {
                            seen.add(key);
                            matched.push(c);
                        }
                    }
                }
                log.info(
                    `Domain-based cookie fetch for ${vendor_id}: ${String(matched.length)} cookies across ${String(cookie_config.domains.length)} domains`,
                );
            } else {
                const all_cookies = await refresh_session.cookies.get({});
                const target_names = new Set(cookie_config.cookieNames);
                matched = all_cookies.filter((c) => target_names.has(c.name));
            }
            if (matched.length === 0) {
                log.info(
                    `No cookies found in persistent session for ${vendor_id} — user needs to re-login`,
                );
                return false;
            }

            const cookie_parts = matched.map((c) => `${c.name}=${c.value}`);
            const cookie_header = cookie_parts.join("; ");
            const results = await Promise.allSettled(
                instance_ids.map((instance_id) =>
                    deps.secretsStore.set(
                        `${instance_id}:${cookie_config.secretParamName}`,
                        cookie_header,
                    ),
                ),
            );
            const succeeded = results.filter((r) => r.status === "fulfilled").length;
            const failed = results.filter((r) => r.status === "rejected").length;
            log.info(
                `Cookie refresh for ${vendor_id}: ${String(succeeded)} saved, ${String(failed)} failed (from persistent session)`,
            );
            return succeeded > 0;
        } catch (err: unknown) {
            log.error(`Failed to refresh cookies for ${vendor_id}`, redact_error(err));
            return false;
        } finally {
            in_progress.delete(vendor_id);
        }
    }

    interface VendorGroup {
        instance_ids: string[];
    }

    async function refreshAll(): Promise<{ refreshed: number; failed: number }> {
        const config = await deps.configStore.load();
        const plugins = config.plugins;

        // Build eligible instances grouped by vendor
        const vendor_groups = new Map<UsageProvider, VendorGroup>();

        for (const plugin of plugins) {
            const def = deps.definitions.find((d) => d.executablePath === plugin.executablePath);
            if (!def) continue;

            const manifest = def.manifest;
            if (manifest.id === "cpa") continue;

            const has_secret_param = manifest.parameters.some((p) => p.type === "secret");
            if (!has_secret_param) continue;

            const parsed_provider = usageProviderSchema.safeParse(manifest.provider);
            if (!parsed_provider.success) continue;
            const cookie_config = VENDOR_COOKIE_MAP[parsed_provider.data];
            if (!cookie_config) continue;

            let group = vendor_groups.get(parsed_provider.data);
            if (!group) {
                group = { instance_ids: [] };
                vendor_groups.set(parsed_provider.data, group);
            }
            if (!group.instance_ids.includes(plugin.instanceId)) {
                group.instance_ids.push(plugin.instanceId);
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
            tasks.push(refresh_vendor(vendor_id, group.instance_ids, cookie_config));
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
