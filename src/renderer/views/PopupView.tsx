import { useState, useRef, useEffect, useMemo, useCallback, type CSSProperties } from "react";
import { use_plugins } from "../hooks/use-plugins";
import { is_web } from "../lib/is-web";
import { use_popup_height_report } from "../hooks/use-popup-height-report";
import { useNowTick } from "../hooks/use-now-tick";
import { usePopupUiConfig } from "../hooks/use-popup-ui-config";
import { use_popup_derived } from "../hooks/use_popup_derived";
import { use_dnd_handlers } from "../hooks/use_dnd_handlers";
import { use_watched_metric_toggler } from "../hooks/use_watched_metric_toggler";
import { use_tab_navigation } from "../hooks/use_tab_navigation";
import { useTheme } from "../lib/theme";
import { Icon } from "../components/Icon";
import { ProviderAccountList } from "../components/ProviderAccountList";
import { ProviderNav } from "../components/ProviderNav";
import { ProviderOverview } from "../components/ProviderOverview";
import { TokenPanel } from "../components/TokenPanel";
import { CollapsibleCard } from "../components/CollapsibleCard";
import { UpcomingResetRail } from "../components/UpcomingResetRail";
import { UpcomingResetBanner } from "../components/UpcomingResetBanner";
import { type ProviderUsageGroup } from "../lib/provider-usage";
import type { AppConfiguration } from "../../shared/types/config";
import { relative_time } from "../lib/utils";
import logo from "../assets/logo.svg";
import { createLogger } from "../../shared/lib/logger";
import { redact_config_raw } from "../../shared/lib/config_redaction";

const MODULE = "PopupView";
const log = createLogger("renderer:popup-view");
const should_log_raw = import.meta.env.DEV;
const token_panel_enabled = import.meta.env["VITE_ENABLE_TOKEN_PANEL"] === "1";

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function structural_signature(groups: readonly ProviderUsageGroup[]): string {
    return groups.map((g) => g.provider + ":" + g.accounts.map((a) => a.id).join(",")).join("|");
}

function arrays_equal<T>(left: readonly T[] | undefined, right: readonly T[]): boolean {
    return left?.length === right.length && left.every((value, index) => value === right[index]);
}

function account_orders_equal(
    left: Readonly<Record<string, readonly string[]>>,
    right: Readonly<Record<string, readonly string[]>>,
): boolean {
    const left_keys = Object.keys(left);
    const right_keys = Object.keys(right);
    if (left_keys.length !== right_keys.length) return false;
    return left_keys.every((key) => {
        const right_order = right[key];
        return right_order !== undefined && arrays_equal(left[key], right_order);
    });
}

