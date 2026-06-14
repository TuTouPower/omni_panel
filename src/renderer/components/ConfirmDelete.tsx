import { useEffect, useRef } from "react";
import { Icon } from "./Icon";

interface ConfirmDeleteProps {
    name: string;
    onCancel: () => void;
    onConfirm: () => void;
    /** Dialog title. Defaults to "删除账号". */
    title?: string;
    /** Confirm button label. Defaults to "删除账号". */
    confirmLabel?: string;
}

export function ConfirmDelete({
    name,
    onCancel,
    onConfirm,
    title = "删除账号",
    confirmLabel = "删除账号",
}: ConfirmDeleteProps) {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onCancel();
        };
        window.addEventListener("keydown", handler);
        return () => {
            window.removeEventListener("keydown", handler);
        };
    }, [onCancel]);

    useEffect(() => {
        containerRef.current?.focus();
    }, []);

    return (
        <div
            className="acct-dialog-scrim"
            onMouseDown={onCancel}
            data-testid="confirm-delete-scrim"
        >
            <div
                ref={containerRef}
                className="acct-dialog confirm"
                onMouseDown={(e) => {
                    e.stopPropagation();
                }}
                role="alertdialog"
                aria-label={title}
            >
                <div className="ad-head">
                    <span className="ad-mark danger">
                        <Icon name="trash" size={18} />
                    </span>
                    <div className="ad-htext">
                        <div className="ad-title">{title}</div>
                        <div className="ad-sub">此操作无法撤销</div>
                    </div>
                </div>
                <div className="ad-body">
                    <div className="confirm-msg">
                        确定要删除账号 <b>{name}</b> 吗？删除后该账号的所有本地用量记录将一并移除。
                    </div>
                </div>
                <div className="ad-foot">
                    <div className="ad-foot-r">
                        <button className="ad-btn ghost" type="button" onClick={onCancel}>
                            取消
                        </button>
                        <button className="ad-btn danger" type="button" onClick={onConfirm}>
                            {confirmLabel}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
