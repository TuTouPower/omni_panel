import { Icon } from "./Icon";
import type { ProviderError } from "./ProviderOverview";
import { is_auth_error } from "../../shared/lib/auth-error";
import { cn } from "../lib/utils";
import { Button } from "./ui/Button";

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

const STATE_BASE =
    "mt-3 flex items-center gap-[9px] text-[length:var(--text-body-md)] text-[var(--color-on-surface-variant)]";

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
                <div className={STATE_BASE} data-testid="card-state" data-variant="auth">
                    <span className="flex shrink-0 text-[var(--color-warning)]">
                        <Icon name="lock" size={15} />
                    </span>
                    <span>{auth_label}</span>
                    <Button
                        variant="text"
                        className="ml-auto rounded-lg"
                        data-testid="cs-action"
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
                    </Button>
                </div>
            );
        }
        return (
            <div
                className={cn(STATE_BASE, "text-[var(--color-error)]")}
                data-testid="card-state"
                data-variant="err"
            >
                <span className="flex shrink-0">
                    <Icon name="cloud_off" size={15} />
                </span>
                <span>{connectorError.error}</span>
                {onRefresh && (
                    <Button
                        variant="text"
                        className="ml-auto rounded-lg"
                        data-testid="cs-action"
                        onClick={(e) => {
                            e.stopPropagation();
                            onRefresh(provider);
                        }}
                    >
                        重试
                    </Button>
                )}
            </div>
        );
    }
    if (!hasUsage) {
        return (
            <div
                className={STATE_BASE + " text-[var(--color-on-surface-muted)]"}
                data-testid="card-state"
                data-variant="off"
            >
                暂无账号。请到设置添加数据来源。
            </div>
        );
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
        <div
            className={cn(STATE_BASE, "text-[var(--color-error)]")}
            data-testid="card-state"
            data-variant="err"
        >
            <span className="flex shrink-0">
                <Icon name="cloud_off" size={15} />
            </span>
            <span>采集失败：{connectorError.error}</span>
            {onRefresh && (
                <Button
                    variant="text"
                    className="ml-auto rounded-lg"
                    data-testid="cs-action"
                    onClick={(e) => {
                        e.stopPropagation();
                        onRefresh(provider);
                    }}
                >
                    重试
                </Button>
            )}
        </div>
    );
}
