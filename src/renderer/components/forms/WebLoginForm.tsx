import { useCallback, useState } from "react";
import type { AddAccountParams } from "../AddAccountDialog";
import type { AddServiceId } from "../../lib/common-services";
import { WebLoginSection } from "../WebLoginSection";
import { Button } from "../ui/Button";
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
    const [cookie, set_cookie] = useState("");
    const [manual_error, set_manual_error] = useState<string | null>(null);

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

    const handle_manual_save = useCallback(async () => {
        const trimmed = cookie.trim();
        if (!trimmed) {
            set_manual_error("请先粘贴 Cookie");
            return;
        }
        set_manual_error(null);
        try {
            await handle_secrets({ [secret_name]: trimmed });
        } catch (error: unknown) {
            set_manual_error(error instanceof Error ? error.message : "保存账号失败，请重试");
        }
    }, [cookie, handle_secrets, secret_name]);

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
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
            <WebLoginSection
                provider={provider}
                login_url={login_url}
                secret_name={secret_name}
                value={cookie}
                onChange={(value) => {
                    set_cookie(value);
                    set_manual_error(null);
                }}
                buttonLabel="网页登录"
                onSecrets={handle_secrets}
            />
            {provider !== "kimi_web" && (
                <>
                    <Button
                        variant="primary"
                        size="sm"
                        type="button"
                        data-testid="web-login-manual-save"
                        disabled={!cookie.trim()}
                        onClick={() => void handle_manual_save()}
                    >
                        添加账号
                    </Button>
                    {manual_error && (
                        <p
                            className="text-[length:var(--text-body-sm)] text-[var(--color-error)]"
                            role="alert"
                        >
                            {manual_error}
                        </p>
                    )}
                </>
            )}
        </div>
    );
}
