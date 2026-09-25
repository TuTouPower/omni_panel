import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConnectorCatalogEntry, ConnectorInfo, LocalScanResult } from "../../shared/types/ipc";
import type { AddServiceId } from "../lib/common-services";
import { VendorMark, Icon } from "./Icon";
import { ADD_COMMON_SERVICES } from "../lib/common-services";
import {
    fallback_secret_name,
    resolve_auth_descriptor,
    resolve_auth_method,
    type ResolvedAuthMethod,
} from "../lib/auth-flow-registry";
import { VendorPicker } from "./add_account/VendorPicker";
import { resolve_form_renderer, type FormContext } from "./add_account/form_registry";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";
import type { AddAccountParams } from "./add_account/add_account_params";

export type { AddAccountParams } from "./add_account/add_account_params";

function generate_instance_id(vendor_id: AddServiceId): string {
    // A75: 使用标准安全随机器代替 Math.random
    return `${vendor_id}-${crypto.randomUUID()}`;
}

interface AddAccountDialogProps {
    plugin_infos: ConnectorInfo[];
    /** t121: manifest catalog; resolves auth even when no live instance exists. */
    catalog?: ConnectorCatalogEntry[];
    on_close: () => void;
    on_save: (params: AddAccountParams) => Promise<void>;
}

/**
 * t121: prefer the manifest catalog (independent of config.plugins and the
 * removedConnectorIds tombstone). Falls back to plugin_infos so legacy
 * instance-backed lookups still work.
 *
 * Two-phase catalog match (f002): exact `manifest_id` first, then
 * `supported_providers` — prevents a vendor that equals a cpa monitored
 * provider (e.g. "claude") from matching the cpa entry by accident.
 *
 * Returns the resolved `manifest_id` explicitly (f004) so handle_save does not
 * depend on the implicit `metadata.name === manifest id` contract.
 */
interface ResolvedVendor {
    connector: ConnectorInfo;
    manifest_id: string | undefined;
}

function catalog_entry_to_connector(entry: ConnectorCatalogEntry): ConnectorInfo {
    // Pseudo ConnectorInfo: no live instance, but metadata drives auth form.
    return {
        instanceId: "",
        sourceInstanceId: "",
        stateId: "",
        name: entry.metadata.name ?? entry.manifest_id,
        displayName: "",
        enabled: true,
        source: entry.source,
        supportedProviders: entry.supported_providers,
        activeProviders: entry.supported_providers,
        metadata: entry.metadata,
        snapshot: { status: "idle" },
    };
}

function find_vendor(
    catalog: readonly ConnectorCatalogEntry[],
    plugin_infos: readonly ConnectorInfo[],
    vendor_id: AddServiceId,
): ResolvedVendor | undefined {
    const exact = catalog.find((c) => c.manifest_id === vendor_id);
    if (exact)
        return { connector: catalog_entry_to_connector(exact), manifest_id: exact.manifest_id };
    const by_provider = catalog.find((c) => c.supported_providers.includes(vendor_id));
    if (by_provider) {
        return {
            connector: catalog_entry_to_connector(by_provider),
            manifest_id: by_provider.manifest_id,
        };
    }
    const info = plugin_infos.find(
        (c) =>
            (c.metadata?.name === vendor_id ||
                c.supportedProviders.includes(vendor_id) ||
                c.activeProviders.includes(vendor_id)) &&
            // t461: 回退分支排除网关实例——CPA 的 supportedProviders 为 monitor_*
            // 全集，catalog 缺失时会把 kimi/claude/codex/antigravity 误判为 cpa；
            // cpa 本体不受影响。
            (vendor_id === "cpa" || c.source !== "gateway"),
    );
    if (info) {
        // metadata.name is set to manifest id by metadata_from_definition (connector-ipc.ts).
        return { connector: info, manifest_id: info.metadata?.name };
    }
    return undefined;
}

