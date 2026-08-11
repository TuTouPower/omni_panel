import { useState, useEffect } from "react";
import { Icon } from "../Icon";
import { Input } from "../ui/Input";
import { SecretInput } from "../SecretInput";

export interface ApiKeyFormProps {
    readonly account_name: string;
    readonly set_account_name: (v: string) => void;
    readonly form_ref: React.RefObject<{ api_key: string; endpoint_override?: string }>;
}

export function ApiKeyForm({ account_name, set_account_name, form_ref }: ApiKeyFormProps) {
    const [key, set_key] = useState("");
    const [endpoint, set_endpoint] = useState("");

    useEffect(() => {
        form_ref.current = {
            api_key: key,
            ...(endpoint ? { endpoint_override: endpoint } : {}),
        };
    }, [key, endpoint, form_ref]);

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
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
            <div className="flex flex-col gap-1.5">
                <label className="text-[length:var(--text-label-md)] font-semibold text-[var(--color-on-surface-variant)]">
                    API 密钥
                </label>
                <SecretInput name="api_key" value={key} onChange={set_key} placeholder="sk-…" />
                <div className="flex items-center gap-1 text-[length:var(--text-body-sm)] text-[var(--color-on-surface-muted)]">
                    <Icon name="lock" size={12} strokeWidth={1.8} />
                    密钥仅加密保存在本地
                </div>
            </div>
            <div className="flex flex-col gap-1.5">
                <label className="text-[length:var(--text-label-md)] font-semibold text-[var(--color-on-surface-variant)]">
                    接口地址
                    <span className="ml-1 text-[length:var(--text-label-md)] text-[var(--color-on-surface-muted)]">
                        可选
                    </span>
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
                    placeholder="默认（官方接口）"
                />
            </div>
        </div>
    );
}
