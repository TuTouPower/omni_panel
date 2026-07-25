import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConnectorInfo } from "../../shared/types/ipc";
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
import { VendorPicker } from "./add_account/VendorPicker";
import { ApiKeyForm } from "./add_account/ApiKeyForm";
import { SessionForm } from "./add_account/SessionForm";
import { LocalScanForm } from "./add_account/LocalScanForm";
import { AuthPlaceholder } from "./add_account/AuthPlaceholder";

function generate_instance_id(vendor_id: AddServiceId): string {
    return `${vendor_id}-${String(Date.now())}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface AddAccountParams {
    vendor_id: AddServiceId;
    account_name: string;
    auth_method: ResolvedAuthMethod;
    parameter_values: Record<string, string>;
    endpoint_overrides?: Record<string, string>;
    secrets: Record<string, string>;
}

interface AddAccountDialogProps {
    plugin_infos: ConnectorInfo[];
    on_close: () => void;
    on_save: (params: AddAccountParams) => Promise<void>;
}

function find_connector(
    plugin_infos: ConnectorInfo[],
    vendor_id: AddServiceId,
): ConnectorInfo | undefined {
    if (vendor_id === "cpa") {
        return (
            plugin_infos.find((c) => c.metadata?.name === "cpa") ??
            plugin_infos.find((c) => c.source === "gateway")
        );
    }
    return plugin_infos.find(
        (c) =>
            c.supportedProviders.includes(vendor_id) ||
            c.activeProviders.includes(vendor_id) ||
            c.metadata?.name === vendor_id,
    );
}

export function AddAccountDialog({ plugin_infos, on_close, on_save }: AddAccountDialogProps) {
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

    const selected_connector = useMemo(
        () => (vendor_id ? find_connector(plugin_infos, vendor_id) : undefined),
        [plugin_infos, vendor_id],
    );
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
    const is_unsupported_auth = auth_method === "cpa_mgmt";

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
        if (is_unsupported_auth) return;
        set_error_message(null);
        set_saving(true);
        try {
            const params: AddAccountParams = {
                vendor_id,
                account_name: account_name || vendor_label,
                auth_method,
                parameter_values: {},
                secrets: {},
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
        vendor_label,
        saving,
        is_unsupported_auth,
        on_save,
        on_close,
    ]);

    const handle_form_save = useCallback(
        async (params: AddAccountParams) => {
            await on_save(params);
            on_close();
        },
        [on_save, on_close],
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
                            {auth_method === "apikey" && (
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
                            {auth_method === "cpa_mgmt" && <AuthPlaceholder method={auth_method} />}
                        </>
                    )}
                </div>

                {/* Footer */}
                {step === "auth" &&
                    auth_method !== "oauth_device" &&
                    auth_method !== "web_login" && (
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
                                    className={
                                        "ad-btn primary" +
                                        (saving || is_unsupported_auth ? " disabled" : "")
                                    }
                                    type="button"
                                    disabled={saving || is_unsupported_auth}
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
