import { useState, useEffect } from "react";
import { SessionSection } from "../SessionSection";

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
        <>
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
                    onChange={(e) => {
                        set_account_name(e.target.value);
                    }}
                    placeholder="例如：工作账号"
                />
            </div>
            <SessionSection secret_name="SESSION_COOKIE" value={cookie} onChange={set_cookie} />
        </>
    );
}
