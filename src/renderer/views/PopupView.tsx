import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from "react";
import { use_plugins } from "../hooks/use-plugins";
import { use_popup_height_report } from "../hooks/use-popup-height-report";
import { useNowTick } from "../hooks/use-now-tick";
import { usePopupUiConfig } from "../hooks/use-popup-ui-config";
import { use_popup_derived } from "../hooks/use_popup_derived";
import { use_dnd_handlers } from "../hooks/use_dnd_handlers";
import { use_watched_metric_toggler } from "../hooks/use_watched_metric_toggler";
import { use_tab_navigation } from "../hooks/use_tab_navigation";
import { create_debounced_config_patcher } from "../lib/config-debounce";
import { useTheme } from "../lib/theme";
import { ProviderAccountList } from "../components/ProviderAccountList";
import { ProviderNav } from "../components/ProviderNav";
import { ProviderOverview } from "../components/ProviderOverview";
import { TokenPanel } from "../components/TokenPanel";
import { CollapsibleCard } from "../components/CollapsibleCard";
import { UPCOMING_RESET_CARD_ID } from "../components/UpcomingResetCard";
import { build_reorder_base } from "../lib/drag-reorder";
import { plugins_structure_signature } from "../lib/config-sync";
import type { AppConfiguration } from "../../shared/types/config";
import { relative_time } from "../lib/utils";
import { redact_config_raw } from "../../shared/lib/config_redaction";
import { TitleBar } from "./popup-view/TitleBar";
import { EmptyState } from "./popup-view/EmptyState";
import { UpcomingResetCardSlot } from "./popup-view/UpcomingResetCardSlot";
import { NetBanner } from "./popup-view/NetBanner";
import { SkeletonCard } from "./popup-view/SkeletonCard";
import {
    MODULE,
    log,
    should_log_raw,
    token_panel_enabled,
    popup_mirror_style,
    errorMessage,
    structural_signature,
    arrays_equal,
    account_orders_equal,
    record_bool_equal,
} from "./popup-view/lib";

export { record_bool_equal } from "./popup-view/lib";

