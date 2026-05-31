import type { UsageProvider } from "../../shared/schemas/plugin-output";
import type { ProviderUsageGroup } from "../lib/provider-usage";
import { PROVIDER_LABELS } from "../lib/provider-usage";
import { Icon, VendorMark } from "./Icon";

interface ProviderCardProps {
    provider: UsageProvider;
    group?: ProviderUsageGroup | undefined;
    onSelect?: (provider: UsageProvider) => void;
    onRefresh?: (provider: UsageProvider) => void;
}

function statusLabel(status: ProviderUsageGroup["status"] | undefined): string {
    if (status === "critical") return "紧急";
    if (status === "warning") return "预警";
    if (status === "unknown") return "未知";
    return "正常";
}

export function ProviderCard({ provider, group, onSelect, onRefresh }: ProviderCardProps) {
    const accountCount = group?.accountCount ?? 0;
    const windowCount = group?.windows.length ?? 0;
    const hasUsage = windowCount > 0;
    const label = group?.label ?? PROVIDER_LABELS[provider];

    return (
        <div className={"card" + (group?.status === "critical" ? " alert" : "")}>
            <div className="card-head">
                <VendorMark id={provider} size={28} />
                <div>
                    <div className="card-name">{label}</div>
                    <div className="rel-time">
                        {accountCount} 个账号 · {windowCount} 个窗口 · {statusLabel(group?.status)}
                    </div>
                </div>
                {(onRefresh !== undefined || onSelect !== undefined) && (
                    <div className="card-tools">
                        {onRefresh && (
                            <button
                                className="icon-btn"
                                title={`刷新 ${label}`}
                                aria-label={`刷新 ${label}`}
                                onClick={() => {
                                    onRefresh(provider);
                                }}
                            >
                                <Icon name="refresh" size={16} />
                            </button>
                        )}
                        {onSelect && (
                            <button
                                className="icon-btn"
                                aria-label={`查看 ${label}`}
                                onClick={() => {
                                    onSelect(provider);
                                }}
                            >
                                ›
                            </button>
                        )}
                    </div>
                )}
            </div>
            {!hasUsage && <div className="card-state off">暂无账号。请到设置添加数据来源。</div>}
        </div>
    );
}
