import { useState, useRef, useEffect, useMemo, type CSSProperties } from "react";
import type { UsageProvider } from "../../shared/schemas/plugin-output";
import { usePlugins } from "../hooks/use-plugins";
import { usePopupHeightReport } from "../hooks/use-popup-height-report";
import { useTheme } from "../lib/theme";
import { Icon } from "../components/Icon";
import { ProviderAccountList } from "../components/ProviderAccountList";
import { ProviderNav } from "../components/ProviderNav";
import { ProviderOverview } from "../components/ProviderOverview";
import { TokenPanel } from "../components/TokenPanel";
import { CollapsibleCard } from "../components/CollapsibleCard";
import { buildProviderUsageGroups, getVisibleProviders } from "../lib/provider-usage";
import logo from "../assets/logo.png";

const MODULE = "PopupView";
const token_panel_enabled = import.meta.env["VITE_ENABLE_TOKEN_PANEL"] === "1";

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function structural_signature(
    activeTab: UsageProvider | "overview",
    groups: ReturnType<typeof buildProviderUsageGroups>,
): string {
    if (activeTab === "overview") {
        return "overview:" + groups.map((g) => g.provider).join(",");
    }
    const group = groups.find((g) => g.provider === activeTab);
    if (!group) return `tab:${activeTab}:none`;
    return `tab:${activeTab}:` + group.accounts.map((a) => a.id).join(",");
}

