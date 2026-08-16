import { useCallback, useState } from "react";
import { Icon } from "../Icon";
import type { AddAccountParams } from "../AddAccountDialog";
import type { AddServiceId } from "../../lib/common-services";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { SecretInput } from "../ui/SecretInput";

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
                    Service Key
                </label>
                <SecretInput
                    name={secret_name}
                    value={service_key}
                    onChange={(e) => {
                        set_service_key(e.target.value);
                    }}
                    placeholder="exa-…"
                />
                <div className="flex items-center gap-1 text-[length:var(--text-body-sm)] text-[var(--color-on-surface-muted)]">
                    <Icon name="lock" size={12} strokeWidth={1.8} />
                    密钥仅加密保存在本地
                </div>
            </div>
            <div className="flex flex-col gap-2">
                <label className="text-[length:var(--text-label-md)] font-semibold text-[var(--color-on-surface-variant)]">
                    API Key ID
                </label>
                <Input
                    className="font-[var(--font-code-md)]"
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
            <div className="flex flex-col gap-2">
                <label className="text-[length:var(--text-label-md)] font-semibold text-[var(--color-on-surface-variant)]">
                    限额
                    <span className="ml-1 text-[length:var(--text-label-md)] text-[var(--color-on-surface-muted)]">
                        可选
                    </span>
                </label>
                <Input
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
                    disabled={saving || !service_key.trim() || !api_key_id.trim()}
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
