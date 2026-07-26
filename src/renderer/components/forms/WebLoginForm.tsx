import { useCallback } from "react";
import type { AddAccountParams } from "../AddAccountDialog";
import type { AddServiceId } from "../../lib/common-services";
import { WebLoginSection } from "../WebLoginSection";

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
        <div>
            <div className="ad-field">
                <label className="ad-label">
                    备注<span className="ad-opt">显示用</span>
                </label>
                <input
                    className="ad-input"
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
