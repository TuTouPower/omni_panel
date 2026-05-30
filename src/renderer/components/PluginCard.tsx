import { useState, useEffect } from "react";
import type { PluginInfo } from "../../shared/types/ipc";
import type { UsageItem } from "../../shared/schemas/plugin-output";
import { Icon, VendorMark } from "./Icon";
import { AreaChart } from "./AreaChart";
import { TokenGrid } from "./TokenGrid";
import { relativeTime } from "../lib/utils";

function usagePercent(used: number, limit: number): number {
    if (limit <= 0) return 0;
    return Math.round((used / limit) * 100);
}

function useRelativeTime(iso: string | undefined): string {
    const [text, setText] = useState(() => (iso ? relativeTime(iso) : ""));
    useEffect(() => {
        if (!iso) return;
        const tick = () => {
            setText(relativeTime(iso));
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => {
            clearInterval(id);
        };
    }, [iso]);
    return text;
}

function SkeletonBars() {
    return (
        <div className="skeleton-bars">
            <div className="skel-row">
                <div className="skel lbl" />
                <div className="skel" />
            </div>
            <div className="skel-row">
                <div className="skel lbl" />
                <div className="skel" />
            </div>
        </div>
    );
}

function BarRow({ item }: { item: UsageItem }) {
    const pct = usagePercent(item.used, item.limit);
    const danger = pct >= 85;
    const warn = !danger && pct >= 65;
    const showRatio = item.displayStyle === "ratio";
    const valueText = showRatio
        ? `${String(item.used)} / ${String(item.limit)} (${String(pct)}%)`
        : `${String(pct)}%`;
    const invert = danger || warn || pct >= 65;

    return (
        <div className="ub-row">
            <div className="ub-row-label">{item.name}</div>
            <div
                className="ub-bar"
                data-tone={danger ? "danger" : warn ? "warn" : undefined}
                data-invert={invert || undefined}
            >
                <div className="ub-bar-fill" style={{ width: `${String(Math.min(100, pct))}%` }} />
                <div className="ub-bar-text">{valueText}</div>
            </div>
            <div className="ub-row-time">{item.resetAt ?? ""}</div>
        </div>
    );
}

interface PluginCardProps {
    plugin: PluginInfo;
    vendorId?: string;
    collapsed?: boolean;
    onToggleCollapse?: () => void;
}

export function PluginCard({ plugin, vendorId, collapsed, onToggleCollapse }: PluginCardProps) {
    const { snapshot } = plugin;
    const updatedAt =
        snapshot.status === "ready" || snapshot.status === "failed"
            ? snapshot.updatedAt
            : undefined;
    const timeAgo = useRelativeTime(updatedAt);
    const [menuOpen, setMenuOpen] = useState(false);

    const isLoading = snapshot.status === "idle" || snapshot.status === "loading";
    const isError = snapshot.status === "failed";
    const hasItems = snapshot.status === "ready" && snapshot.items.length > 0;

    return (
        <div className={"card" + (isError ? " alert" : "") + (!plugin.enabled ? " disabled" : "")}>
            <div className="card-head">
                <button className="icon-btn card-grip" title="拖动以调整顺序">
                    <Icon name="grip" size={18} strokeWidth={2} />
                </button>
                {vendorId && <VendorMark id={vendorId} size={26} />}
                <span className="card-name">{plugin.displayName}</span>
                {!plugin.enabled && <span className="off-badge">已关闭</span>}
                {!collapsed && plugin.enabled && (
                    <span className="rel-time">{isLoading ? "刷新中…" : timeAgo}</span>
                )}
                <div className="card-tools">
                    {plugin.enabled && (
                        <button className="icon-btn" title="刷新" aria-label="刷新">
                            <Icon name="refresh" size={17} />
                        </button>
                    )}
                    <div className="card-menu-wrap">
                        <button
                            className="icon-btn"
                            title="更多"
                            onClick={() => {
                                setMenuOpen((v) => !v);
                            }}
                        >
                            <Icon name="more" size={18} />
                        </button>
                        {menuOpen && (
                            <>
                                <div
                                    className="card-menu-overlay"
                                    onClick={() => {
                                        setMenuOpen(false);
                                    }}
                                />
                                <div
                                    className="card-menu"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                    }}
                                >
                                    <div className="cm-item">
                                        <span className="cm-ic">
                                            <Icon name="edit" size={15} />
                                        </span>
                                        编辑
                                    </div>
                                    <div className="cm-item">
                                        <span className="cm-ic">
                                            <Icon name="power" size={15} />
                                        </span>
                                        关闭
                                    </div>
                                    <div className="cm-item danger">
                                        <span className="cm-ic">
                                            <Icon name="trash" size={15} />
                                        </span>
                                        删除
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                    <button
                        className={"icon-btn card-collapse" + (collapsed ? " is-collapsed" : "")}
                        onClick={onToggleCollapse}
                        title={collapsed ? "展开" : "折叠"}
                    >
                        <Icon name="chev_down" size={18} />
                    </button>
                </div>
            </div>

            {collapsed ? null : !plugin.enabled ? (
                <div className="card-state off">
                    <span className="cs-ic">
                        <Icon name="power" size={16} />
                    </span>
                    <span>监控已关闭，不再刷新用量</span>
                </div>
            ) : isLoading ? (
                <SkeletonBars />
            ) : isError ? (
                <div className="card-state err">
                    <span className="cs-ic">
                        <Icon name="cloud_off" size={17} />
                    </span>
                    <span>{snapshot.error}</span>
                    <span className="cs-action">重试</span>
                </div>
            ) : hasItems ? (
                <div className="ub-rows">
                    {snapshot.items.map((item) => (
                        <BarRow key={item.id} item={item} />
                    ))}
                    <TokenGrid items={snapshot.items} />
                    {snapshot.chart && (
                        <div className="ub-chart">
                            <AreaChart chart={snapshot.chart} />
                        </div>
                    )}
                </div>
            ) : null}
        </div>
    );
}