export function PopupView() {
    useTheme();
    const { plugins, loading, error, refreshAll } = usePlugins();
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState<UsageProvider | "overview">("overview");
    const [collapsed_accounts, set_collapsed_accounts] = useState<Record<string, boolean>>({});
    const [expanded_providers, set_expanded_providers] = useState<Record<string, boolean>>({});
    const [provider_order, set_provider_order] = useState<UsageProvider[]>([]);
    const [drag_id, set_drag_id] = useState<UsageProvider | null>(null);
    const [over_id, set_over_id] = useState<UsageProvider | null>(null);
    const [account_drag_id, set_account_drag_id] = useState<string | null>(null);
    const [account_over_id, set_account_over_id] = useState<string | null>(null);
    const [account_orders, set_account_orders] = useState<Record<string, string[]>>({});
    const [token_panel_collapsed, set_token_panel_collapsed] = useState(false);

    // Load persisted provider order from config
    useEffect(() => {
        window.usageboard.config
            .get()
            .then((result) => {
                const order = result.config.providerOrder;
                if (order && order.length > 0) {
                    set_provider_order(order as UsageProvider[]);
                }
            })
            .catch(() => {
                // ignore load errors
            });
    }, []);

    // Persist provider order to config when it changes
    useEffect(() => {
        if (provider_order.length === 0) return;
        window.usageboard.config
            .get()
            .then((result) => {
                void window.usageboard.config.save({
                    ...result.config,
                    providerOrder: provider_order,
                });
            })
            .catch(() => {
                // ignore save errors
            });
    }, [provider_order]);
    const tabsRef = useRef<HTMLDivElement>(null);
    const live_root_ref = useRef<HTMLDivElement | null>(null);
    const content_mirror_ref = useRef<HTMLDivElement | null>(null);
    const collapsed_mirror_ref = useRef<HTMLDivElement | null>(null);

    const providerGroups = useMemo(() => buildProviderUsageGroups(plugins), [plugins]);
    const visibleProviders = useMemo(() => getVisibleProviders(plugins), [plugins]);

    // Apply persisted order to visible providers
    const orderedProviders = useMemo(() => {
        if (provider_order.length === 0) return visibleProviders;
        const orderSet = new Set(provider_order);
        const ordered = provider_order.filter((p) => visibleProviders.includes(p));
        const remaining = visibleProviders.filter((p) => !orderSet.has(p));
        return [...ordered, ...remaining];
    }, [visibleProviders, provider_order]);
    const providerErrors = useMemo(() => {
        const map = new Map<UsageProvider, { displayName: string; error: string }>();
        for (const c of plugins) {
            if (c.snapshot.status !== "failed") continue;
            for (const p of c.activeProviders) {
                if (!map.has(p))
                    map.set(p, { displayName: c.displayName, error: c.snapshot.error });
            }
        }
        return map;
    }, [plugins]);

    // Derive disabled providers from plugin enabled state (config-backed).
    // A provider is disabled only when ALL its plugins are disabled.
    const disabled_providers = useMemo(() => {
        const set = new Set<string>();
        const providerPlugins = new Map<string, { total: number; disabled: number }>();
        for (const p of plugins) {
            for (const prov of p.activeProviders) {
                const entry = providerPlugins.get(prov) ?? { total: 0, disabled: 0 };
                entry.total++;
                if (!p.enabled) entry.disabled++;
                providerPlugins.set(prov, entry);
            }
        }
        for (const [prov, entry] of providerPlugins) {
            if (entry.disabled === entry.total) set.add(prov);
        }
        return set;
    }, [plugins]);

    const activeGroup =
        activeTab === "overview"
            ? undefined
            : providerGroups.find((group) => group.provider === activeTab);

    // Phase 20.6: reset collapse/expand state when provider/account structure changes
    // or when the active tab switches. Refreshes that preserve the structure
    // (same provider set, same account IDs) keep the user's collapse choices.
    const signature = structural_signature(activeTab, providerGroups);
    const last_signature_ref = useRef<string>(signature);
    useEffect(() => {
        if (last_signature_ref.current !== signature) {
            last_signature_ref.current = signature;
            set_collapsed_accounts({});
            set_expanded_providers({});
        }
    }, [signature]);

    usePopupHeightReport(content_mirror_ref, collapsed_mirror_ref);

    const goToSettings = () => {
        window.usageboard.settings.open();
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

    const toggle_account = (id: string) => {
        set_collapsed_accounts((prev) => ({ ...prev, [id]: !(prev[id] ?? false) }));
    };

    const toggle_expand_provider = (provider: UsageProvider) => {
        set_expanded_providers((prev) => ({ ...prev, [provider]: !(prev[provider] ?? false) }));
    };

    const toggle_disable_provider = (provider: UsageProvider) => {
        void window.usageboard.config.get().then((result) => {
            const plugin = result.config.plugins.find((p) =>
                p.enabled
                    ? p.name === provider ||
                      (plugins
                          .find((pi) => pi.instanceId === p.instanceId)
                          ?.activeProviders.includes(provider) ??
                          false)
                    : false,
            );
            const disabledPlugin = result.config.plugins.find((p) => {
                if (p.enabled) return false;
                const info = plugins.find((pi) => pi.instanceId === p.instanceId);
                return info?.activeProviders.includes(provider) ?? false;
            });
            const target = plugin ?? disabledPlugin;
            if (!target) return;
            void window.usageboard.config.save({
                ...result.config,
                plugins: result.config.plugins.map((p) =>
                    p.instanceId === target.instanceId ? { ...p, enabled: !p.enabled } : p,
                ),
            });
        });
    };

    const delete_provider = (provider: UsageProvider) => {
        void window.usageboard.config.get().then((result) => {
            const target = result.config.plugins.find((p) => {
                const info = plugins.find((pi) => pi.instanceId === p.instanceId);
                return info?.activeProviders.includes(provider) ?? false;
            });
            if (!target) return;
            void window.usageboard.config.save({
                ...result.config,
                plugins: result.config.plugins.filter((p) => p.instanceId !== target.instanceId),
            });
        });
    };

    // Drag-and-drop handlers for provider card reordering
    const handle_drag_start = (provider: UsageProvider) => {
        set_drag_id(provider);
    };

    const handle_drag_enter = (provider: UsageProvider) => {
        if (!drag_id || drag_id === provider) return;
        set_over_id(provider);
        // Reorder: move drag_id to the position of provider
        set_provider_order((prev) => {
            const base =
                prev.length > 0
                    ? prev.filter((p) => orderedProviders.includes(p))
                    : [...orderedProviders];
            const from = base.indexOf(drag_id);
            const to = base.indexOf(provider);
            if (from < 0 || to < 0) return prev;
            const next = [...base];
            next.splice(from, 1);
            next.splice(to, 0, drag_id);
            return next;
        });
    };

    const handle_drag_end = () => {
        set_drag_id(null);
        set_over_id(null);
    };

    // Account drag handlers for single-provider tab view
    const handle_account_drag_start = (accountId: string) => {
        set_account_drag_id(accountId);
    };

    const handle_account_drag_enter = (accountId: string) => {
        if (!account_drag_id || account_drag_id === accountId) return;
        set_account_over_id(accountId);
        if (!activeGroup) return;
        const tabKey = activeTab as string;
        set_account_orders((prev) => {
            const baseIds = (prev[tabKey] ?? activeGroup.accounts.map((a) => a.id)).filter((id) =>
                activeGroup.accounts.some((a) => a.id === id),
            );
            const from = baseIds.indexOf(account_drag_id);
            const to = baseIds.indexOf(accountId);
            if (from < 0 || to < 0) return prev;
            const next = [...baseIds];
            next.splice(from, 1);
            next.splice(to, 0, account_drag_id);
            return { ...prev, [tabKey]: next };
        });
    };

    const handle_account_drag_end = () => {
        set_account_drag_id(null);
        set_account_over_id(null);
    };

    // Apply account order to active group
    const orderedActiveGroup = useMemo(() => {
        if (!activeGroup) return undefined;
        const tabKey = activeTab as string;
        const order = account_orders[tabKey];
        if (!order || order.length === 0) return activeGroup;
        const orderSet = new Set(order);
        const ordered = order
            .filter((id) => activeGroup.accounts.some((a) => a.id === id))
            .map((id) => activeGroup.accounts.find((a) => a.id === id))
            .filter(Boolean);
        const remaining = activeGroup.accounts.filter((a) => !orderSet.has(a.id));
        return {
            ...activeGroup,
            accounts: [...ordered, ...remaining] as typeof activeGroup.accounts,
        };
    }, [activeGroup, account_orders, activeTab]);

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

    // Phase 20.5: titlebar drag is platform-dependent.
    // macOS popups are anchored to the tray icon and must not be user-draggable.
    // Win/Linux popups stay draggable via the existing CSS rule.
    const platform = window.usageboard.platform;
    const titlebar_class = "titlebar" + (platform === "darwin" ? " titlebar-no-drag" : "");

    // Render is shared between the live tree and the offscreen mirrors used
    // for height measurement. Only the live tree binds refs and interactive
    // handlers; mirrors render purely structural DOM. The `collapsed` mirror
    // additionally forces every collapsible card into the collapsed state.
    const render_body = (is_live: boolean, force_collapse: boolean) => {
        const collapsed_map = force_collapse
            ? new Proxy<Record<string, boolean>>({}, { get: () => true })
            : collapsed_accounts;
        const toggle_handler = is_live ? toggle_account : () => undefined;
        return (
            <>
                {/* title bar */}
                <div className={titlebar_class}>
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
                            onClick={is_live ? handleRefreshAll : undefined}
                        >
                            <Icon name="refresh" size={18} />
                        </button>
                        <button
                            className="icon-btn"
                            title="设置"
                            onClick={is_live ? goToSettings : undefined}
                        >
                            <Icon name="gear" size={18} />
                        </button>
                    </div>
                </div>

                {/* tab strip */}
                <div
                    className={"tabs-wrap" + (is_live ? "" : " tabs-wrap-mirror")}
                    ref={is_live ? tabsRef : undefined}
                >
                    <ProviderNav
                        activeTab={activeTab}
                        visibleProviders={visibleProviders}
                        onChange={is_live ? setActiveTab : () => undefined}
                    />
                </div>
                <div className="titlebar-divider" />

                {/* scroll body */}
                <div className="scroll">
                    {error && (
                        <div className="net-banner">
                            <Icon name="cloud_off" size={18} />
                            <span>网络连接异常，部分数据可能不是最新</span>
                            <span
                                className="nb-action"
                                onClick={is_live ? handleRefreshAll : undefined}
                            >
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
                                添加你的第一个 AI 服务账号，即可在这里实时查看用量限制与 Token
                                趋势。
                            </div>
                            <button
                                className="btn-primary"
                                onClick={is_live ? goToSettings : undefined}
                            >
                                <Icon name="plus" size={15} color="#fff" />
                                添加服务
                            </button>
                        </div>
                    )}

                    {!loading && plugins.length > 0 && activeTab === "overview" && (
                        <ProviderOverview
                            groups={providerGroups}
                            visibleProviders={orderedProviders}
                            providerErrors={providerErrors}
                            onRefreshProvider={is_live ? refreshProvider : () => undefined}
                            expandedProviders={is_live ? expanded_providers : undefined}
                            onToggleExpandProvider={is_live ? toggle_expand_provider : undefined}
                            disabledProviders={is_live ? disabled_providers : undefined}
                            onToggleDisableProvider={is_live ? toggle_disable_provider : undefined}
                            onDeleteProvider={is_live ? delete_provider : undefined}
                            draggingProvider={is_live ? drag_id : null}
                            overProvider={is_live ? over_id : null}
                            onDragStart={is_live ? handle_drag_start : undefined}
                            onDragEnter={is_live ? handle_drag_enter : undefined}
                            onDragEnd={is_live ? handle_drag_end : undefined}
                        />
                    )}

                    {!loading &&
                        plugins.length > 0 &&
                        activeTab !== "overview" &&
                        orderedActiveGroup && (
                            <ProviderAccountList
                                group={orderedActiveGroup}
                                collapsedAccounts={collapsed_map}
                                onToggleAccount={toggle_handler}
                                draggingId={is_live ? account_drag_id : null}
                                overId={is_live ? account_over_id : null}
                                onDragStart={is_live ? handle_account_drag_start : undefined}
                                onDragEnter={is_live ? handle_account_drag_enter : undefined}
                                onDragEnd={is_live ? handle_account_drag_end : undefined}
                            />
                        )}

                    {!loading && plugins.length > 0 && activeTab !== "overview" && !activeGroup && (
                        <div className="empty">
                            <div className="empty-title">
                                该服务暂无账号。请到设置添加数据来源。
                            </div>
                        </div>
                    )}

                    {/* Token panel — disabled until backend token persistence is ready */}
                    {token_panel_enabled && !loading && plugins.length > 0 && (
                        <CollapsibleCard
                            header={<span className="card-name">Total Tokens</span>}
                            collapsed={token_panel_collapsed}
                            onToggle={
                                is_live
                                    ? () => {
                                          set_token_panel_collapsed((v) => !v);
                                      }
                                    : () => undefined
                            }
                            toggleLabel={
                                token_panel_collapsed ? "展开 Token 面板" : "折叠 Token 面板"
                            }
                        >
                            <TokenPanel has_real_data={false} />
                        </CollapsibleCard>
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
            </>
        );
    };

    // Mirrors are only useful for live height measurement; skip them in
    // environments without ResizeObserver (jsdom in vitest by default) so the
    // duplicate DOM does not confuse `screen.getByText` queries in tests.
    const should_render_mirrors = typeof ResizeObserver !== "undefined";

    return (
        <>
            <div className="window" data-popup="live" ref={live_root_ref}>
                {render_body(true, false)}
            </div>
            {should_render_mirrors && (
                <>
                    {/* Offscreen mirrors used to measure popup heights for the
                        main process. Two trees: one with the user's current
                        collapse state (for `content_height`), one with every
                        collapsible card forced collapsed (for
                        `collapsed_min_height`). Both use `height: auto` so they
                        report the desired height, not the clamped viewport.
                        Mirrors must not bind live refs or interactive handlers. */}
                    <div
                        ref={content_mirror_ref}
                        className="window popup-mirror"
                        aria-hidden="true"
                        inert
                        style={popup_mirror_style}
                    >
                        {render_body(false, false)}
                    </div>
                    <div
                        ref={collapsed_mirror_ref}
                        className="window popup-mirror"
                        aria-hidden="true"
                        inert
                        style={popup_mirror_style}
                    >
                        {render_body(false, true)}
                    </div>
                </>
            )}
        </>
    );
}

const popup_mirror_style: CSSProperties = {
    position: "fixed",
    top: 0,
    left: -99999,
    width: "100%",
    height: "auto",
    maxHeight: "none",
    pointerEvents: "none",
    visibility: "hidden",
};
