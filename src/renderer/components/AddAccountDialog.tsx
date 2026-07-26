import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConnectorCatalogEntry, ConnectorInfo } from "../../shared/types/ipc";
import type { AddServiceId } from "../lib/common-services";
import { VendorMark, Icon } from "./Icon";
import { ADD_COMMON_SERVICES } from "../lib/common-services";
import {
    fallback_secret_name,
    resolve_auth_descriptor,
    resolve_auth_method,
    type ResolvedAuthMethod,
} from "../lib/auth-flow-registry";
import { OAuthDeviceForm } from "./forms/OAuthDeviceForm";
import { WebLoginForm } from "./forms/WebLoginForm";
import { CpaMgmtForm } from "./forms/CpaMgmtForm";
import { ExaServiceKeyForm } from "./forms/ExaServiceKeyForm";
import { VendorPicker } from "./add_account/VendorPicker";
import { ApiKeyForm } from "./add_account/ApiKeyForm";
import { SessionForm } from "./add_account/SessionForm";
import { LocalScanForm } from "./add_account/LocalScanForm";

function generate_instance_id(vendor_id: AddServiceId): string {
    return `${vendor_id}-${String(Date.now())}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface AddAccountParams {
    vendor_id: AddServiceId;
    source_instance_id?: string;
    /** t121: manifest id used by config.createInstance to spawn a new instance. */
    manifest_id?: string;
    account_name: string;
    auth_method: ResolvedAuthMethod;
    parameter_values: Record<string, string>;
    endpoint_overrides?: Record<string, string>;
    secrets: Record<string, string>;
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
            c.metadata?.name === vendor_id ||
            c.supportedProviders.includes(vendor_id) ||
            c.activeProviders.includes(vendor_id),
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
        web_login: "网页登录授权",
        cpa_mgmt: "CPA 管理端授权",
    };

    const title = vendor_id ? `添加 ${vendor_label} 账号` : "添加账号";
    const sub = vendor_id ? sub_by_auth[auth_method] : "";
    const wide = auth_method === "local_cli";
    const has_extra_fields = (auth_descriptor?.extra_fields?.length ?? 0) > 0;
    const form_handles_save =
        auth_method === "oauth_device" ||
        auth_method === "web_login" ||
        auth_method === "cpa_mgmt" ||
        (auth_method === "apikey" && vendor_id === "exa" && has_extra_fields);

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
    }, []);

    const handle_save = useCallback(async () => {
        if (!vendor_id || saving) return;
        if (form_handles_save) return;
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
        on_save,
        on_close,
    ]);

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

    return (
        <div className="acct-dialog-scrim" onMouseDown={on_close}>
            <div
                className={"acct-dialog aa" + (wide ? " wide" : "")}
                onMouseDown={(e) => {
                    e.stopPropagation();
                }}
            >
                {/* Header */}
                <div className="ad-head">
                    {step === "auth" && vendor_id ? (
                        <span className="ad-mark">
                            <VendorMark id={vendor_id} size={24} />
                        </span>
                    ) : (
                        <span className="ad-mark">
                            <VendorMark id="overview" size={24} />
                        </span>
                    )}
                    <div className="ad-htext">
                        <div className="ad-title">{title}</div>
                        {sub && <div className="ad-sub">{sub}</div>}
                    </div>
                    {step === "auth" && (
                        <button
                            className="ad-back"
                            type="button"
                            onClick={handle_back}
                            title="返回选择服务"
                        >
                            <Icon name="back" size={17} strokeWidth={2} />
                        </button>
                    )}
                    <button className="ad-close" onClick={on_close} title="关闭" type="button">
                        <Icon name="close" size={17} strokeWidth={2} />
                    </button>
                </div>

                {/* Body */}
                <div className="ad-body">
                    {step === "vendor" && (
                        <VendorPicker
                            plugin_infos={plugin_infos}
                            on_select={handle_select_vendor}
                        />
                    )}
                    {step === "auth" && vendor_id && (
                        <>
                            {auth_method === "apikey" && !has_extra_fields && (
                                <ApiKeyForm
                                    account_name={account_name}
                                    set_account_name={set_account_name}
                                    form_ref={api_form_ref}
                                />
                            )}
                            {auth_method === "session" && (
                                <SessionForm
                                    account_name={account_name}
                                    set_account_name={set_account_name}
                                    form_ref={session_form_ref}
                                />
                            )}
                            {auth_method === "local_cli" && <LocalScanForm vendor_id={vendor_id} />}
                            {auth_method === "oauth_device" && (
                                <OAuthDeviceForm
                                    key={vendor_id}
                                    instance_id={oauth_instance_id_ref.current}
                                    vendor={vendor_id === "kimi" ? "kimi" : "grok"}
                                    vendor_id={vendor_id}
                                    secret_name={
                                        auth_descriptor?.secret_name ??
                                        fallback_secret_name(selected_connector)
                                    }
                                    account_name={account_name}
                                    set_account_name={set_account_name}
                                    on_save={handle_form_save}
                                />
                            )}
                            {auth_method === "web_login" && auth_descriptor?.login_url && (
                                <WebLoginForm
                                    key={vendor_id}
                                    provider={vendor_id}
                                    login_url={auth_descriptor.login_url}
                                    secret_name={auth_descriptor.secret_name}
                                    account_name={account_name}
                                    set_account_name={set_account_name}
                                    on_save={handle_form_save}
                                />
                            )}
                            {auth_method === "cpa_mgmt" && (
                                <CpaMgmtForm
                                    key={vendor_id}
                                    vendor_id={vendor_id}
                                    default_endpoint={
                                        selected_connector?.metadata?.endpoints?.["default"] ??
                                        undefined
                                    }
                                    account_name={account_name}
                                    set_account_name={set_account_name}
                                    on_save={handle_form_save}
                                />
                            )}
                            {auth_method === "apikey" &&
                                vendor_id === "exa" &&
                                has_extra_fields && (
                                    <ExaServiceKeyForm
                                        key={vendor_id}
                                        vendor_id={vendor_id}
                                        secret_name={
                                            auth_descriptor?.secret_name ??
                                            fallback_secret_name(selected_connector)
                                        }
                                        account_name={account_name}
                                        set_account_name={set_account_name}
                                        on_save={handle_form_save}
                                    />
                                )}
                        </>
                    )}
                </div>

                {/* Footer */}
                {step === "auth" && !form_handles_save && (
                    <div className="ad-foot">
                        {error_message && <div className="ad-hint">{error_message}</div>}
                        {auth_method !== "local_cli" && (
                            <button className="ad-test" type="button" disabled>
                                <Icon name="refresh" size={14} strokeWidth={1.9} />
                                测试连接
                            </button>
                        )}
                        <div className="ad-foot-r">
                            <button className="ad-btn ghost" type="button" onClick={on_close}>
                                取消
                            </button>
                            <button
                                className={"ad-btn primary" + (saving ? " disabled" : "")}
                                type="button"
                                disabled={saving}
                                onClick={() => {
                                    void handle_save();
                                }}
                            >
                                {auth_method === "local_cli" ? "导入账号" : "添加账号"}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
