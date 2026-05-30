import { useState, useRef, useEffect } from "react";
import { usePlugins } from "../hooks/use-plugins";
import { useTheme } from "../lib/theme";
import { PluginCard } from "../components/PluginCard";
import { Icon, VendorMark } from "../components/Icon";
import logo from "../assets/logo.png";

export function PopupView() {
    useTheme();
    const { plugins, loading, error, refreshAll } = usePlugins();
    const [refreshing, setRefreshing] = useState(false);
    const [collapsedSet, setCollapsedSet] = useState<Set<string>>(() => new Set());
    const [activeTab, setActiveTab] = useState<string>("overview");
    const tabsRef = useRef<HTMLDivElement>(null);

    const enabledPlugins = plugins.filter((p) => p.enabled);

    const goToSettings = () => {
        window.location.hash = "#settings";
    };

    const handleRefreshAll = () => {
        if (refreshing) return;
        setRefreshing(true);
        void refreshAll().finally(() => {
            setTimeout(() => {
                setRefreshing(false);
            }, 800);
        });
    };

    const toggleCollapse = (id: string) => {
        setCollapsedSet((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
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

    const visiblePlugins =
        activeTab === "overview" ? plugins : plugins.filter((p) => p.instanceId === activeTab);

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
                <button
                    className={"tab" + (activeTab === "overview" ? " active" : "")}
                    data-tab="overview"
                    onClick={() => {
                        setActiveTab("overview");
                    }}
                >
                    <span className="tab-ic">
                        <VendorMark id="overview" size={22} />
                    </span>
                    <span className="tab-lbl">总览</span>
                </button>
                {enabledPlugins.map((p) => (
                    <button
                        key={p.instanceId}
                        className={"tab" + (activeTab === p.instanceId ? " active" : "")}
                        data-tab={p.instanceId}
                        onClick={() => {
                            setActiveTab(p.instanceId);
                        }}
                    >
                        <span className="tab-ic">
                            <VendorMark id={p.name.toLowerCase()} size={22} />
                        </span>
                        <span className="tab-lbl">{p.displayName}</span>
                    </button>
                ))}
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
                    <PluginCard
                        plugin={{
                            instanceId: "_skeleton",
                            stateId: "_skeleton",
                            name: "",
                            displayName: "",
                            enabled: true,
                            metadata: null,
                            snapshot: { status: "loading" },
                        }}
                    />
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

                {visiblePlugins.map((p) => (
                    <PluginCard
                        key={p.instanceId}
                        plugin={p}
                        collapsed={collapsedSet.has(p.instanceId)}
                        onToggleCollapse={() => {
                            toggleCollapse(p.instanceId);
                        }}
                    />
                ))}
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
