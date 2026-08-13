import { useEffect, useState } from "react";
import type { AddAccountParams } from "../components/AddAccountDialog";
import type { ConnectorCatalogEntry } from "../../shared/types/ipc";
import type { AppConfiguration } from "../../shared/types/config";
import { log } from "../views/settings-view/lib";

export type SavePluginSettings = (
    instanceId: string,
    nonSecrets: Record<string, string>,
    secrets: Record<string, string>,
    endpointOverrides: Record<string, string>,
    refreshIntervalSeconds: number,
    display_name?: string,
    refresh_after_save?: boolean,
    base_config?: AppConfiguration,
) => Promise<void>;

/**
 * t121: load manifest catalog once. Independent of config.plugins / tombstone,
 * so the add-account dialog can resolve auth for vendors with no live instance.
 */
export function useConnectorCatalog(): ConnectorCatalogEntry[] {
    const [catalog, setCatalog] = useState<ConnectorCatalogEntry[]>([]);
    useEffect(() => {
        let cancelled = false;
        window.usageboard.connector
            .catalog()
            .then((entries) => {
                if (!cancelled) setCatalog(entries);
            })
            .catch((err: unknown) => {
                log.warn("加载 connector catalog 失败", err);
            });
        return () => {
            cancelled = true;
        };
    }, []);
    return catalog;
}

/**
 * t121: 从 manifest 直接建实例，不再依赖"先有同类实例可 duplicate"。
 * 解决墓碑内 vendor（无现存实例）无法添加账号的问题。
 *
 * Returns the new dialog state on success, or null when the params lack a
 * manifest_id (caller must not transition the dialog in that case).
 */
export async function create_instance_and_save(
    params: AddAccountParams,
    savePluginSettings: SavePluginSettings,
): Promise<{ instanceId: string; pluginName: string | undefined } | null> {
    const manifest_id = params.manifest_id;
    if (!manifest_id) {
        log.warn(`add account: no manifest_id for vendor_id=${params.vendor_id}`);
        return null;
    }
    const created = await window.usageboard.config.createInstance(manifest_id);
    // createInstance 会 reload config；从 main 再取一次最新 config，避免闭包覆盖
    const latest = await window.usageboard.config.get();
    try {
        await savePluginSettings(
            created.instanceId,
            params.parameter_values,
            params.secrets,
            params.endpoint_overrides ?? {},
            0,
            params.account_name,
            true,
            latest.config,
        );
        if (params.auth_method === "oauth_device" && params.oauth_source_instance_id) {
            if (params.vendor_id === "grok") {
                const grok_api = window.usageboard.grok;
                if ("logout" in grok_api) {
                    await grok_api.logout(params.oauth_source_instance_id);
                }
            } else if (params.vendor_id === "kimi") {
                const kimi_api = window.usageboard.kimi;
                if ("logout" in kimi_api) {
                    await kimi_api.logout(params.oauth_source_instance_id);
                }
            }
        }
    } catch (err) {
        // t357 AC-001: createInstance 已把新实例写入 config，后续步骤失败时补偿
        // 删除刚创建的 instanceId。删除须同步写回 removedConnectorIds 墓碑——
        // handleConfigSave 的 stale-save 保护会把「磁盘存在、incoming 缺失、墓碑无
        // 该 manifestId」的插件恢复写回；而 createInstance 已从墓碑清除该 id，
        // 不补墓碑则清理 save 后实例仍被保护恢复，空账号残留。
        try {
            const removedConnectorIds = Array.from(
                new Set([...(latest.config.removedConnectorIds ?? []), manifest_id]),
            );
            await window.usageboard.config.save({
                ...latest.config,
                removedConnectorIds,
                plugins: latest.config.plugins.filter(
                    (plugin) => plugin.instanceId !== created.instanceId,
                ),
            });
        } catch (cleanup_err: unknown) {
            log.warn("add account 失败后清理实例也失败", cleanup_err);
        }
        throw err;
    }
    return {
        instanceId: created.instanceId,
        pluginName: params.account_name,
    };
}
