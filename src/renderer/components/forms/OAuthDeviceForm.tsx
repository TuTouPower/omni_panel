import { useCallback } from "react";
import { DeviceLoginSection, type OAuthDeviceVendor } from "../DeviceLoginSection";
import type { AddAccountParams } from "../AddAccountDialog";

export interface OAuthDeviceFormProps {
    readonly instance_id: string;
    readonly vendor: OAuthDeviceVendor;
    readonly vendor_id: AddAccountParams["vendor_id"];
    readonly secret_name: string;
    readonly account_name: string;
    readonly set_account_name: (v: string) => void;
    readonly on_save: (params: AddAccountParams) => Promise<void>;
}

export function OAuthDeviceForm({
    instance_id,
    vendor,
    vendor_id,
    secret_name,
    account_name,
    set_account_name,
    on_save,
}: OAuthDeviceFormProps) {
    const handle_secrets = useCallback(
        async (secrets: Record<string, string>) => {
            await on_save({
                vendor_id,
                account_name: account_name || vendor_id,
                auth_method: "oauth_device",
                oauth_source_instance_id: instance_id,
                parameter_values: {},
                secrets,
            });
        },
        [on_save, vendor_id, account_name, instance_id],
    );

    return (
        <div data-secret-name={secret_name}>
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
            <DeviceLoginSection
                vendor={vendor}
                instance_id={instance_id}
                secret_name={secret_name}
                buttonLabel="开始登录"
                checkStatus={false}
                onSecrets={handle_secrets}
            />
        </div>
    );
}
