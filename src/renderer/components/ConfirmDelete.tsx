import { useEffect, useRef } from "react";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";
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
        <Dialog
            open
            onClose={onCancel}
            role="alertdialog"
            ariaLabel={title}
            backdropTestId="confirm-delete-scrim"
            title={
                <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--color-error)_12%,transparent)] text-[var(--color-error)]">
                        <Icon name="trash" size={18} />
                    </span>
                    <div className="min-w-0">
                        <div className="text-title-sm font-semibold">{title}</div>
                        <div className="mt-0.5 text-body-sm text-[var(--color-on-surface-muted)]">
                            此操作无法撤销
                        </div>
                    </div>
                </div>
            }
            footer={
                <>
                    <Button variant="ghost" size="sm" type="button" onClick={onCancel}>
                        取消
                    </Button>
                    <Button variant="danger" size="sm" type="button" onClick={onConfirm}>
                        {confirmLabel}
                    </Button>
                </>
            }
        >
            <div ref={containerRef} tabIndex={-1} className="text-body-md leading-relaxed">
                确定要删除账号 <strong>{name}</strong>{" "}
                吗？删除后该账号的所有本地用量记录将一并移除。
            </div>
        </Dialog>
    );
}
