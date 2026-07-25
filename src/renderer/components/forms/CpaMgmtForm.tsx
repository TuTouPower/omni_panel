import { useCallback, useState } from "react";
import { Icon } from "../Icon";
import type { AddAccountParams } from "../AddAccountDialog";
import type { AddServiceId } from "../../lib/common-services";

export interface CpaMgmtFormProps {
    readonly vendor_id: AddServiceId;
    readonly default_endpoint?: string | undefined;
    readonly account_name: string;
    readonly set_account_name: (v: string) => void;
    readonly on_save: (params: AddAccountParams) => Promise<void>;
}

export function CpaMgmtForm({
    vendor_id,
    default_endpoint = "http://127.0.0.1:17863",
    account_name,
    set_account_name,
    on_save,
}: CpaMgmtFormProps) {
    const [key, set_key] = useState("");
    const [show_key, set_show_key] = useState(false);
    const [endpoint, set_endpoint] = useState(default_endpoint);
    const [saving, set_saving] = useState(false);
    const [error_message, set_error_message] = useState<string | null>(null);

    const handle_save = useCallback(async () => {
        if (saving) return;
        if (!key.trim()) {
            set_error_message("请输入管理密钥");
            return;
        }
        set_error_message(null);
        set_saving(true);
        try {
            await on_save({
                vendor_id,
                account_name: account_name || "CPA",
                auth_method: "cpa_mgmt",
                parameter_values: {},
                endpoint_overrides: { default: endpoint.trim() || default_endpoint },
                secrets: { cpa_mgmt_key: key.trim() },
            });
        } catch (err) {
            set_error_message(err instanceof Error ? err.message : String(err));
        } finally {
            set_saving(false);
        }
    }, [saving, key, endpoint, default_endpoint, vendor_id, account_name, on_save]);

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
                <label className="ad-label">CPA 管理密钥</label>
                <div className="ad-key">
                    <input
                        className="ad-input mono"
                        spellCheck={false}
                        autoCorrect="off"
                        autoCapitalize="off"
                        type={show_key ? "text" : "password"}
                        value={key}
                        onChange={(e) => {
                            set_key(e.target.value);
                        }}
                        placeholder="cpa-…"
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
                <label className="ad-label">管理端地址</label>
                <input
                    className="ad-input mono"
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="off"
                    value={endpoint}
                    onChange={(e) => {
                        set_endpoint(e.target.value);
                    }}
                    placeholder="http://127.0.0.1:17863"
                />
            </div>
            {error_message && <div className="ad-hint">{error_message}</div>}
            <div className="ad-foot">
                <button
                    className={"ad-btn primary" + (saving || !key.trim() ? " disabled" : "")}
                    type="button"
                    disabled={saving || !key.trim()}
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
