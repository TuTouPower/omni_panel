import { useState, useEffect } from "react";
import { Icon } from "../Icon";

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
            <div className="ad-field">
                <label className="ad-label">Cookie 字符串</label>
                <textarea
                    className="aa-textarea mono"
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="off"
                    value={cookie}
                    onChange={(e) => {
                        set_cookie(e.target.value);
                    }}
                    placeholder="在浏览器登录后，从开发者工具复制完整 Cookie…"
                />
                <div className="ad-hint" style={{ marginTop: 6 }}>
                    <Icon name="info" size={12} strokeWidth={1.8} />
                    保存后可在账号设置中使用网页登录自动捕获 Cookie
                </div>
            </div>
        </>
    );
}
