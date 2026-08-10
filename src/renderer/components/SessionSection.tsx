import { useState } from "react";
import { Icon } from "./Icon";
import { Textarea } from "./ui/Textarea";
import { Button } from "./ui/Button";

export interface SessionSectionProps {
    readonly secret_name: string;
    readonly value: string;
    readonly onChange: (value: string) => void;
    readonly onLogin?: (() => Promise<void>) | undefined;
}

export function SessionSection({ secret_name, value, onChange, onLogin }: SessionSectionProps) {
    const [logging_in, set_logging_in] = useState(false);
    const [login_error, set_login_error] = useState<string | null>(null);

    const handle_login = async (): Promise<void> => {
        if (!onLogin || logging_in) return;
        set_login_error(null);
        set_logging_in(true);
        try {
            await onLogin();
        } catch (error: unknown) {
            set_login_error(error instanceof Error ? error.message : "网页登录失败，请重试");
        } finally {
            set_logging_in(false);
        }
    };

    return (
        <div className="flex flex-col gap-1.5" data-testid={`session-section-${secret_name}`}>
            <label className="text-label-md font-semibold text-[var(--color-on-surface-variant)]">
                Cookie 字符串
            </label>
            {onLogin && (
                <Button
                    variant="secondary"
                    size="sm"
                    type="button"
                    disabled={logging_in}
                    data-testid={`session-login-${secret_name}`}
                    onClick={() => void handle_login()}
                >
                    {logging_in ? "正在打开登录窗口…" : "网页登录"}
                </Button>
            )}
            {login_error && (
                <p
                    className="flex items-center gap-1 text-body-sm text-[var(--color-error)]"
                    role="alert"
                    data-testid={`session-login-error-${secret_name}`}
                >
                    <Icon name="alert_circle" size={12} strokeWidth={1.8} />
                    {login_error}
                </p>
            )}
            <Textarea
                className="min-h-[72px] font-[var(--font-code-md)]"
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                value={value}
                onChange={(e) => {
                    onChange(e.target.value);
                }}
                placeholder="在浏览器登录后，从开发者工具复制完整 Cookie…"
            />
            <div className="mt-1 flex items-center gap-1 text-body-sm text-[var(--color-on-surface-muted)]">
                <Icon name="info" size={12} strokeWidth={1.8} />
                {onLogin
                    ? "可点击网页登录自动捕获，也可手动粘贴 Cookie"
                    : "保存后可在账号设置中使用网页登录自动捕获 Cookie"}
            </div>
        </div>
    );
}
