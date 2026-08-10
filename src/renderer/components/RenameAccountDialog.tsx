import { useEffect, useState } from "react";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";
import { Input } from "./ui/Input";
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
        <Dialog
            open
            onClose={on_close}
            ariaLabel="编辑备注"
            title={
                <div className="flex min-w-0 items-center gap-3">
                    <div className="min-w-0">
                        <div className="text-title-sm font-semibold">编辑备注</div>
                        <div className="mt-0.5 truncate font-[var(--font-code-md)] text-body-sm text-[var(--color-on-surface-muted)]">
                            {account_id}
                        </div>
                    </div>
                    <Button
                        variant="icon"
                        size="sm"
                        className="ml-auto h-8 w-8 shrink-0 p-0"
                        onClick={on_close}
                        title="关闭"
                        aria-label="关闭"
                    >
                        <Icon name="close" size={17} strokeWidth={2} />
                    </Button>
                </div>
            }
            footer={
                <>
                    <Button variant="ghost" size="sm" type="button" onClick={on_close}>
                        取消
                    </Button>
                    <Button
                        variant="primary"
                        size="sm"
                        type="button"
                        disabled={!changed}
                        onClick={() => {
                            on_save(trimmed);
                        }}
                    >
                        保存
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-1.5">
                <label
                    className="text-label-md font-semibold text-[var(--color-on-surface-variant)]"
                    htmlFor="rename-input"
                >
                    备注
                    <span className="ml-1 font-normal text-[var(--color-on-surface-muted)]">
                        显示用
                    </span>
                </label>
                <Input
                    id="rename-input"
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="off"
                    value={value}
                    autoFocus
                    onChange={(e) => {
                        set_value(e.target.value);
                    }}
                    placeholder="例如：工作账号"
                />
            </div>
        </Dialog>
    );
}
