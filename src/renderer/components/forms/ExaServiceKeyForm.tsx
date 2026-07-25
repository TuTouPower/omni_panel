import { useCallback, useState } from "react";
import { Icon } from "../Icon";
import type { AddAccountParams } from "../AddAccountDialog";
import type { AddServiceId } from "../../lib/common-services";

export interface ExaServiceKeyFormProps {
    readonly vendor_id: AddServiceId;
    readonly secret_name: string;
    readonly account_name: string;
    readonly set_account_name: (v: string) => void;
    readonly on_save: (params: AddAccountParams) => Promise<void>;
}

export function ExaServiceKeyForm({
    vendor_id,
    secret_name,
    account_name,
    set_account_name,
    on_save,
}: ExaServiceKeyFormProps) {
    const [service_key, set_service_key] = useState("");
    const [show_key, set_show_key] = useState(false);
    const [api_key_id, set_api_key_id] = useState("");
    const [limit, set_limit] = useState("");
    const [saving, set_saving] = useState(false);
    const [error_message, set_error_message] = useState<string | null>(null);

    const handle_save = useCallback(async () => {
        if (saving) return;
        if (!service_key.trim()) {
            set_error_message("请输入 Service Key");
            return;
        }
        if (!api_key_id.trim()) {
            set_error_message("请输入 API Key ID");
            return;
        }
        set_error_message(null);
        set_saving(true);
        try {
            const parameter_values: Record<string, string> = {
                API_KEY_ID: api_key_id.trim(),
            };
            const limit_value = limit.trim();
            if (limit_value) {
                parameter_values["LIMIT"] = limit_value;
            }
            await on_save({
                vendor_id,
                account_name: account_name || "Exa",
                auth_method: "apikey",
                parameter_values,
                secrets: { [secret_name]: service_key.trim() },
            });
        } catch (err) {
            set_error_message(err instanceof Error ? err.message : String(err));
        } finally {
            set_saving(false);
        }
    }, [saving, service_key, api_key_id, limit, vendor_id, account_name, secret_name, on_save]);

    return (
        <div>
            <div className="ad-field">
                <label className="ad-label">
                    备注<span className="ad-opt">显示用</span>
                </label>
                <input
                    className="ad-input"
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="off"
                    value={account_name}
                    autoFocus
                    onChange={(e) => {
                        set_account_name(e.target.value);
                    }}
                    placeholder="例如：工作账号"
                />
            </div>
            <div className="ad-field">
                <label className="ad-label">Service Key</label>
                <div className="ad-key">
                    <input
                        className="ad-input mono"
                        spellCheck={false}
                        autoCorrect="off"
                        autoCapitalize="off"
                        type={show_key ? "text" : "password"}
                        value={service_key}
                        onChange={(e) => {
                            set_service_key(e.target.value);
                        }}
                        placeholder="exa-…"
                    />
                    <button
                        className="ad-eye"
                        type="button"
                        onClick={() => {
                            set_show_key((v) => !v);
                        }}
                        title={show_key ? "隐藏" : "显示"}
                    >
                        <Icon name={show_key ? "eye_off" : "eye"} size={16} />
                    </button>
                </div>
                <div className="ad-hint">
                    <Icon name="lock" size={12} strokeWidth={1.8} />
                    密钥仅加密保存在本地
                </div>
            </div>
            <div className="ad-field">
                <label className="ad-label">API Key ID</label>
                <input
                    className="ad-input mono"
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="off"
                    value={api_key_id}
                    onChange={(e) => {
                        set_api_key_id(e.target.value);
                    }}
                    placeholder="例如：my-key-id"
                />
            </div>
            <div className="ad-field">
                <label className="ad-label">
                    限额<span className="ad-opt">可选</span>
                </label>
                <input
                    className="ad-input"
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="off"
                    value={limit}
                    onChange={(e) => {
                        set_limit(e.target.value);
                    }}
                    placeholder="例如：10000"
                />
            </div>
            {error_message && <div className="ad-hint">{error_message}</div>}
            <div className="ad-foot">
                <button
                    className={
                        "ad-btn primary" +
                        (saving || !service_key.trim() || !api_key_id.trim() ? " disabled" : "")
                    }
                    type="button"
                    disabled={saving || !service_key.trim() || !api_key_id.trim()}
                    onClick={() => {
                        void handle_save();
                    }}
                >
                    添加账号
                </button>
            </div>
        </div>
    );
}
