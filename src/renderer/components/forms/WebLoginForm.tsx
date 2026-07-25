import { useCallback, useState } from "react";
import { Icon } from "../Icon";
import type { AddAccountParams } from "../AddAccountDialog";
import type { AddServiceId } from "../../lib/common-services";

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
    const [logging_in, set_logging_in] = useState(false);
    const [error, set_error] = useState<string | null>(null);

    const handle_login = useCallback(async () => {
        set_error(null);
        set_logging_in(true);
        try {
            const result = await window.usageboard.session.login({
                provider,
                login_url,
                cookie_names: ["*"],
            });
            if (!result.saved || !result.cookie) {
                set_error("未捕获到 Cookie，请完成登录后再关闭窗口");
                return;
            }
            try {
                await on_save({
                    vendor_id: provider,
                    account_name: account_name || provider,
                    auth_method: "web_login",
                    parameter_values: {},
                    secrets: { [secret_name]: result.cookie },
                });
            } catch (save_error) {
                set_error(
                    save_error instanceof Error ? save_error.message : "保存账号失败，请重试",
                );
            }
        } catch (login_error) {
            set_error(login_error instanceof Error ? login_error.message : "网页登录失败，请重试");
        } finally {
            set_logging_in(false);
        }
    }, [provider, login_url, secret_name, account_name, on_save]);

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
                <label className="ad-label">网页登录授权</label>
                <button
                    type="button"
                    className="cf-secondary"
                    disabled={logging_in}
                    onClick={() => void handle_login()}
                >
                    {logging_in ? "正在打开登录窗口…" : "网页登录"}
                </button>
                {error && (
                    <p className="ad-hint">
                        <Icon name="alert_circle" size={12} strokeWidth={1.8} />
                        {error}
                    </p>
                )}
                <p className="ad-hint">
                    <Icon name="info" size={12} strokeWidth={1.8} />
                    点击后会在系统浏览器打开登录页，完成后自动保存 Cookie。
                </p>
            </div>
        </div>
    );
}
