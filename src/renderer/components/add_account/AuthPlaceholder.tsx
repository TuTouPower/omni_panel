import { Icon } from "../Icon";
import type { ResolvedAuthMethod } from "../../lib/auth-flow-registry";

export interface AuthPlaceholderProps {
    readonly method: Exclude<ResolvedAuthMethod, "apikey" | "session" | "local_cli">;
}

export function AuthPlaceholder({ method }: AuthPlaceholderProps) {
    const labels: Record<typeof method, string> = {
        oauth_device: "OAuth 设备码",
        web_login: "网页登录",
        cpa_mgmt: "CPA 管理端",
    };
    return (
        <div className="ad-field">
            <div className="ad-hint">
                <Icon name="info" size={12} strokeWidth={1.8} />
                {labels[method]}添加流程将在 t109/t110 实现。
            </div>
        </div>
    );
}
