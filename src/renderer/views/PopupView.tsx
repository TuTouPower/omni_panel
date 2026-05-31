import { useState, useRef, useEffect } from "react";
import type { UsageProvider } from "../../shared/schemas/plugin-output";
import { usePlugins } from "../hooks/use-plugins";
import { useTheme } from "../lib/theme";
import { Icon } from "../components/Icon";
import { ProviderAccountList } from "../components/ProviderAccountList";
import { ProviderNav } from "../components/ProviderNav";
import { ProviderOverview } from "../components/ProviderOverview";
import { buildProviderUsageGroups, getVisibleProviders } from "../lib/provider-usage";
import logo from "../assets/logo.png";

const MODULE = "PopupView";

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export function PopupView() {
    useTheme();
    const { plugins, loading, error, refreshAll } = usePlugins();
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState<UsageProvider | "overview">("overview");
    const tabsRef = useRef<HTMLDivElement>(null);

    const providerGroups = buildProviderUsageGroups(plugins);
    const visibleProviders = getVisibleProviders(plugins);
    const activeGroup =
        activeTab === "overview"
            ? undefined
            : providerGroups.find((group) => group.provider === activeTab);

    const goToSettings = () => {
        window.location.hash = "#settings";
    };

    const handleRefreshAll = () => {
        if (refreshing) return;
        setRefreshing(true);
        void refreshAll()
            .catch((err: unknown) => {
                window.usageboard.log({
                    level: "error",
                    module: MODULE,
                    message: `刷新全部失败: ${errorMessage(err)}`,
                });
            })
            .finally(() => {
                setTimeout(() => {
                    setRefreshing(false);
                }, 800);
            });
    };

    const refreshProvider = (provider: UsageProvider) => {
        const connectors = plugins.filter(
            (connector) => connector.enabled && connector.activeProviders.includes(provider),
        );
        void Promise.all(
            connectors.map((connector) =>
                window.usageboard.plugin.refresh(connector.sourceInstanceId),
            ),
        ).catch((err: unknown) => {
            window.usageboard.log({
                level: "error",
                module: MODULE,
                message: `刷新 ${provider} 失败: ${errorMessage(err)}`,
            });
        });
    };

    // auto-scroll active tab into view
    useEffect(() => {
        const el = tabsRef.current?.querySelector(`[data-tab="${activeTab}"]`);
        if (el && "scrollIntoView" in el) {
            (el as HTMLElement).scrollIntoView({ behavior: "smooth", inline: "center" });
        }
    }, [activeTab]);

    const hasError = plugins.some((p) => p.snapshot.status === "failed");
    const statusDot = error || hasError ? "red" : "green";
    const statusLabel = error || hasError ? "刷新异常" : plugins.length > 0 ? "运行中" : "尚未配置";
    const lastUpdated = plugins
        .filter((p) => p.snapshot.status === "ready" || p.snapshot.status === "failed")
        .map((p) =>
            (p.snapshot.status === "ready" || p.snapshot.status === "failed") &&
            p.snapshot.updatedAt
                ? p.snapshot.updatedAt
                : "",
        )
        .filter(Boolean)
        .sort()
        .pop();
    const footerTime = lastUpdated ? "刚刚更新" : "";

    return (
        <div className="window">
            {/* title bar */}
            <div className="titlebar">
                <img
                    src={logo}
                    alt="OmniUsage"
                    className="app-logo"
                    width="30"
                    height="30"
                    style={{ borderRadius: 9 }}
                />
                <span className="app-title">OmniUsage</span>
                <div className="tb-actions">
                    <button
                        className={"icon-btn" + (refreshing ? " spinning" : "")}
                        title="刷新全部"
                        aria-label="刷新"
                        onClick={handleRefreshAll}
                    >
                        <Icon name="refresh" size={18} />
                    </button>
                    <button className="icon-btn" title="设置" onClick={goToSettings}>
                        <Icon name="gear" size={18} />
                    </button>
                </div>
            </div>

            {/* tab strip */}
            <div className="tabs-wrap" ref={tabsRef}>
                <ProviderNav
                    activeTab={activeTab}
                    visibleProviders={visibleProviders}
                    onChange={setActiveTab}
                />
            </div>
            <div className="titlebar-divider" />

            {/* scroll body */}
            <div className="scroll">
                {error && (
                    <div className="net-banner">
                        <Icon name="cloud_off" size={18} />
                        <span>{error}</span>
                        <span className="nb-action" onClick={handleRefreshAll}>
                            重新连接
                        </span>
                    </div>
                )}

                {loading && plugins.length === 0 && (
                    <div className="card">
                        <div className="card-head">
                            <div className="skel lbl" />
                        </div>
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
                    </div>
                )}

                {!loading && plugins.length === 0 && !error && (
                    <div className="empty">
                        <div className="empty-ic">
                            <Icon name="inbox" size={30} strokeWidth={1.6} />
                        </div>
                        <div className="empty-title">还没有添加任何服务</div>
                        <div className="empty-sub">
                            添加你的第一个 AI 服务账号，即可在这里实时查看用量限制与 Token 趋势。
                        </div>
                        <button className="btn-primary" onClick={goToSettings}>
                            <Icon name="plus" size={15} color="#fff" />
                            添加服务
                        </button>
                    </div>
                )}

                {!loading && plugins.length > 0 && activeTab === "overview" && (
                    <ProviderOverview
                        groups={providerGroups}
                        visibleProviders={visibleProviders}
                        onSelectProvider={setActiveTab}
                        onRefreshProvider={refreshProvider}
                    />
                )}

                {!loading && plugins.length > 0 && activeTab !== "overview" && activeGroup && (
                    <ProviderAccountList group={activeGroup} />
                )}

                {!loading && plugins.length > 0 && activeTab !== "overview" && !activeGroup && (
                    <div className="empty">
                        <div className="empty-title">该服务暂无账号。请到设置添加数据来源。</div>
                    </div>
                )}
            </div>

            {/* status bar */}
            <div className="statusbar">
                <div className="sb-left">
                    <span className={`dot ${statusDot}`} />
                    <span>{statusLabel}</span>
                </div>
                <div className="sb-right">
                    <span>{footerTime}</span>
                </div>
            </div>
        </div>
    );
}
