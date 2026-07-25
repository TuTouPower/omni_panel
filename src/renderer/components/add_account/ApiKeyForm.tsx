import { useState, useEffect } from "react";
import { Icon } from "../Icon";

export interface ApiKeyFormProps {
    readonly account_name: string;
    readonly set_account_name: (v: string) => void;
    readonly form_ref: React.RefObject<{ api_key: string; endpoint_override?: string }>;
}

export function ApiKeyForm({ account_name, set_account_name, form_ref }: ApiKeyFormProps) {
    const [key, set_key] = useState("");
    const [show_key, set_show_key] = useState(false);
    const [endpoint, set_endpoint] = useState("");

    useEffect(() => {
        form_ref.current = {
            api_key: key,
            ...(endpoint ? { endpoint_override: endpoint } : {}),
        };
    }, [key, endpoint, form_ref]);

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
                <label className="ad-label">API 密钥</label>
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
                        placeholder="sk-…"
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
                <label className="ad-label">
                    接口地址<span className="ad-opt">可选</span>
                </label>
                <input
                    className="ad-input mono"
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="off"
                    value={endpoint}
                    onChange={(e) => {
                        set_endpoint(e.target.value);
                    }}
                    placeholder="默认（官方接口）"
                />
            </div>
        </div>
    );
}
