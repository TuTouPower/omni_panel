import { useState, useEffect } from "react";
import { SessionSection } from "../SessionSection";
import { WebLoginSection } from "../WebLoginSection";
import { Input } from "../ui/Input";

export interface SessionFormProps {
    readonly provider: string;
    readonly secret_name: string;
    readonly login_url?: string | undefined;
    readonly cookie_names?: string[] | undefined;
    readonly account_name: string;
    readonly set_account_name: (v: string) => void;
    readonly form_ref: React.RefObject<{ cookie: string }>;
}

export function SessionForm({
    provider,
    secret_name,
    login_url,
    cookie_names,
    account_name,
    set_account_name,
    form_ref,
}: SessionFormProps) {
    const [cookie, set_cookie] = useState("");

    useEffect(() => {
        form_ref.current = { cookie };
    }, [cookie, form_ref]);

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
                    onChange={(e) => {
                        set_account_name(e.target.value);
                    }}
                    placeholder="例如：工作账号"
                />
            </div>
            {login_url ? (
                <WebLoginSection
                    provider={provider}
                    login_url={login_url}
                    secret_name={secret_name}
                    value={cookie}
                    onChange={set_cookie}
                    cookie_names={cookie_names}
                    onSecrets={(secrets) => {
                        const captured = secrets[secret_name];
                        if (captured) set_cookie(captured);
                    }}
                />
            ) : (
                <SessionSection secret_name={secret_name} value={cookie} onChange={set_cookie} />
            )}
        </div>
    );
}
