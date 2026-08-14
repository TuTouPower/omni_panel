import { useCallback, useState } from "react";
import { Icon } from "./Icon";
import { Button } from "./ui/Button";
import { Textarea } from "./ui/Textarea";
import { is_web } from "../lib/is-web";
import {
    COOKIE_LOGIN_MESSAGES,
    format_cookie_login_error,
    poll_cookie_login,
} from "../lib/cookie_login_poll";
import { SESSION_LOGIN_AUTO_CLOSE_MS } from "../../shared/constants";

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
    const web_anon = is_web() && !instance_id;

    const handle_login = useCallback(async () => {
        set_error(null);
        set_logging_in(true);
        try {
            // Web edit-instance: vault-backed start + shared poll (same as SettingsForm).
            if (is_web() && instance_id) {
                await poll_cookie_login(instance_id);
                await onSaved?.();
                return;
            }

            // Desktop (any path) and web add-account (no instance_id): blocking session.login.
            // Web add path cannot use cookieLogin (needs config instance); capture returns in
            // response only — AC-001 degrade guide warns not to refresh; manual paste recovers.
            // t331: 登录成功捕获 Cookie 后按 auto_close_ms 自动关闭登录窗口（对齐编辑路径 1500ms）。
            const result = await window.usageboard.session.login({
                provider,
                login_url,
                cookie_names: cookie_names ?? ["*"],
                ...(instance_id ? { instance_id } : {}),
                ...(instance_id ? {} : { auto_close_ms: SESSION_LOGIN_AUTO_CLOSE_MS }),
            });
            if (!result.saved) {
                // t337: 区分「未捕获到 Cookie」与「登录态无效」——无效时引导重登或手动粘贴。
                set_error(
                    result.reason === "invalid_cookie"
                        ? COOKIE_LOGIN_MESSAGES.invalid_cookie
                        : COOKIE_LOGIN_MESSAGES.no_cookie,
                );
                return;
            }
            if (result.cookie) {
                await onSecrets({ [secret_name]: result.cookie });
            } else if (onSaved) {
                await onSaved();
            }
        } catch (login_error) {
            set_error(format_cookie_login_error(login_error));
        } finally {
            set_logging_in(false);
        }
    }, [instance_id, provider, login_url, secret_name, cookie_names, onSecrets, onSaved]);

    return (
        <div className="flex flex-col gap-1.5" data-testid={`web-login-section-${provider}`}>
            <label className="text-[length:var(--text-label-md)] font-semibold text-[var(--color-on-surface-variant)]">
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
                    className="flex items-center gap-1 text-[length:var(--text-body-sm)] text-[var(--color-error)]"
                    data-testid={`web-login-error-${provider}`}
                >
                    <Icon name="alert_circle" size={12} strokeWidth={1.8} />
                    {error}
                </p>
            )}
            {web_anon && (
                <p
                    className="flex items-center gap-1 text-[length:var(--text-body-sm)] text-[var(--color-on-surface-muted)]"
                    data-testid={`web-login-anon-guide-${provider}`}
                >
                    <Icon name="info" size={12} strokeWidth={1.8} />
                    {COOKIE_LOGIN_MESSAGES.anon_web_guide}
                </p>
            )}
            <label
                className="text-[length:var(--text-label-md)] font-semibold text-[var(--color-on-surface-variant)]"
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
            <p className="flex items-center gap-1 text-[length:var(--text-body-sm)] text-[var(--color-on-surface-muted)]">
                <Icon name="info" size={12} strokeWidth={1.8} />
                可点击网页登录自动捕获，也可手动粘贴 Cookie 后保存。
            </p>
        </div>
    );
}
