import type { UsageProvider } from "../../shared/schemas/plugin-output";
import type { ProviderUsageGroup } from "../lib/provider-usage";
import { PROVIDER_LABELS } from "../lib/provider-usage";
import type { ProviderError } from "./ProviderOverview";
import { Icon, VendorMark } from "./Icon";
import { CollapsibleCard } from "./CollapsibleCard";
import { ProviderAccountRow } from "./ProviderAccountRow";

interface ProviderCardProps {
    provider: UsageProvider;
    group?: ProviderUsageGroup | undefined;
    connectorError?: ProviderError | undefined;
    onSelect?: (provider: UsageProvider) => void;
    onRefresh?: (provider: UsageProvider) => void;
    /** When true, the card is expanded in-place showing account rows. */
    expanded?: boolean;
    /** Called when the chevron toggle is clicked. */
    onToggleExpand?: (provider: UsageProvider) => void;
}

function statusLabel(status: ProviderUsageGroup["status"] | undefined): string {
    if (status === "critical") return "紧急";
    if (status === "warning") return "预警";
    if (status === "unknown") return "未知";
    return "正常";
}

export function ProviderCard({
    provider,
    group,
    connectorError,
    onSelect,
    onRefresh,
    expanded,
    onToggleExpand,
}: ProviderCardProps) {
    const accountCount = group?.accountCount ?? 0;
    const windowCount = group?.windows.length ?? 0;
    const hasUsage = windowCount > 0;
    const label = connectorError?.displayName ?? group?.label ?? PROVIDER_LABELS[provider];
    const isFailed = connectorError !== undefined && !hasUsage;
    const hasAccounts = group !== undefined && group.accounts.length > 0;

    const header = (
        <>
            <VendorMark id={provider} size={28} />
            <div>
                <div className="card-name">{label}</div>
                <div className="rel-time">
                    {accountCount} 个账号 · {windowCount} 个窗口 · {statusLabel(group?.status)}
                </div>
            </div>
        </>
    );

    const tools = (
        <>
            {onRefresh !== undefined && (
                <button
                    className="icon-btn"
                    title={`刷新 ${label}`}
                    aria-label={`刷新 ${label}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        onRefresh(provider);
                    }}
                >
                    <Icon name="refresh" size={16} />
                </button>
            )}
            {onSelect !== undefined && (
                <button
                    className="icon-btn"
                    aria-label={`查看 ${label} 详情`}
                    title={`查看 ${label} 详情`}
                    onClick={(e) => {
                        e.stopPropagation();
                        onSelect(provider);
                    }}
                >
                    ›
                </button>
            )}
        </>
    );

    const card_class = group?.status === "critical" || isFailed ? "alert" : undefined;

    if (onToggleExpand === undefined || !hasAccounts) {
        // Non-expandable card (e.g. no accounts, or not in overview mode)
        return (
            <div data-provider={provider} className={"card" + (card_class ? ` ${card_class}` : "")}>
                <div className="card-head">
                    {header}
                    {tools}
                </div>
                {isFailed && <div className="card-state err">{connectorError.error}</div>}
                {!isFailed && !hasUsage && (
                    <div className="card-state off">暂无账号。请到设置添加数据来源。</div>
                )}
            </div>
        );
    }

    // Expandable card in overview mode
    return (
        <CollapsibleCard
            header={header}
            tools={tools}
            collapsed={!expanded}
            onToggle={() => {
                onToggleExpand(provider);
            }}
            className={card_class}
        >
            {group.accounts.map((account) => (
                <ProviderAccountRow key={account.id} account={account} />
            ))}
        </CollapsibleCard>
    );
}
