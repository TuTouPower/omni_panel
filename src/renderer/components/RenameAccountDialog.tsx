import { useEffect, useState } from "react";
import { Icon } from "./Icon";

interface RenameAccountDialogProps {
    account_id: string;
    current_label: string;
    on_save: (label: string) => void;
    on_close: () => void;
}

export function RenameAccountDialog({
    account_id,
    current_label,
    on_save,
    on_close,
}: RenameAccountDialogProps) {
    const [value, set_value] = useState(current_label);

    useEffect(() => {
        const h = (e: KeyboardEvent) => {
            if (e.key === "Escape") on_close();
        };
        window.addEventListener("keydown", h);
        return () => {
            window.removeEventListener("keydown", h);
        };
    }, [on_close]);

    const trimmed = value.trim();
    const changed = trimmed !== current_label.trim();

    return (
        <div className="acct-dialog-scrim" onMouseDown={on_close}>
            <div
                className="acct-dialog"
                onMouseDown={(e) => {
                    e.stopPropagation();
                }}
                role="dialog"
                aria-modal="true"
            >
                <div className="ad-head">
                    <div className="ad-htext">
                        <div className="ad-title">编辑备注名</div>
                        <div className="ad-sub mono">{account_id}</div>
                    </div>
                    <button className="ad-close" onClick={on_close} title="关闭" type="button">
                        <Icon name="close" size={17} strokeWidth={2} />
                    </button>
                </div>
                <div className="ad-body">
                    <div className="ad-field">
                        <label className="ad-label" htmlFor="rename-input">
                            备注名<span className="ad-opt">显示用</span>
                        </label>
                        <input
                            id="rename-input"
                            className="ad-input"
                            value={value}
                            autoFocus
                            onChange={(e) => {
                                set_value(e.target.value);
                            }}
                            placeholder="例如：工作账号"
                        />
                    </div>
                </div>
                <div className="ad-foot">
                    <div className="ad-foot-r">
                        <button className="ad-btn ghost" type="button" onClick={on_close}>
                            取消
                        </button>
                        <button
                            className={"ad-btn primary" + (changed ? "" : " disabled")}
                            type="button"
                            disabled={!changed}
                            onClick={() => {
                                on_save(trimmed);
                            }}
                        >
                            保存
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
