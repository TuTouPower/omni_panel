import { useCallback } from "react";
import { Icon } from "../Icon";
import { useGrokDeviceLogin } from "../../hooks/useGrokDeviceLogin";
import { useKimiDeviceLogin } from "../../hooks/useKimiDeviceLogin";
import type { AddAccountParams } from "../AddAccountDialog";
import type { AddServiceId } from "../../lib/common-services";

/** Vendors that share the OAuth device-code form but dispatch to their own IPC. */
export type OAuthDeviceVendor = "grok" | "kimi";

export interface OAuthDeviceFormProps {
    readonly instance_id: string;
    readonly vendor: OAuthDeviceVendor;
    readonly vendor_id: AddServiceId;
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
    // Both hooks are called unconditionally (Rules of Hooks); the active vendor's
    // result is selected. The idle hook performs no network calls unless started.
    const grok_login = useGrokDeviceLogin(instance_id);
    const kimi_login = useKimiDeviceLogin(instance_id);
    const { phase, device_code, error, start, set_phase_error } =
        vendor === "kimi" ? kimi_login : grok_login;

    const handle_start = useCallback(async () => {
        const result = await start();
        if (!result?.saved) return;
        try {
            // Persist the full token set onto the real connector instance. The
            // device-code login ran under a temporary instance id; without also
            // carrying refresh_token/expires_at, auto-refresh on the real instance
            // would have no refresh_token to use.
            const secrets: Record<string, string> = {
                [secret_name]: result.token ?? "",
            };
            if (result.refresh_token) {
                secrets["OAUTH_REFRESH_TOKEN"] = result.refresh_token;
            }
            if (result.expires_at) {
                secrets["OAUTH_EXPIRES_AT"] = result.expires_at;
            }
            await on_save({
                vendor_id,
                account_name: account_name || vendor_id,
                auth_method: "oauth_device",
                parameter_values: {},
                secrets,
            });
        } catch (save_error) {
            set_phase_error(
                save_error instanceof Error ? save_error.message : "保存账号失败，请重试",
            );
        }
    }, [start, on_save, vendor_id, account_name, secret_name, set_phase_error]);

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
            <div className="ad-field">
                <label className="ad-label">OAuth 设备码登录</label>
                {phase === "idle" && (
                    <button
                        type="button"
                        className="cf-secondary"
                        onClick={() => void handle_start()}
                    >
                        开始登录
                    </button>
                )}
                {phase === "starting" && <p className="ad-hint">正在获取设备码…</p>}
                {phase === "polling" && device_code && (
                    <div>
                        <p className="ad-hint">
                            请访问{" "}
                            <a
                                href={
                                    device_code.verification_uri_complete ??
                                    device_code.verification_uri
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                {device_code.verification_uri}
                            </a>
                        </p>
                        <p className="ad-hint">
                            输入代码：<code>{device_code.user_code}</code>
                        </p>
                        <p className="ad-hint">等待授权完成…</p>
                    </div>
                )}
                {phase === "success" && <p className="ad-hint">登录成功</p>}
                {phase === "error" && (
                    <p className="ad-hint">
                        <Icon name="alert_circle" size={12} strokeWidth={1.8} />
                        登录失败：{error}
                    </p>
                )}
                {phase === "error" && (
                    <button
                        type="button"
                        className="cf-secondary"
                        onClick={() => void handle_start()}
                    >
                        重新登录
                    </button>
                )}
            </div>
        </div>
    );
}
