import { Icon } from "./Icon";

export interface SessionSectionProps {
    readonly secret_name: string;
    readonly value: string;
    readonly onChange: (value: string) => void;
}

export function SessionSection({ secret_name, value, onChange }: SessionSectionProps) {
    return (
        <div className="ad-field" data-testid={`session-section-${secret_name}`}>
            <label className="ad-label">Cookie 字符串</label>
            <textarea
                className="aa-textarea mono"
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                value={value}
                onChange={(e) => {
                    onChange(e.target.value);
                }}
                placeholder="在浏览器登录后，从开发者工具复制完整 Cookie…"
            />
            <div className="ad-hint" style={{ marginTop: 6 }}>
                <Icon name="info" size={12} strokeWidth={1.8} />
                保存后可在账号设置中使用网页登录自动捕获 Cookie
            </div>
        </div>
    );
}
