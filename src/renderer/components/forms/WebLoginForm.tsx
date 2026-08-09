import { useCallback } from "react";
import type { AddAccountParams } from "../AddAccountDialog";
import type { AddServiceId } from "../../lib/common-services";
import { WebLoginSection } from "../WebLoginSection";
import { Input } from "../ui/Input";

export interface WebLoginFormProps {
    readonly provider: AddServiceId;
    readonly login_url: string;
    readonly secret_name: string;
    readonly account_name: string;
    readonly set_account_name: (v: string) => void;
    readonly on_save: (params: AddAccountParams) => Promise<void>;
}

export function WebLoginForm({
    provider,
    login_url,
    secret_name,
    account_name,
    set_account_name,
    on_save,
}: WebLoginFormProps) {
    const handle_secrets = useCallback(
        async (secrets: Record<string, string>) => {
            await on_save({
                vendor_id: provider,
                account_name: account_name || provider,
                auth_method: "web_login",
                parameter_values: {},
                secrets,
            });
        },
        [on_save, provider, account_name],
    );

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
                <label className="text-label-md font-semibold text-[var(--color-on-surface-variant)]">
                    备注
                    <span className="ml-1 text-label-md text-[var(--color-on-surface-muted)]">
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
            <WebLoginSection
                provider={provider}
                login_url={login_url}
                secret_name={secret_name}
                buttonLabel="网页登录"
                onSecrets={handle_secrets}
            />
        </div>
    );
}