export function AddAccountDialog({
    plugin_infos,
    catalog = [],
    on_close,
    on_save,
}: AddAccountDialogProps) {
    const [step, set_step] = useState<"vendor" | "auth">("vendor");
    const [vendor_id, set_vendor_id] = useState<AddServiceId | null>(null);
    const [account_name, set_account_name] = useState("");
    const [saving, set_saving] = useState(false);
    const [error_message, set_error_message] = useState<string | null>(null);
    const api_form_ref = useRef<{ api_key: string; endpoint_override?: string }>({
        api_key: "",
    });
    const session_form_ref = useRef<{ cookie: string }>({
        cookie: "",
    });
    const oauth_instance_id_ref = useRef("");
    const [local_scan_result, set_local_scan_result] = useState<LocalScanResult | null>(null);

    const resolved_vendor = useMemo(
        () => (vendor_id ? find_vendor(catalog, plugin_infos, vendor_id) : undefined),
        [catalog, plugin_infos, vendor_id],
    );
    const selected_connector = resolved_vendor?.connector;
    const selected_manifest_id = resolved_vendor?.manifest_id;
    const auth_descriptor = useMemo(
        () => resolve_auth_descriptor(selected_connector),
        [selected_connector],
    );
    const auth_method: ResolvedAuthMethod = useMemo(
        () => (vendor_id ? resolve_auth_method(selected_connector) : "apikey"),
        [selected_connector, vendor_id],
    );

    const vendor_label =
        ADD_COMMON_SERVICES.find((s) => s.id === vendor_id)?.label ?? vendor_id ?? "";

    const sub_by_auth: Record<ResolvedAuthMethod, string> = {
        apikey: "粘贴 API 密钥即可接入",
        session: "网页登录或粘贴 Cookie",
        local_cli: "扫描本地 CLI 授权文件",
        oauth_device: "OAuth 设备码授权",
        oauth_pkce: "浏览器授权登录",
        web_login: "网页登录授权",
        cpa_mgmt: "CPA 管理端授权",
    };

    const title = vendor_id ? `添加 ${vendor_label} 账号` : "添加账号";
    const sub = vendor_id ? sub_by_auth[auth_method] : "";
    const wide = auth_method === "local_cli";

    // AC-001 / A62: 校验 local_cli 是否已完成扫描且凭据有效
    const is_local_cli_invalid = auth_method === "local_cli" && !local_scan_result?.details?.valid;

    const handle_form_save = useCallback(
        async (params: AddAccountParams) => {
            await on_save({
                ...params,
                ...(selected_manifest_id ? { manifest_id: selected_manifest_id } : {}),
                ...(selected_connector?.instanceId
                    ? { source_instance_id: selected_connector.instanceId }
                    : {}),
            });
            on_close();
        },
        [on_save, on_close, selected_connector, selected_manifest_id],
    );

    const form_context = useMemo<FormContext | null>(() => {
        if (!vendor_id) return null;
        return {
            vendor_id,
            account_name,
            set_account_name,
            auth_descriptor,
            selected_connector,
            api_form_ref,
            session_form_ref,
            local_scan_result,
            set_local_scan_result,
            oauth_instance_id: oauth_instance_id_ref.current,
            on_save: handle_form_save,
        };
    }, [
        vendor_id,
        account_name,
        auth_descriptor,
        selected_connector,
        local_scan_result,
        handle_form_save,
    ]);

    // A100 / AC-002: 注册表驱动表单渲染与保存代理判定
    const form_renderer = form_context
        ? resolve_form_renderer(auth_method, form_context)
        : undefined;
    const form_handles_save = form_renderer?.handles_save ?? false;

    // ESC to close
    useEffect(() => {
        const h = (e: KeyboardEvent) => {
            if (e.key === "Escape") on_close();
        };
        window.addEventListener("keydown", h);
        return () => {
            window.removeEventListener("keydown", h);
        };
    }, [on_close]);

    const handle_select_vendor = useCallback((id: AddServiceId) => {
        set_vendor_id(id);
        set_account_name("");
        set_error_message(null);
        oauth_instance_id_ref.current = generate_instance_id(id);
        set_step("auth");
    }, []);

    const handle_back = useCallback(() => {
        set_step("vendor");
        set_vendor_id(null);
        set_account_name("");
        set_error_message(null);
        set_local_scan_result(null);
    }, []);

    const handle_save = useCallback(async () => {
        if (!vendor_id || saving) return;
        if (form_handles_save) return;
        if (is_local_cli_invalid) {
            set_error_message(local_scan_result?.details?.error ?? "未找到有效的本地授权凭据");
            return;
        }
        set_error_message(null);
        set_saving(true);
        try {
            const params: AddAccountParams = {
                vendor_id,
                account_name: account_name || vendor_label,
                auth_method,
                parameter_values: {},
                secrets: {},
                ...(selected_manifest_id ? { manifest_id: selected_manifest_id } : {}),
                ...(selected_connector?.instanceId
                    ? { source_instance_id: selected_connector.instanceId }
                    : {}),
            };

            const secret_name =
                auth_descriptor?.secret_name ?? fallback_secret_name(selected_connector);

            // Collect form data based on auth method
            if (auth_method === "apikey") {
                const data = api_form_ref.current;
                params.secrets = { [secret_name]: data.api_key };
                if (data.endpoint_override) {
                    params.endpoint_overrides = {
                        default: data.endpoint_override,
                    };
                }
            } else if (auth_method === "session") {
                const data = session_form_ref.current;
                const cookie = data.cookie.trim();
                if (cookie) {
                    params.secrets = { [secret_name]: cookie };
                }
            }

            await on_save(params);
            on_close();
        } catch (err) {
            // t356 AC-001: 保存失败显示可见错误，不再静默。
            set_error_message(err instanceof Error ? err.message : "添加失败");
        } finally {
            set_saving(false);
        }
    }, [
        vendor_id,
        account_name,
        auth_method,
        auth_descriptor,
        selected_connector,
        selected_manifest_id,
        vendor_label,
        saving,
        form_handles_save,
        is_local_cli_invalid,
        local_scan_result,
        on_save,
        on_close,
    ]);

    return (
        <Dialog
            open
            onClose={on_close}
            width={wide ? 420 : 372}
            ariaLabel={title}
            backdropTestId="add-account-dialog-backdrop"
            title={
                <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary-container)]">
                        <VendorMark
                            id={step === "auth" && vendor_id ? vendor_id : "overview"}
                            size={24}
                        />
                    </span>
                    <div className="min-w-0">
                        <div className="text-[length:var(--text-title-sm)] font-semibold">
                            {title}
                        </div>
                        {sub && (
                            <div className="mt-1 truncate text-[length:var(--text-body-sm)] text-[var(--color-on-surface-muted)]">
                                {sub}
                            </div>
                        )}
                    </div>
                    {step === "auth" && (
                        <Button
                            variant="icon"
                            size="sm"
                            className="ml-auto h-8 w-8 shrink-0 p-0"
                            onClick={handle_back}
                            title="返回选择服务"
                            aria-label="返回选择服务"
                        >
                            <Icon name="back" size={17} strokeWidth={2} />
                        </Button>
                    )}
                    <Button
                        variant="icon"
                        size="sm"
                        className={"h-8 w-8 shrink-0 p-0" + (step === "vendor" ? " ml-auto" : "")}
                        onClick={on_close}
                        title="关闭"
                        aria-label="关闭"
                    >
                        <Icon name="close" size={17} strokeWidth={2} />
                    </Button>
                </div>
            }
            footer={
                step === "auth" && !form_handles_save ? (
                    <>
                        {error_message && (
                            <div
                                className="mr-auto text-[length:var(--text-body-sm)] text-[var(--color-error)]"
                                role="alert"
                            >
                                {error_message}
                            </div>
                        )}
                        {auth_method !== "local_cli" && (
                            <Button variant="ghost" size="sm" type="button" disabled>
                                <Icon name="refresh" size={14} strokeWidth={1.9} />
                                测试连接
                            </Button>
                        )}
                        <Button variant="ghost" size="sm" type="button" onClick={on_close}>
                            取消
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            type="button"
                            disabled={saving || is_local_cli_invalid}
                            onClick={() => {
                                void handle_save();
                            }}
                        >
                            {auth_method === "local_cli" ? "导入账号" : "添加账号"}
                        </Button>
                    </>
                ) : undefined
            }
        >
            {step === "vendor" && <VendorPicker on_select={handle_select_vendor} />}
            {step === "auth" && form_renderer && form_context && form_renderer.render(form_context)}
        </Dialog>
    );
}
