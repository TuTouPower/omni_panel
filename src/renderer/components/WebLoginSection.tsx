import { useCallback, useState } from "react";
import { Icon } from "./Icon";
import { Button } from "./ui/Button";
import { Textarea } from "./ui/Textarea";
import { is_web } from "../lib/is-web";

const COOKIE_LOGIN_POLL_INTERVAL_MS = 250;
const COOKIE_LOGIN_POLL_TIMEOUT_MS = 120_000;

export interface WebLoginSectionProps {
    readonly provider: string;
    readonly login_url: string;
    readonly secret_name: string;
    readonly value: string;
    readonly onChange: (value: string) => void;
    readonly cookie_names?: string[] | undefined;
    readonly instance_id?: string | undefined;
    readonly buttonLabel?: string | undefined;
    readonly onSecrets: (secrets: Record<string, string>) => void | Promise<void>;
    readonly onSaved?: (() => void | Promise<void>) | undefined;
}

export function WebLoginSection({
    provider,
    login_url,
    secret_name,
    value,
    onChange,
    cookie_names,
    instance_id,
    buttonLabel,
    onSecrets,
    onSaved,
}: WebLoginSectionProps) {
    const [logging_in, set_logging_in] = useState(false);
    const [error, set_error] = useState<string | null>(null);

    const handle_login = useCallback(async () => {
        set_error(null);
        set_logging_in(true);
        try {
            if (is_web() && instance_id) {
                const result = await window.usageboard.auth.cookieLogin(instance_id);
                if (result.started) {
                    const deadline = Date.now() + COOKIE_LOGIN_POLL_TIMEOUT_MS;
                    let status = await window.usageboard.auth.cookieLoginStatus(instance_id);
                    while (status.in_progress) {
                        if (Date.now() >= deadline) {
                            throw new Error("网页登录超时，请重试");
                        }
                        await new Promise<void>((resolve) => {
                            setTimeout(resolve, COOKIE_LOGIN_POLL_INTERVAL_MS);
                        });
                        status = await window.usageboard.auth.cookieLoginStatus(instance_id);
                    }
                    if (status.error) throw new Error(status.error);
                    if (!status.saved) {
                        set_error("未捕获到 Cookie，请完成登录后再关闭窗口");
                        return;
                    }
                } else if (!result.saved) {
                    set_error("未捕获到 Cookie，请完成登录后再关闭窗口");
                    return;
                }
                await onSaved?.();
                return;
            }

            const result = await window.usageboard.session.login({
                provider,
                login_url,
                cookie_names: cookie_names ?? ["*"],
                ...(instance_id ? { instance_id } : {}),
            });
            if (!result.saved) {
                set_error("未捕获到 Cookie，请完成登录后再关闭窗口");
                return;
            }
            if (result.cookie) {
                await onSecrets({ [secret_name]: result.cookie });
            } else if (onSaved) {
                await onSaved();
            }
        } catch (login_error) {
            set_error(login_error instanceof Error ? login_error.message : "网页登录失败，请重试");
        } finally {
            set_logging_in(false);
        }
    }, [instance_id, provider, login_url, secret_name, cookie_names, onSecrets, onSaved]);

    return (
        <div className="flex flex-col gap-1.5" data-testid={`web-login-section-${provider}`}>
            <label className="text-label-md font-semibold text-[var(--color-on-surface-variant)]">
                网页登录授权
            </label>
            <Button
                variant="secondary"
                size="sm"
                type="button"
                disabled={logging_in}
                onClick={() => void handle_login()}
            >
                {logging_in ? "正在打开登录窗口…" : (buttonLabel ?? "网页登录")}
            </Button>
            {error && (
                <p
                    className="flex items-center gap-1 text-body-sm text-[var(--color-error)]"
                    data-testid={`web-login-error-${provider}`}
                >
                    <Icon name="alert_circle" size={12} strokeWidth={1.8} />
                    {error}
                </p>
            )}
            <label
                className="text-label-md font-semibold text-[var(--color-on-surface-variant)]"
                htmlFor={`web-login-cookie-${provider}`}
            >
                Cookie 字符串
            </label>
            <Textarea
                id={`web-login-cookie-${provider}`}
                className="min-h-[72px] font-[var(--font-code-md)]"
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                aria-label="网页登录 Cookie"
                value={value}
                onChange={(event) => {
                    onChange(event.target.value);
                }}
                placeholder="在浏览器登录后，从开发者工具复制完整 Cookie…"
            />
            <p className="flex items-center gap-1 text-body-sm text-[var(--color-on-surface-muted)]">
                <Icon name="info" size={12} strokeWidth={1.8} />
                可点击网页登录自动捕获，也可手动粘贴 Cookie 后保存。
            </p>
        </div>
    );
}
