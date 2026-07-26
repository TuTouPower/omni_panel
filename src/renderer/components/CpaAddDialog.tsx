import { useState } from "react";
import { Icon, VendorMark } from "./Icon";
import { Toggle } from "./settings/Toggle";
import { PROVIDER_LABELS } from "../lib/provider-usage";
import type { UsageProvider } from "../../shared/schemas/plugin-output";

const CPA_SCOPE: UsageProvider[] = ["claude", "codex", "antigravity", "kimi"];

export function CpaAddDialog({ onClose }: { onClose: () => void }) {
    const [url, setUrl] = useState("");
    const [key, setKey] = useState("");
    const [showKey, setShowKey] = useState(false);
    const [scope, setScope] = useState<Set<UsageProvider>>(() => new Set(CPA_SCOPE));

    const toggleScope = (id: UsageProvider) => {
        setScope((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const canSave = url.trim().length > 0 && key.trim().length > 0;

    return (
        <div className="acct-dialog-scrim" onMouseDown={onClose}>
            <div
                className="acct-dialog wide"
                onMouseDown={(e) => {
                    e.stopPropagation();
                }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="cpa-dialog-title"
            >
                <div className="ad-head">
                    <div className="ad-htext">
                        <div className="ad-title" id="cpa-dialog-title">
                            添加 CPA Manager
                        </div>
                        <div className="ad-sub">批量接入多个服务商账号</div>
                    </div>
                    <button className="ad-close" onClick={onClose} title="关闭" type="button">
                        <Icon name="close" size={17} strokeWidth={2} />
                    </button>
                </div>
                <div className="ad-body">
                    <div className="ad-field">
                        <label className="ad-label">CPA-Manager URL</label>
                        <input
                            className="ad-input mono"
                            value={url}
                            onChange={(e) => {
                                setUrl(e.target.value);
                            }}
                            placeholder="https://cpa.example.com"
                            autoFocus
                            spellCheck={false}
                            autoCorrect="off"
                            autoCapitalize="off"
                        />
                    </div>
                    <div className="ad-field">
                        <label className="ad-label">管理密钥</label>
                        <div className="ad-key">
                            <input
                                className="ad-input mono"
                                type={showKey ? "text" : "password"}
                                value={key}
                                onChange={(e) => {
                                    setKey(e.target.value);
                                }}
                                placeholder="cpa_sk_..."
                                spellCheck={false}
                                autoCorrect="off"
                                autoCapitalize="off"
                            />
                            <button
                                className="ad-eye"
                                onClick={() => {
                                    setShowKey(!showKey);
                                }}
                                title={showKey ? "隐藏" : "显示"}
                                type="button"
                            >
                                <Icon name={showKey ? "eye_off" : "eye"} size={16} />
                            </button>
                        </div>
                    </div>
                    <div className="ad-field">
                        <label className="ad-label">同步范围</label>
                        <div className="scope-list">
                            {CPA_SCOPE.map((id) => (
                                <div className="scope-item" key={id}>
                                    <VendorMark id={id} size={20} />
                                    <span className="si-name">{PROVIDER_LABELS[id]}</span>
                                    <Toggle
                                        on={scope.has(id)}
                                        onClick={() => {
                                            toggleScope(id);
                                        }}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="ad-foot">
                    <button className="ad-test" type="button">
                        <Icon name="refresh" size={14} />
                        测试连接
                    </button>
                    <div className="ad-foot-r">
                        <button className="ad-btn ghost" onClick={onClose} type="button">
                            取消
                        </button>
                        <button
                            className={`ad-btn primary${canSave ? "" : " disabled"}`}
                            disabled={!canSave}
                            type="button"
                        >
                            保存并同步
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
