import { useCallback, useState } from "react";
import { Icon } from "../Icon";
import type { AddAccountParams } from "../AddAccountDialog";
import type { AddServiceId } from "../../lib/common-services";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { SecretInput } from "../ui/SecretInput";

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
        <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
                <label className="text-[length:var(--text-label-md)] font-semibold text-[var(--color-on-surface-variant)]">
                    备注
                    <span className="ml-1 text-[length:var(--text-label-md)] text-[var(--color-on-surface-muted)]">
                        显示用
                    </span>
                </label>
                <Input
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
            <div className="flex flex-col gap-2">
                <label className="text-[length:var(--text-label-md)] font-semibold text-[var(--color-on-surface-variant)]">
                    CPA 管理密钥
                </label>
                <SecretInput
                    name="cpa_mgmt_key"
                    value={key}
                    onChange={(e) => {
                        set_key(e.target.value);
                    }}
                    placeholder="cpa-…"
                />
                <div className="flex items-center gap-1 text-[length:var(--text-body-sm)] text-[var(--color-on-surface-muted)]">
                    <Icon name="lock" size={12} strokeWidth={1.8} />
                    密钥仅加密保存在本地
                </div>
            </div>
            <div className="flex flex-col gap-2">
                <label className="text-[length:var(--text-label-md)] font-semibold text-[var(--color-on-surface-variant)]">
                    管理端地址
                </label>
                <Input
                    className="font-[var(--font-code-md)]"
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
            {error_message && (
                <div
                    className="text-[length:var(--text-body-sm)] text-[var(--color-error)]"
                    role="alert"
                >
                    {error_message}
                </div>
            )}
            <div className="flex justify-end">
                <Button
                    variant="primary"
                    disabled={saving || !key.trim()}
                    type="button"
                    onClick={() => {
                        void handle_save();
                    }}
                >
                    添加账号
                </Button>
            </div>
        </div>
    );
}