// t196 f003: refresh-all spinner 动作的伪 provider 键（与 provider 刷新共用
// refresh_actions_ref / refresh_fired_at_ref 两表）。
const ALL_REFRESH_KEY = "__refresh_all__";

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
    const synced_order_ref = useRef<string[]>([]);
    const [account_orders, set_account_orders] = useState<Record<string, string[]>>({});
    const synced_account_orders_ref = useRef<Record<string, string[]>>({});
    // Last values adopted from config for the collapse/expand persist effect.
    // Synced inside apply_config so a config broadcast is never mistaken for
    // a user toggle and re-saved (t153).
    const prev_collapsed_ref = useRef<Record<string, boolean>>({});
    const prev_expanded_ref = useRef<Record<string, boolean>>({});
    // Structural signature of config.plugins from the last applied config;
    // reload() only runs when it changes (t153).
    const last_plugins_sig_ref = useRef<string | null>(null);
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
            last_plugins_sig_ref.current = plugins_structure_signature(config.plugins);
            const order = config.providerOrder;
            if (order && order.length > 0) {
                // 自定义 provider（t095）不在内置白名单内；信任 config 持久化的顺序，
                // 残留无效 provider 由 config-store prune 兜底。
                const validated = [...order];
                if (validated.length > 0) {
                    // t153：同步 ref，配置回显不再被误当作用户拖拽而回写。
                    synced_order_ref.current = validated;
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
            const next_collapsed = config.collapsedAccounts;
            if (next_collapsed) {
                // t153：同步 ref + 值相等时保留 state 引用，广播回显不触发 persist。
                prev_collapsed_ref.current = next_collapsed;
                set_collapsed_accounts((current) =>
                    record_bool_equal(current, next_collapsed) ? current : next_collapsed,
                );
            }
            const next_expanded = config.expandedProviders;
            if (next_expanded) {
                prev_expanded_ref.current = next_expanded;
                set_expanded_providers((current) =>
                    record_bool_equal(current, next_expanded) ? current : next_expanded,
                );
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

    // t195 AC4: UI 偏好切换本地已乐观生效（setter 立即更新 state），此处只负责
    // 持久化——防抖合并多次 patch 成一次 config.save，不等响应更新界面。
    const config_patcher_ref = useRef<ReturnType<typeof create_debounced_config_patcher> | null>(
        null,
    );
    config_patcher_ref.current ??= create_debounced_config_patcher({
        get: () => window.usageboard.config.get(),
        save: (config) => window.usageboard.config.save(config),
        on_error: (err) => {
            window.usageboard.log({
                level: "error",
                module: "PopupView",
                message: `config persistence failed: ${err instanceof Error ? err.message : String(err)}`,
            });
        },
    });
    useEffect(() => {
        return () => config_patcher_ref.current?.dispose();
    }, []);

    const patchConfig = useCallback((patch: Partial<AppConfiguration>) => {
        config_patcher_ref.current?.patch(patch);
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
            const prev_sig = last_plugins_sig_ref.current;
            apply_config(config);
            // t153: UI-level saves (order/collapse) dominate config broadcasts;
            // only a structural plugin change warrants a connector:list reload.
            if (last_plugins_sig_ref.current !== prev_sig) {
                void reload();
            }
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
    useEffect(() => {
        const prev_c = prev_collapsed_ref.current;
        const prev_e = prev_expanded_ref.current;
        if (
            record_bool_equal(prev_c, collapsed_accounts) &&
            record_bool_equal(prev_e, expanded_providers)
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
    // t196 AC3: cached all-collapsed minimum height, re-measured on structural
    // change by briefly forcing the single mirror into the collapsed state.
    const collapsed_min_ref = useRef(0);
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
    // t041：阈值非空时才挂载即将重置卡片。
    const show_upcoming = upcoming_reset_threshold_percent != null;
    const overview_card_order = useMemo(() => {
        const visible_card_ids = show_upcoming
            ? [...orderedProviders, UPCOMING_RESET_CARD_ID]
            : orderedProviders;
        return build_reorder_base(provider_order, visible_card_ids);
    }, [orderedProviders, provider_order, show_upcoming]);
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
        const live_providers = new Set([
            ...providerGroups.map((group) => group.provider),
            // Keep __upcoming_reset__ so structural pruning doesn't drop its
            // expansion state; it's not a real provider but shares the same
            // persistence key (T105).
            UPCOMING_RESET_CARD_ID,
        ]);
        set_expanded_providers((prev_e) => {
            const next: Record<string, boolean> = {};
            for (const [p, v] of Object.entries(prev_e)) {
                if (live_providers.has(p)) next[p] = v;
            }
            return next;
        });
    }, [signature, providerGroups]);

    // t196 AC3: single mirror only. `collapsed_min_height` (the height with
    // every collapsible card collapsed) is cached and re-measured only when
    // the structure or active tab changes — the two things that alter it.
    // Re-measuring briefly forces the mirror into the all-collapsed state and
    // reads its height before restoring, so the browser never paints it.
    const [mirror_collapse_all, set_mirror_collapse_all] = useState(false);
    const measured_key_ref = useRef<string | null>(null);

    const measure_key = signature + "|" + activeTab;
    useLayoutEffect(() => {
        if (measured_key_ref.current === measure_key) return;
        measured_key_ref.current = measure_key;
        set_mirror_collapse_all(true);
    }, [measure_key]);

    useLayoutEffect(() => {
        if (!mirror_collapse_all) return;
        const el = content_mirror_ref.current;
        if (el) collapsed_min_ref.current = el.offsetHeight;
        set_mirror_collapse_all(false);
    }, [mirror_collapse_all, content_mirror_ref]);

    use_popup_height_report(content_mirror_ref, collapsed_min_ref, mirror_collapse_all);

    const goToSettings = () => {
        window.usageboard.settings.open();
    };

    const MIN_SPINNER_MS = 500;
    const SPINNER_SAFETY_MS = 60_000;
    // t196 f003: spinner 绑定刷新后新出现的 loading（排除点击前已 loading 的实例，
    // 如定时采集占位，避免永久 loading 钉死全局 spinner），慢采集期间保持进行中指示。
    // 500ms 下限防闪烁，超时安全兜底防卡死。
    const refresh_actions_ref = useRef<
        Map<string, { instances: Set<string>; pre_loading: Set<string> }>
    >(new Map());
    const refresh_fired_at_ref = useRef<Map<string, number>>(new Map());
    const plugins_ref = useRef(plugins);
    plugins_ref.current = plugins;

    const handleRefreshAll = () => {
        if (refreshing) return;
        const targets = plugins.filter((c) => c.enabled);
        refresh_actions_ref.current.set(ALL_REFRESH_KEY, {
            instances: new Set(targets.map((c) => c.instanceId)),
            pre_loading: new Set(
                targets.filter((c) => c.snapshot.status === "loading").map((c) => c.instanceId),
            ),
        });
        refresh_fired_at_ref.current.set(ALL_REFRESH_KEY, Date.now());
        setRefreshing(true);
        void refreshAll().catch((err: unknown) => {
            window.usageboard.log({
                level: "error",
                module: MODULE,
                message: `刷新全部失败: ${errorMessage(err)}`,
            });
        });
    };

    const refreshProvider = (provider: string) => {
        if (refreshing_providers.has(provider)) return;

        const connectors = plugins.filter(
            (connector) => connector.enabled && connector.activeProviders.includes(provider),
        );

        refresh_actions_ref.current.set(provider, {
            instances: new Set(connectors.map((c) => c.instanceId)),
            pre_loading: new Set(
                connectors.filter((c) => c.snapshot.status === "loading").map((c) => c.instanceId),
            ),
        });
        refresh_fired_at_ref.current.set(provider, Date.now());
        set_refreshing_providers((prev) => new Set(prev).add(provider));

        void Promise.all(
            connectors.map((connector) =>
                window.usageboard.connector.refresh(connector.sourceInstanceId),
            ),
        ).catch((err: unknown) => {
            window.usageboard.log({
                level: "error",
                module: MODULE,
                message: `刷新 ${provider} 失败: ${errorMessage(err)}`,
            });
        });
    };

    // t196 f003: spinner 绑定真实 pending——按快照 loading 状态清除（而非固定 500ms
    // 后结束），慢采集期间保持进行中指示；保留 500ms 下限防闪烁，超时安全兜底防卡死。
    useEffect(() => {
        const action_done = (action_id: string): boolean => {
            const action = refresh_actions_ref.current.get(action_id);
            if (action === undefined) return true;
            const fired_at = refresh_fired_at_ref.current.get(action_id) ?? 0;
            const elapsed = Date.now() - fired_at;
            if (elapsed > SPINNER_SAFETY_MS) return true;
            const snapshots = new Map(plugins_ref.current.map((c) => [c.instanceId, c.snapshot]));
            const any_new_loading = [...action.instances].some(
                (id) => snapshots.get(id)?.status === "loading" && !action.pre_loading.has(id),
            );
            return !any_new_loading && elapsed >= MIN_SPINNER_MS;
        };
        const clear_action = (action_id: string): void => {
            refresh_fired_at_ref.current.delete(action_id);
            refresh_actions_ref.current.delete(action_id);
        };

        let changed = false;
        const next_providers = new Set(refreshing_providers);
        for (const provider of refreshing_providers) {
            if (action_done(provider)) {
                clear_action(provider);
                next_providers.delete(provider);
                changed = true;
            }
        }
        if (changed) set_refreshing_providers(next_providers);

        if (refreshing && action_done(ALL_REFRESH_KEY)) {
            clear_action(ALL_REFRESH_KEY);
            setRefreshing(false);
        }

        // 500ms 下限兜底：快速完成且无后续状态变化时清除残留 spinner。
        // 自排程周期求值：loading 挂起（无后续状态推送）时也会周期性重判，
        // 使 SPINNER_SAFETY_MS 兜底真正按时间驱动（f005）。
        let timer: ReturnType<typeof setTimeout> | undefined;
        const check = (): void => {
            set_refreshing_providers((prev) => {
                let c = false;
                const next = new Set(prev);
                for (const provider of prev) {
                    if (action_done(provider)) {
                        clear_action(provider);
                        next.delete(provider);
                        c = true;
                    }
                }
                return c ? next : prev;
            });
            setRefreshing((prev) => {
                if (!prev) return prev;
                if (action_done(ALL_REFRESH_KEY)) {
                    clear_action(ALL_REFRESH_KEY);
                    return false;
                }
                return prev;
            });
            if (refreshing_providers.size > 0 || refreshing) {
                timer = setTimeout(check, MIN_SPINNER_MS);
            }
        };
        timer = setTimeout(check, MIN_SPINNER_MS);

        return () => {
            if (timer !== undefined) clearTimeout(timer);
        };
    }, [refreshing, refreshing_providers, plugins]);

    const toggle_account = (id: string) => {
        set_collapsed_accounts((prev) => ({ ...prev, [id]: !(prev[id] ?? false) }));
    };

    const toggle_expand_provider = (provider: string) => {
        set_expanded_providers((prev) => ({ ...prev, [provider]: !(prev[provider] ?? false) }));
    };

    // t158: re-login handler takes a specific instanceId so multi-instance 401
    // (e.g. two GroK accounts) opens the failing account's edit dialog — not
    // the first connector with that provider. Per-row re-login in
    // ProviderAccountRow is the primary entry; this is the overview-banner
    // fallback that routes the first failed instance for the provider.
    const handle_re_login = (provider: string, instanceId: string) => {
        if (instanceId) {
            window.usageboard.settings.open({ instanceId });
            return;
        }
        // Defensive fallback: caller didn't supply a specific instance.
        // Defer to the legacy provider-level match so we never silently
        // swallow the click. (No connector-found → still no-op.)
        const connector = plugins.find((c) => c.enabled && c.activeProviders.includes(provider));
        if (connector) {
            window.usageboard.settings.open({ instanceId: connector.instanceId });
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
        // overview_card_order contains provider ids plus the upcoming-reset
        // pseudo-card id, so reordering preserves the special card.
        orderedProviders: overview_card_order,
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

    // Set of provider ids currently refreshing; passed to the provider card for
    // spin-state. Computed before render_body so the function is declared before
    // use.
    const refresh_providers = useMemo(() => new Set(refreshing_providers), [refreshing_providers]);

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
                <TitleBar
                    footerTime={footerTime}
                    refreshing={refreshing}
                    is_live={is_live}
                    titlebar_class={titlebar_class}
                    onRefreshAll={handleRefreshAll}
                    onOpenSettings={goToSettings}
                    is_floating={main_panel_mode === "floating"}
                    onHidePanel={() => {
                        window.usageboard.main_panel.hide();
                    }}
                    onOpenHistory={() => {
                        // 纯跳转入口：无具体会话，开/聚焦空窗。
                        void window.usageboard.sessionHistory.open("", "", "");
                    }}
                />

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
                        {error && <NetBanner is_live={is_live} onRefreshAll={handleRefreshAll} />}

                        {loading && plugins.length === 0 && <SkeletonCard />}

                        {!loading && plugins.length === 0 && !error && (
                            <EmptyState is_live={is_live} onAddService={goToSettings} />
                        )}

                        {!loading && plugins.length > 0 && activeTab === "overview" && (
                            <ProviderOverview
                                groups={providerGroups}
                                visibleProviders={orderedProviders}
                                overviewCardOrder={overview_card_order}
                                renderExtraCard={(card_id) => {
                                    if (card_id !== UPCOMING_RESET_CARD_ID) {
                                        return null;
                                    }
                                    return (
                                        <UpcomingResetCardSlot
                                            key={UPCOMING_RESET_CARD_ID}
                                            is_live={is_live}
                                            force_collapse={force_collapse}
                                            upcomingItems={upcomingItems}
                                            desensitizeRemarks={ui_desensitize_remarks}
                                            expanded={
                                                expanded_providers[UPCOMING_RESET_CARD_ID] ?? false
                                            }
                                            drag_id={drag_id}
                                            over_id={over_id}
                                            onSelectProvider={select_provider_from_upcoming}
                                            onToggleExpand={() => {
                                                toggle_expand_provider(UPCOMING_RESET_CARD_ID);
                                            }}
                                            onDragStart={(rect) => {
                                                handle_drag_start(UPCOMING_RESET_CARD_ID, rect);
                                            }}
                                            onDragEnter={() => {
                                                handle_drag_enter(UPCOMING_RESET_CARD_ID);
                                            }}
                                            onDragOver={(clientX, clientY, rect) => {
                                                handle_drag_over(
                                                    UPCOMING_RESET_CARD_ID,
                                                    clientX,
                                                    clientY,
                                                    rect,
                                                );
                                            }}
                                            onDragEnd={handle_drag_end}
                                        />
                                    );
                                }}
                                providerErrors={providerErrors}
                                onRefreshProvider={is_live ? refreshProvider : () => undefined}
                                expandedProviders={is_live ? expanded_providers : undefined}
                                onToggleExpandProvider={
                                    is_live ? toggle_expand_provider : undefined
                                }
                                onReLogin={
                                    is_live
                                        ? (p, instanceId) => {
                                              handle_re_login(p, instanceId);
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
                                            ? (sourceInstanceId, _accountId, p: string) => {
                                                  // t158: row-level re-login — drive settings.open by
                                                  // the connector's sourceInstanceId (composite keys
                                                  // like `${sourceInstanceId}|${accountId}` aren't
                                                  // settings targets; only the connector's own
                                                  // instanceId is).
                                                  handle_re_login(p, sourceInstanceId);
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
                                collapsed={is_live ? token_panel_collapsed : false}
                                collapsible={is_live}
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

    const should_render_mirrors = typeof ResizeObserver !== "undefined";

    return (
        <>
            <div className="window" data-popup="live">
                {render_body(true, false)}
            </div>
            {should_render_mirrors && (
                <>
                    {/* t196 AC3: single offscreen mirror used to measure the
                        popup height for the main process. It mirrors the live
                        tree with the user's current collapse state and uses
                        `height: auto` so it reports the desired height, not the
                        clamped viewport. `data-measuring` marks the transient
                        all-collapsed pass that caches `collapsed_min_height`.
                        Mirrors must not bind live refs or interactive handlers. */}
                    <div
                        ref={content_mirror_ref}
                        className="window popup-mirror"
                        aria-hidden="true"
                        inert
                        data-measuring={mirror_collapse_all ? "true" : "false"}
                        style={popup_mirror_style}
                    >
                        {render_body(false, mirror_collapse_all)}
                    </div>
                </>
            )}
        </>
    );
}
