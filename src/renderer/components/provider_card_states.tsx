import { Icon } from "./Icon";
import type { ProviderError } from "./ProviderOverview";
import { is_auth_error } from "../../shared/lib/auth-error";

export { is_auth_error };

interface ProviderCardStateProps {
    provider: string;
    connectorError: ProviderError | undefined;
    isFailed: boolean;
    isAuth: boolean;
    hasUsage: boolean;
    /**
     * t158: re-login callback now takes BOTH provider AND a specific instanceId.
     * Multi-instance setups (e.g. two GroK accounts) need the caller to be able
     * to pin which instance the settings dialog should target.
     */
    onReLogin?: ((provider: string, instanceId: string) => void) | undefined;
    onRefresh?: ((provider: string) => void) | undefined;
}

export function ProviderCardState({
    provider,
    connectorError,
    isFailed,
    isAuth,
    hasUsage,
    onReLogin,
    onRefresh,
}: ProviderCardStateProps) {
    if (isFailed) {
        if (!connectorError) return null;
        if (isAuth) {
            const auth_label = "凭证失效，请重新登录";
            // t158: overview banner re-login target = first failed instance.
            // Per-row re-login in ProviderAccountRow covers the rest of the
            // instanceIds when multiple connectors share this provider.
            const first_instance_id = connectorError.instanceIds[0] ?? "";
            return (
                <div className="card-state auth">
                    <span className="cs-ic">
                        <Icon name="lock" size={15} />
                    </span>
                    <span>{auth_label}</span>
                    <span
                        className="cs-action"
                        onClick={() => {
                            if (onReLogin) {
                                onReLogin(provider, first_instance_id);
                            } else {
                                window.usageboard.settings.open({
                                    instanceId: first_instance_id,
                                });
                            }
                        }}
                    >
                        重新登录
                    </span>
                </div>
            );
        }
        return (
            <div className="card-state err">
                <span className="cs-ic">
                    <Icon name="cloud_off" size={15} />
                </span>
                <span>{connectorError.error}</span>
                {onRefresh && (
                    <span
                        className="cs-action"
                        onClick={(e) => {
                            e.stopPropagation();
                            onRefresh(provider);
                        }}
                    >
                        重试
                    </span>
                )}
            </div>
        );
    }
    if (!hasUsage) {
        return <div className="card-state off">暂无账号。请到设置添加数据来源。</div>;
    }
    return null;
}

interface ProviderCardErrorBannerProps {
    provider: string;
    connectorError: ProviderError | undefined;
    onRefresh?: ((provider: string) => void) | undefined;
}

// Shown when collection is failing but cached usage still exists. Sits ABOVE
// the stale data so the failure is visible on the main panel.
export function ProviderCardErrorBanner({
    provider,
    connectorError,
    onRefresh,
}: ProviderCardErrorBannerProps) {
    if (!connectorError) return null;
    return (
        <div className="card-state err">
            <span className="cs-ic">
                <Icon name="cloud_off" size={15} />
            </span>
            <span>采集失败：{connectorError.error}</span>
            {onRefresh && (
                <span
                    className="cs-action"
                    onClick={(e) => {
                        e.stopPropagation();
                        onRefresh(provider);
                    }}
                >
                    重试
                </span>
            )}
        </div>
    );
}
