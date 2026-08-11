import { useState } from "react";
import { Icon, VendorMark } from "./Icon";
import { Toggle } from "./settings/Toggle";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";
import { Input } from "./ui/Input";
import { SecretInput } from "./SecretInput";
import { PROVIDER_LABELS } from "../lib/provider-usage";
import type { UsageProvider } from "../../shared/schemas/plugin-output";

const CPA_SCOPE: UsageProvider[] = ["claude", "codex", "antigravity", "kimi"];

export function CpaAddDialog({ onClose }: { onClose: () => void }) {
    const [url, setUrl] = useState("");
    const [key, setKey] = useState("");
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
        <Dialog
            open
            onClose={onClose}
            width={420}
            ariaLabel="添加 CPA Manager"
            title={
                <div className="flex min-w-0 items-center gap-3">
                    <div className="min-w-0">
                        <div className="text-[length:var(--text-title-sm)] font-semibold">
                            添加 CPA Manager
                        </div>
                        <div className="mt-0.5 text-[length:var(--text-body-sm)] text-[var(--color-on-surface-muted)]">
                            批量接入多个服务商账号
                        </div>
                    </div>
                    <Button
                        variant="icon"
                        size="sm"
                        className="ml-auto h-8 w-8 shrink-0 p-0"
                        onClick={onClose}
                        title="关闭"
                        aria-label="关闭"
                    >
                        <Icon name="close" size={17} strokeWidth={2} />
                    </Button>
                </div>
            }
            footer={
                <>
                    <Button variant="ghost" size="sm" type="button">
                        <Icon name="refresh" size={14} />
                        测试连接
                    </Button>
                    <Button variant="ghost" size="sm" type="button" onClick={onClose}>
                        取消
                    </Button>
                    <Button variant="primary" size="sm" disabled={!canSave} type="button">
                        保存并同步
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                    <label className="text-[length:var(--text-label-md)] font-semibold text-[var(--color-on-surface-variant)]">
                        CPA-Manager URL
                    </label>
                    <Input
                        className="font-[var(--font-code-md)]"
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
                <div className="flex flex-col gap-1.5">
                    <label className="text-[length:var(--text-label-md)] font-semibold text-[var(--color-on-surface-variant)]">
                        管理密钥
                    </label>
                    <SecretInput
                        name="cpa_mgmt_key"
                        value={key}
                        onChange={setKey}
                        placeholder="cpa_sk_..."
                    />
                </div>
                <div className="flex flex-col gap-1.5">
                    <label className="text-[length:var(--text-label-md)] font-semibold text-[var(--color-on-surface-variant)]">
                        同步范围
                    </label>
                    <div className="flex flex-col">
                        {CPA_SCOPE.map((id) => (
                            <div
                                className="flex items-center gap-2.5 border-b border-[var(--color-hairline)] px-0.5 py-2 last:border-b-0"
                                key={id}
                            >
                                <VendorMark id={id} size={20} />
                                <span className="text-[length:var(--text-body-md)] font-medium text-[var(--color-on-surface)]">
                                    {PROVIDER_LABELS[id]}
                                </span>
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
        </Dialog>
    );
}
