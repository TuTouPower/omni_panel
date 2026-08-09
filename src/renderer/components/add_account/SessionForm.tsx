import { useState, useEffect } from "react";
import { SessionSection } from "../SessionSection";
import { Input } from "../ui/Input";

export interface SessionFormProps {
    readonly account_name: string;
    readonly set_account_name: (v: string) => void;
    readonly form_ref: React.RefObject<{ cookie: string }>;
}

export function SessionForm({ account_name, set_account_name, form_ref }: SessionFormProps) {
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
            <SessionSection secret_name="SESSION_COOKIE" value={cookie} onChange={set_cookie} />
        </div>
    );
}
