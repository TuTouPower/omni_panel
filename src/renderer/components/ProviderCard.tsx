import { useState } from "react";
import type { UsageProvider } from "../../shared/schemas/plugin-output";
import type { ProviderUsageGroup } from "../lib/provider-usage";
import { PROVIDER_LABELS } from "../lib/provider-usage";
import type { ProviderError } from "./ProviderOverview";
import { Icon, VendorMark } from "./Icon";
import { CollapsibleCard } from "./CollapsibleCard";
import { ProviderAccountRow } from "./ProviderAccountRow";
import { CardMenu, type CardMenuItem } from "./CardMenu";

interface ProviderCardProps {
    provider: UsageProvider;
    group?: ProviderUsageGroup | undefined;
    connectorError?: ProviderError | undefined;
    onSelect?: (provider: UsageProvider) => void;
    onRefresh?: (provider: UsageProvider) => void;
    expanded?: boolean;
    onToggleExpand?: (provider: UsageProvider) => void;
}

function statusLabel(status: ProviderUsageGroup["status"] | undefined): string {
    if (status === "critical") return "紧急";
    if (status === "warning") return "预警";
    if (status === "unknown") return "未知";
    return "正常";
}

function is_auth_error(error: string): boolean {
    const lower = error.toLowerCase();
    return (
        lower.includes("token") ||
        lower.includes("credential") ||
        lower.includes("unauthorized") ||
        lower.includes("auth") ||
        lower.includes("凭证") ||
        lower.includes("登录") ||
        lower.includes("密钥")
    );
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
    const hasUsage = (group?.windows.length ?? 0) > 0;
    const label = connectorError?.displayName ?? group?.label ?? PROVIDER_LABELS[provider];
    const isFailed = connectorError !== undefined && !hasUsage;
    const is_auth = connectorError !== undefined && is_auth_error(connectorError.error);
    const hasAccounts = group !== undefined && group.accounts.length > 0;
    const is_danger = group?.status === "critical";
    const card_class = is_danger ? "alert" : undefined;

    const render_state = () => {
        if (isFailed) {
            if (is_auth) {
                return (
                    <div className="card-state auth">
                        <span className="cs-ic">
                            <Icon name="lock" size={15} />
                        </span>
                        <span>凭证失效</span>
                        <span
                            className="cs-action"
                            onClick={() => {
                                window.location.hash = "#settings";
                            }}
                        >
                            重新配置
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
    };

    const [menu_open, set_menu_open] = useState(false);
    const [menu_pos, set_menu_pos] = useState({ x: 0, y: 0 });

    const open_menu = (e: React.MouseEvent) => {
        e.stopPropagation();
        set_menu_pos({ x: e.clientX - 220, y: e.clientY });
        set_menu_open(true);
    };

    const menu_items: CardMenuItem[] = [
        {
            label: "编辑",
            icon: <Icon name="gear" size={15} />,
            onClick: () => {
                window.location.hash = "#settings";
            },
        },
        { label: "关闭监控", icon: <Icon name="power" size={15} />, onClick: () => undefined },
        {
            label: "删除",
            icon: <Icon name="trash" size={15} />,
            danger: true,
            onClick: () => {
                window.location.hash = "#settings";
            },
        },
    ];

    const header = (
        <>
            <VendorMark id={provider} size={28} />
            <div>
                <div className="card-name">{label}</div>
                {hasUsage && (
                    <div className="rel-time">
                        {accountCount > 1 && <>{accountCount} 个账号 · </>}
                        {statusLabel(group?.status)}
                    </div>
                )}
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
            <button className="icon-btn" aria-label="更多操作" title="更多操作" onClick={open_menu}>
                <Icon name="more" size={16} />
            </button>
        </>
    );

    const card_content =
        onToggleExpand === undefined || !hasAccounts ? (
            // Non-expandable card
            <div data-provider={provider} className={"card" + (card_class ? ` ${card_class}` : "")}>
                <div className="card-head">
                    {header}
                    {tools}
                </div>
                {render_state()}
            </div>
        ) : (
            // Expandable card in overview mode
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

    return (
        <>
            {card_content}
            <CardMenu
                items={menu_items}
                open={menu_open}
                position={menu_pos}
                onClose={() => {
                    set_menu_open(false);
                }}
            />
        </>
    );
}
