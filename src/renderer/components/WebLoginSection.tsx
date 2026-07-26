import { useCallback, useState } from "react";
import { Icon } from "./Icon";

export interface WebLoginSectionProps {
    readonly provider: string;
    readonly login_url: string;
    readonly secret_name: string;
    readonly cookie_names?: string[] | undefined;
    readonly instance_id?: string | undefined;
    readonly buttonLabel?: string | undefined;
    readonly onSecrets: (secrets: Record<string, string>) => void | Promise<void>;
}

export function WebLoginSection({
    provider,
    login_url,
    secret_name,
    cookie_names,
    instance_id,
    buttonLabel,
    onSecrets,
}: WebLoginSectionProps) {
    const [logging_in, set_logging_in] = useState(false);
    const [error, set_error] = useState<string | null>(null);

    const handle_login = useCallback(async () => {
        set_error(null);
        set_logging_in(true);
        try {
            const result = await window.usageboard.session.login({
                provider,
                login_url,
                cookie_names: cookie_names ?? ["*"],
                ...(instance_id ? { instance_id } : {}),
            });
            if (!result.saved || !result.cookie) {
                set_error("未捕获到 Cookie，请完成登录后再关闭窗口");
                return;
            }
            const secrets = { [secret_name]: result.cookie };
            try {
                await onSecrets(secrets);
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
    }, [instance_id, provider, login_url, secret_name, cookie_names, onSecrets]);

    return (
        <div className="ad-field" data-testid={`web-login-section-${provider}`}>
            <label className="ad-label">网页登录授权</label>
            <button
                type="button"
                className="cf-secondary"
                disabled={logging_in}
                onClick={() => void handle_login()}
            >
                {logging_in ? "正在打开登录窗口…" : (buttonLabel ?? "网页登录")}
            </button>
            {error && (
                <p className="ad-hint" data-testid={`web-login-error-${provider}`}>
                    <Icon name="alert_circle" size={12} strokeWidth={1.8} />
                    {error}
                </p>
            )}
            <p className="ad-hint">
                <Icon name="info" size={12} strokeWidth={1.8} />
                点击后会在系统浏览器打开登录页，完成后自动保存 Cookie。
            </p>
        </div>
    );
}