export function PopupView() {
    useTheme();
    useNowTick();
    const { plugins, loading, error, refreshAll, reload } = use_plugins();
    const [refreshing, setRefreshing] = useState(false);
    const [refreshing_providers, set_refreshing_providers] = useState<Set<string>>(new Set());
    const [activeTab, setActiveTab] = useState<string>("overview");
    const [collapsed_accounts, set_collapsed_accounts] = useState<Record<string, boolean>>({});
    const [expanded_providers, set_expanded_providers] = useState<Record<string, boolean>>({});
    const [provider_order, set_provider_order] = useState<string[]>([]);
    const save_queue_ref = useRef(Promise.resolve());
    const synced_order_ref = useRef<string[]>([]);
    const [account_orders, set_account_orders] = useState<Record<string, string[]>>({});
    const synced_account_orders_ref = useRef<Record<string, string[]>>({});
    const mounted_ref = useRef(true);
    useEffect(() => {
        mounted_ref.current = true;
        return () => {
            mounted_ref.current = false;
        };
    }, []);
    const [upcoming_reset_threshold_percent, set_upcoming_reset_threshold_percent] = useState<
        number | null | undefined
    >(undefined);
    const {
        main_panel_mode,
        usage_bar_color_scheme,
        usage_bar_style,
        convergent_time_minutes,
        account_overrides,
        account_labels,
        account_label_maps,
        provider_label_maps,
        ui_desensitize_remarks,
        provider_force_percent,
        token_panel_collapsed,
        set_token_panel_collapsed,
        set_usage_bar_color_scheme,
        set_usage_bar_style,
        set_convergent_time_minutes,
        set_account_overrides,
        set_account_labels,
        set_account_label_maps,
        set_provider_label_maps,
        set_ui_desensitize_remarks,
        set_provider_force_percent,
    } = usePopupUiConfig();

    const apply_config = useCallback(
        (config: AppConfiguration) => {
            const order = config.providerOrder;
            if (order && order.length > 0) {
                // 自定义 provider（t095）不在内置白名单内；信任 config 持久化的顺序，
                // 残留无效 provider 由 config-store prune 兜底。
                const validated = [...order];
                if (validated.length > 0) {
                    set_provider_order((current) =>
                        arrays_equal(current, validated) ? current : validated,
                    );
                }
            }
            if (config.usageBarColorScheme) {
                set_usage_bar_color_scheme(config.usageBarColorScheme);
            }
            if (config.usageBarStyle) {
                set_usage_bar_style(config.usageBarStyle);
            }
            set_convergent_time_minutes(config.convergentTimeMinutes);
            set_account_label_maps(config.accountLabelMaps);
            set_provider_label_maps(config.providerLabelMaps);
            set_ui_desensitize_remarks(config.uiDesensitizeRemarks === true);
            set_provider_force_percent(config.providerForcePercent);
            set_account_overrides(config.accountOverrides);
            set_account_labels(config.accountLabels);
            set_upcoming_reset_threshold_percent(config.upcomingResetThresholdPercent ?? null);
            if (config.accountOrders) {
                const next_orders = Object.fromEntries(
                    Object.entries(config.accountOrders).map(([key, value]) => [key, [...value]]),
                );
                synced_account_orders_ref.current = next_orders;
                set_account_orders((current) =>
                    account_orders_equal(current, next_orders) ? current : next_orders,
                );
            }
            if (config.collapsedAccounts) {
                set_collapsed_accounts(config.collapsedAccounts);
            }
            if (config.expandedProviders) {
                set_expanded_providers(config.expandedProviders);
            }
        },
        [
            set_usage_bar_color_scheme,
            set_usage_bar_style,
            set_convergent_time_minutes,
            set_account_label_maps,
            set_provider_label_maps,
            set_ui_desensitize_remarks,
            set_provider_force_percent,
            set_account_overrides,
            set_account_labels,
            set_upcoming_reset_threshold_percent,
        ],
    );

    // Single read-modify-write queue for persistence. Three effects below used
    // to each inline this exact block; a bug in one would silently desync.
    const patchConfig = useCallback((patch: Partial<AppConfiguration>) => {
        save_queue_ref.current = save_queue_ref.current
            .then(async () => {
                const result = await window.usageboard.config.get();
                await window.usageboard.config.save({ ...result.config, ...patch });
            })
            .catch((err: unknown) => {
                window.usageboard.log({
                    level: "error",
                    module: "PopupView",
                    message: `config persistence failed: ${err instanceof Error ? err.message : String(err)}`,
                });
            });
    }, []);

    // Load persisted provider order from config
    useEffect(() => {
        window.usageboard.config
            .get()
            .then((result) => {
                if (should_log_raw) {
                    log.debug("popup config raw", { config: redact_config_raw(result.config) });
                }
                apply_config(result.config);
            })
            .catch((err: unknown) => {
                window.usageboard.log({
                    level: "error",
                    module: "PopupView",
                    message: `config persistence failed: ${err instanceof Error ? err.message : String(err)}`,
                });
                // ignore load errors
            });
    }, [apply_config]);

    useEffect(() => {
        return window.usageboard.event.onConfigChange?.((config) => {
            apply_config(config);
            if (config.providerOrder && config.providerOrder.length > 0) {
                synced_order_ref.current = [...config.providerOrder];
            }
            void reload();
        });
    }, [apply_config, reload]);

    // Persist provider order to config when user reorders (not from external config sync)
    useEffect(() => {
        if (provider_order.length === 0) return;
        const prev = synced_order_ref.current;
        if (prev.length === provider_order.length && prev.every((v, i) => v === provider_order[i]))
            return;
        synced_order_ref.current = provider_order;
        patchConfig({ providerOrder: provider_order });
    }, [provider_order, patchConfig]);

    useEffect(() => {
        const prev = synced_account_orders_ref.current;
        if (account_orders_equal(prev, account_orders)) return;
        synced_account_orders_ref.current = account_orders;
        patchConfig({ accountOrders: account_orders });
    }, [account_orders, patchConfig]);

    // Persist collapsed/expanded state to config
    const prev_collapsed_ref = useRef<Record<string, boolean>>({});
    const prev_expanded_ref = useRef<Record<string, boolean>>({});
    useEffect(() => {
        const prev_c = prev_collapsed_ref.current;
        const prev_e = prev_expanded_ref.current;
        if (
            JSON.stringify(prev_c) === JSON.stringify(collapsed_accounts) &&
            JSON.stringify(prev_e) === JSON.stringify(expanded_providers)
        ) {
            return;
        }
        prev_collapsed_ref.current = collapsed_accounts;
        prev_expanded_ref.current = expanded_providers;
        patchConfig({
            collapsedAccounts: collapsed_accounts,
            expandedProviders: expanded_providers,
        });
    }, [collapsed_accounts, expanded_providers, patchConfig]);

    const tabsRef = useRef<HTMLDivElement>(null);
    const content_mirror_ref = useRef<HTMLDivElement | null>(null);
    const collapsed_mirror_ref = useRef<HTMLDivElement | null>(null);
    const scroll_ref = useRef<HTMLDivElement>(null);

    const {
        providerGroups,
        visibleProviders,
        upcomingItems,
        orderedProviders,
        providerErrors,
        accountErrors,
        activeGroup,
        orderedActiveGroup,
    } = use_popup_derived({
        plugins,
        account_overrides,
        account_labels,
        upcoming_reset_threshold_percent,
        provider_order,
        active_tab: activeTab,
        account_orders,
    });
    // t041：阈值非空时才挂载 Banner/Rail；抽局部常量避免两处 verbatim 重复。
    const show_upcoming = upcoming_reset_threshold_percent != null;
    const select_provider_from_upcoming = useCallback((provider: string) => {
        setActiveTab(provider);
        scroll_ref.current?.scrollTo({ top: 0, behavior: "smooth" });
    }, []);

    useEffect(() => {
        if (should_log_raw) {
            log.debug("popup runtime states raw", { states: plugins });
        }
    }, [plugins]);

    useEffect(() => {
        if (should_log_raw) {
            log.debug("popup grouped usage raw", { groups: providerGroups });
        }
    }, [providerGroups]);

    useEffect(() => {
        if (should_log_raw) {
            log.debug("popup usage bar color scheme raw", { usage_bar_color_scheme });
        }
    }, [usage_bar_color_scheme]);

    // Prune collapse/expand state when provider/account structure changes,
    // removing entries for accounts/providers that no longer exist.
    // Do NOT reset when transitioning from empty (first data load) —
    // config-restored state would be wiped.
    const signature = structural_signature(providerGroups);
    const last_signature_ref = useRef<string>(signature);
    useEffect(() => {
        const prev = last_signature_ref.current;
        last_signature_ref.current = signature;
        if (prev === signature || prev === "") return;
        const live_account_ids = new Set(
            providerGroups.flatMap((g) => g.accounts.map((a) => a.id)),
        );
        set_collapsed_accounts((prev_c) => {
            const next: Record<string, boolean> = {};
            for (const [id, v] of Object.entries(prev_c)) {
                if (live_account_ids.has(id)) next[id] = v;
            }
            return next;
        });
        const live_providers = new Set(providerGroups.map((g) => g.provider));
        set_expanded_providers((prev_e) => {
            const next: Record<string, boolean> = {};
            for (const [p, v] of Object.entries(prev_e)) {
                if (live_providers.has(p)) next[p] = v;
            }
            return next;
        });
    }, [signature, providerGroups]);

    use_popup_height_report(content_mirror_ref, collapsed_mirror_ref);

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
                setRefreshing(false);
            });
    };

    const refreshProvider = (provider: string) => {
        if (refreshing_providers.has(provider)) return;

        const connectors = plugins.filter(
            (connector) => connector.enabled && connector.activeProviders.includes(provider),
        );

        const started_at = Date.now();
        const MIN_SPINNER_MS = 500;

        set_refreshing_providers((prev) => new Set(prev).add(provider));

        void Promise.all(
            connectors.map((connector) =>
                window.usageboard.connector.refresh(connector.sourceInstanceId),
            ),
        )
            .catch((err: unknown) => {
                window.usageboard.log({
                    level: "error",
                    module: MODULE,
                    message: `刷新 ${provider} 失败: ${errorMessage(err)}`,
                });
            })
            .finally(() => {
                const elapsed = Date.now() - started_at;
                const remaining = Math.max(0, MIN_SPINNER_MS - elapsed);
                setTimeout(() => {
                    if (!mounted_ref.current) return;
                    set_refreshing_providers((prev) => {
                        const next = new Set(prev);
                        next.delete(provider);
                        return next;
                    });
                }, remaining);
            });
    };

    const toggle_account = (id: string) => {
        set_collapsed_accounts((prev) => ({ ...prev, [id]: !(prev[id] ?? false) }));
    };

    const toggle_expand_provider = (provider: string) => {
        set_expanded_providers((prev) => ({ ...prev, [provider]: !(prev[provider] ?? false) }));
    };

    const handle_re_login = async (provider: string) => {
        const connector = plugins.find((c) => c.enabled && c.activeProviders.includes(provider));
        if (!connector) return;
        try {
            const result = await window.usageboard.auth.cookieLogin(connector.instanceId);
            if (result.saved) {
                await window.usageboard.connector.refresh(connector.sourceInstanceId);
            }
        } catch (err: unknown) {
            window.usageboard.log({
                level: "error",
                module: MODULE,
                message: `重新登录 ${provider} 失败: ${err instanceof Error ? err.message : String(err)}`,
            });
        }
    };

    const handle_toggle_watched = use_watched_metric_toggler({
        account_overrides,
        set_account_overrides,
        patchConfig,
    });

    const {
        drag_id,
        over_id,
        account_drag_id,
        account_over_id,
        handle_drag_start,
        handle_drag_enter,
        handle_drag_over,
        handle_drag_end,
        handle_account_drag_start,
        handle_account_drag_enter,
        handle_account_drag_end,
    } = use_dnd_handlers({
        orderedProviders,
        activeGroup,
        activeTab,
        set_provider_order,
        set_account_orders,
    });

    use_tab_navigation({
        tabsRef,
        activeTab,
        orderedProviders,
        setActiveTab,
    });

    const lastUpdated = plugins.reduce<string | null>((latest, p) => {
        if (p.snapshot.status !== "ready" && p.snapshot.status !== "failed") return latest;
        if (!p.snapshot.updatedAt) return latest;
        return latest === null || p.snapshot.updatedAt > latest ? p.snapshot.updatedAt : latest;
    }, null);
    const footerTime = relative_time(lastUpdated ?? "");

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
                        {footerTime && (
                            <span className="tb-time" title="上次更新时间">
                                {footerTime}
                            </span>
                        )}
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
                        {is_web() && (
                            <button
                                className="icon-btn"
                                title="代理面板"
                                onClick={() => {
                                    window.usageboard.tokenStats.open();
                                }}
                            >
                                <Icon name="chart" size={18} />
                            </button>
                        )}
                        {is_live && main_panel_mode === "floating" && (
                            <button
                                className="icon-btn floating-close-btn"
                                title="隐藏到托盘"
                                aria-label="隐藏用量面板"
                                type="button"
                                onClick={() => {
                                    window.usageboard.main_panel.hide();
                                }}
                            >
                                <Icon name="close" size={18} />
                            </button>
                        )}
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
                <div className="scroll" ref={scroll_ref}>
                    <div className="scroll-inner">
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
                            <div className="overview-row">
                                {show_upcoming && (
                                    <UpcomingResetBanner
                                        items={upcomingItems}
                                        onSelectProvider={
                                            is_live
                                                ? select_provider_from_upcoming
                                                : () => undefined
                                        }
                                        desensitizeRemarks={ui_desensitize_remarks}
                                    />
                                )}
                                <ProviderOverview
                                    groups={providerGroups}
                                    visibleProviders={orderedProviders}
                                    providerErrors={providerErrors}
                                    onRefreshProvider={is_live ? refreshProvider : () => undefined}
                                    expandedProviders={is_live ? expanded_providers : undefined}
                                    onToggleExpandProvider={
                                        is_live ? toggle_expand_provider : undefined
                                    }
                                    onReLogin={
                                        is_live
                                            ? (p) => {
                                                  void handle_re_login(p);
                                              }
                                            : undefined
                                    }
                                    draggingProvider={is_live ? drag_id : null}
                                    overProvider={is_live ? over_id : null}
                                    onDragStart={is_live ? handle_drag_start : undefined}
                                    onDragEnter={is_live ? handle_drag_enter : undefined}
                                    onDragOver={is_live ? handle_drag_over : undefined}
                                    onDragEnd={is_live ? handle_drag_end : undefined}
                                    refreshingProviders={is_live ? refresh_providers : undefined}
                                    barColorScheme={usage_bar_color_scheme}
                                    barStyle={usage_bar_style}
                                    providerLabelMaps={provider_label_maps}
                                    accountLabelMaps={account_label_maps}
                                    convergentTimeMinutes={convergent_time_minutes}
                                    desensitizeRemarks={ui_desensitize_remarks}
                                    providerForcePercent={provider_force_percent}
                                    watchedMetrics={account_overrides?.upcomingResetWatched}
                                    on_toggle_watched={is_live ? handle_toggle_watched : undefined}
                                />
                                {show_upcoming && (
                                    <UpcomingResetRail
                                        items={upcomingItems}
                                        onSelectProvider={
                                            is_live
                                                ? select_provider_from_upcoming
                                                : () => undefined
                                        }
                                        desensitizeRemarks={ui_desensitize_remarks}
                                    />
                                )}
                            </div>
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
                                    onReLogin={
                                        is_live
                                            ? (p: string) => {
                                                  void handle_re_login(p);
                                              }
                                            : undefined
                                    }
                                    barColorScheme={usage_bar_color_scheme}
                                    barStyle={usage_bar_style}
                                    accountLabelMaps={account_label_maps}
                                    providerLabelMaps={provider_label_maps}
                                    desensitizeRemarks={ui_desensitize_remarks}
                                    forcePercent={
                                        provider_force_percent?.[orderedActiveGroup.provider] ===
                                        true
                                    }
                                    accountErrors={accountErrors}
                                    watchedMetrics={account_overrides?.upcomingResetWatched}
                                    on_toggle_watched={is_live ? handle_toggle_watched : undefined}
                                />
                            )}

                        {!loading &&
                            plugins.length > 0 &&
                            activeTab !== "overview" &&
                            !activeGroup && (
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
                </div>
            </>
        );
    };

    // Mirrors are only useful for live height measurement; skip them in
    // environments without ResizeObserver (jsdom in vitest by default) so the
    // duplicate DOM does not confuse `screen.getByText` queries in tests.
    const refresh_providers = useMemo(() => new Set(refreshing_providers), [refreshing_providers]);

    const should_render_mirrors = typeof ResizeObserver !== "undefined";

    return (
        <>
            <div className="window" data-popup="live">
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
