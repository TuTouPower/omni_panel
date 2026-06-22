import { useState, useRef, useEffect, useMemo, useCallback, type CSSProperties } from "react";
import type { UsageProvider } from "../../shared/schemas/plugin-output";
import { use_plugins } from "../hooks/use-plugins";
import { use_popup_height_report } from "../hooks/use-popup-height-report";
import { useNowTick } from "../hooks/use-now-tick";
import { useTheme } from "../lib/theme";
import { Icon } from "../components/Icon";
import { ProviderAccountList } from "../components/ProviderAccountList";
import { ProviderNav } from "../components/ProviderNav";
import { ProviderOverview } from "../components/ProviderOverview";
import { TokenPanel } from "../components/TokenPanel";
import { CollapsibleCard } from "../components/CollapsibleCard";
import {
    build_provider_usage_groups,
    get_visible_providers,
    apply_account_overrides,
    PROVIDER_ORDER,
} from "../lib/provider-usage";
import { VENDOR_AUTH_MAP } from "../components/AddAccountDialog";
import type { ProviderUsageAccount } from "../lib/provider-usage";
import type {
    AccountOverrides,
    AppConfiguration,
    UsageBarColorScheme,
    UsageBarStyle,
} from "../../shared/types/config";
import { relative_time } from "../lib/utils";
import { add_account_override } from "../lib/account-overrides";
import { compute_drag_reorder, build_reorder_base } from "../lib/drag-reorder";
import logo from "../assets/logo.png";
import { createLogger } from "../../shared/lib/logger";
import { redact_config_raw } from "../../shared/lib/config_redaction";

const MODULE = "PopupView";
const log = createLogger("renderer:popup-view");
const should_log_raw = import.meta.env.DEV;
const token_panel_enabled = import.meta.env["VITE_ENABLE_TOKEN_PANEL"] === "1";

/** Auth-related error patterns for credential failure detection. */
const AUTH_ERROR_PATTERNS = [
    "401",
    "403",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "INVALID_TOKEN",
    "EXPIRED_TOKEN",
];
const AUTH_WORD_RE = /\bAUTH\b/u;

type StatusBarDot = "green" | "red" | "amber";

interface StatusBarState {
    dot: StatusBarDot;
    label: string;
}

/**
 * Determine status bar state with priority:
 * 未配置 > 凭证失效 > 网络异常 > 接近限制 > 数据正常
 */
function derive_status_bar(
    plugins: ReturnType<typeof use_plugins>["plugins"],
    global_error: unknown,
): StatusBarState {
    if (plugins.length === 0) {
        return { dot: "amber", label: "尚未配置" };
    }

    // Check for credential failures (401/403/AUTH in error messages)
    let has_session_auth_error = false;
    for (const p of plugins) {
        if (p.snapshot.status !== "failed") continue;
        const err_upper = p.snapshot.error.toUpperCase();
        if (
            AUTH_ERROR_PATTERNS.some((pat) => err_upper.includes(pat)) ||
            AUTH_WORD_RE.test(err_upper)
        ) {
            for (const prov of p.activeProviders) {
                if (VENDOR_AUTH_MAP[prov] === "session") {
                    has_session_auth_error = true;
                }
            }
            return {
                dot: "amber",
                label: has_session_auth_error ? "登录失效" : "凭证失效",
            };
        }
    }

    // Network / other errors
    if (global_error || plugins.some((p) => p.snapshot.status === "failed")) {
        return { dot: "red", label: "网络异常" };
    }

    // Check for warning/critical usage items
    for (const p of plugins) {
        if (p.snapshot.status !== "ready") continue;
        for (const item of p.snapshot.items) {
            if (item.status === "warning" || item.status === "critical") {
                return { dot: "amber", label: "接近限制" };
            }
        }
    }

    return { dot: "green", label: "数据正常" };
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function structural_signature(groups: ReturnType<typeof build_provider_usage_groups>): string {
    return groups.map((g) => g.provider + ":" + g.accounts.map((a) => a.id).join(",")).join("|");
}

function arrays_equal<T>(left: readonly T[] | undefined, right: readonly T[]): boolean {
    return left?.length === right.length && left.every((value, index) => value === right[index]);
}

export function PopupView() {
    useTheme();
    useNowTick();
    const { plugins, loading, error, refreshAll, reload } = use_plugins();
    const [refreshing, setRefreshing] = useState(false);
    const [refreshing_providers, set_refreshing_providers] = useState<Set<UsageProvider>>(
        new Set(),
    );
    const [activeTab, setActiveTab] = useState<UsageProvider | "overview">("overview");
    const [collapsed_accounts, set_collapsed_accounts] = useState<Record<string, boolean>>({});
    const [expanded_providers, set_expanded_providers] = useState<Record<string, boolean>>({});
    const [provider_order, set_provider_order] = useState<UsageProvider[]>([]);
    const save_queue_ref = useRef(Promise.resolve());
    const synced_order_ref = useRef<UsageProvider[]>([]);
    const [drag_id, set_drag_id] = useState<UsageProvider | null>(null);
    const [over_id, set_over_id] = useState<UsageProvider | null>(null);
    const [account_drag_id, set_account_drag_id] = useState<string | null>(null);
    const [account_over_id, set_account_over_id] = useState<string | null>(null);
    const [account_orders, set_account_orders] = useState<Record<string, string[]>>({});
    const [token_panel_collapsed, set_token_panel_collapsed] = useState(false);
    const [main_panel_mode, set_main_panel_mode] = useState<"popup" | "floating">("popup");
    const [usage_bar_color_scheme, set_usage_bar_color_scheme] =
        useState<UsageBarColorScheme>("risk-current");
    const [usage_bar_style, set_usage_bar_style] = useState<UsageBarStyle>("thin");
    const [account_overrides, set_account_overrides] = useState<AccountOverrides | undefined>(
        undefined,
    );
    const [account_label_maps, set_account_label_maps] = useState<
        Readonly<Record<string, Readonly<Record<string, string>>>> | undefined
    >(undefined);
    const [provider_label_maps, set_provider_label_maps] = useState<
        Readonly<Partial<Record<UsageProvider, Readonly<Record<string, string>>>>> | undefined
    >(undefined);
    const [account_action_error, set_account_action_error] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        window.usageboard.main_panel
            .get_mode()
            .then((mode) => {
                if (!cancelled) set_main_panel_mode(mode);
            })
            .catch(() => {
                if (!cancelled) set_main_panel_mode("popup");
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const valid_providers = useMemo(() => new Set(PROVIDER_ORDER as readonly string[]), []);

    const apply_config = useCallback(
        (config: AppConfiguration) => {
            const order = config.providerOrder;
            if (order && order.length > 0) {
                const validated = order.filter((p): p is UsageProvider => valid_providers.has(p));
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
            set_account_label_maps(config.accountLabelMaps);
            set_provider_label_maps(config.providerLabelMaps);
            set_account_overrides(config.accountOverrides);
            if (config.collapsedAccounts) {
                set_collapsed_accounts(config.collapsedAccounts);
            }
            if (config.expandedProviders) {
                set_expanded_providers(config.expandedProviders);
            }
        },
        [valid_providers],
    );

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
            .catch(() => {
                // ignore load errors
            });
    }, [apply_config]);

    useEffect(() => {
        return window.usageboard.event.onConfigChange?.((config) => {
            apply_config(config);
            if (config.providerOrder && config.providerOrder.length > 0) {
                synced_order_ref.current = config.providerOrder.filter((p): p is UsageProvider =>
                    valid_providers.has(p),
                );
            }
            void reload();
        });
    }, [apply_config, reload, valid_providers]);

    // Persist provider order to config when user reorders (not from external config sync)
    useEffect(() => {
        if (provider_order.length === 0) return;
        const prev = synced_order_ref.current;
        if (prev.length === provider_order.length && prev.every((v, i) => v === provider_order[i]))
            return;
        synced_order_ref.current = provider_order;
        save_queue_ref.current = save_queue_ref.current
            .then(async () => {
                const result = await window.usageboard.config.get();
                await window.usageboard.config.save({
                    ...result.config,
                    providerOrder: provider_order,
                });
            })
            .catch(() => {
                // ignore save errors
            });
    }, [provider_order]);

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
        save_queue_ref.current = save_queue_ref.current
            .then(async () => {
                const result = await window.usageboard.config.get();
                await window.usageboard.config.save({
                    ...result.config,
                    collapsedAccounts: collapsed_accounts,
                    expandedProviders: expanded_providers,
                });
            })
            .catch(() => {
                // ignore save errors
            });
    }, [collapsed_accounts, expanded_providers]);

    const tabsRef = useRef<HTMLDivElement>(null);
    const wheel_at_ref = useRef(0);
    const content_mirror_ref = useRef<HTMLDivElement | null>(null);
    const collapsed_mirror_ref = useRef<HTMLDivElement | null>(null);

    const rawGroups = useMemo(() => build_provider_usage_groups(plugins), [plugins]);
    const providerGroups = useMemo(
        () => apply_account_overrides(rawGroups, account_overrides),
        [rawGroups, account_overrides],
    );
    const visibleProviders = useMemo(() => get_visible_providers(plugins), [plugins]);

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

    const activeGroup =
        activeTab === "overview"
            ? undefined
            : providerGroups.find((group) => group.provider === activeTab);

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
                if (live_providers.has(p as UsageProvider)) next[p] = v;
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

    const refreshProvider = (provider: UsageProvider) => {
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

    const toggle_expand_provider = (provider: UsageProvider) => {
        set_expanded_providers((prev) => ({ ...prev, [provider]: !(prev[provider] ?? false) }));
    };

    const toggle_disable_provider = (provider: UsageProvider) => {
        save_queue_ref.current = save_queue_ref.current
            .then(async () => {
                const result = await window.usageboard.config.get();
                const related_plugins = result.config.plugins.filter((p) => {
                    const info = plugins.find((pi) => pi.instanceId === p.instanceId);
                    return info?.activeProviders.includes(provider) ?? false;
                });
                if (related_plugins.length === 0) return;

                const updated_plugins = result.config.plugins.map((p) => {
                    if (!related_plugins.some((rp) => rp.instanceId === p.instanceId)) {
                        return p;
                    }
                    const info = plugins.find((pi) => pi.instanceId === p.instanceId);
                    // CPA connector: toggle monitor param per provider, don't disable entire connector
                    if (info?.source === "gateway") {
                        const monitor_key = `monitor_${provider}`;
                        const current_val = p.parameterValues[monitor_key];
                        const is_off = String(current_val) === "false";
                        return {
                            ...p,
                            parameterValues: {
                                ...p.parameterValues,
                                [monitor_key]: is_off ? "true" : "false",
                            },
                        };
                    }
                    // Direct plugin: toggle plugin.enabled
                    return { ...p, enabled: !p.enabled };
                });

                await window.usageboard.config.save({
                    ...result.config,
                    plugins: updated_plugins,
                });
            })
            .catch((err: unknown) => {
                window.usageboard.log({
                    level: "error",
                    module: MODULE,
                    message: `toggle provider failed: ${errorMessage(err)}`,
                });
            });
    };

    const handle_re_login = async (provider: UsageProvider) => {
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

    const edit_account = (account: ProviderUsageAccount) => {
        const first_period = account.periods[0];
        if (!first_period) return;
        window.usageboard.settings.open({
            instanceId: account.sourceInstanceId,
            provider: first_period.provider,
            accountId: account.id,
        });
        window.usageboard.log({
            level: "info",
            module: MODULE,
            message: `编辑账号: ${account.id}`,
        });
    };

    const disable_account = (account: ProviderUsageAccount) => {
        const first_period = account.periods[0];
        if (!first_period) return;
        const provider = first_period.provider;

        void (async () => {
            set_account_action_error(null);
            try {
                const result = await window.usageboard.config.get();
                const new_overrides = add_account_override(
                    result.config.accountOverrides,
                    "disabled",
                    provider,
                    account.id,
                );
                await window.usageboard.config.save({
                    ...result.config,
                    accountOverrides: new_overrides,
                });
                set_account_overrides(new_overrides);
                window.usageboard.log({
                    level: "info",
                    module: MODULE,
                    message: `关闭账号监控: ${provider}`,
                });
            } catch (err: unknown) {
                set_account_action_error("保存账号操作失败");
                window.usageboard.log({
                    level: "error",
                    module: MODULE,
                    message: `关闭账号监控失败: ${errorMessage(err)}`,
                });
            }
        })();
    };

    // Drag-and-drop handlers for provider card reordering
    const handle_drag_start = (provider: UsageProvider) => {
        set_drag_id(provider);
    };

    const handle_drag_enter = (provider: UsageProvider) => {
        if (!drag_id || drag_id === provider) return;
        set_over_id(provider);
    };

    // Reorder uses a direction-aware midpoint guard (see compute_drag_reorder)
    // to avoid swap-back flicker when a short card is dragged across a tall
    // (expanded) card. Fires on dragOver so the move commits as the pointer
    // crosses the midpoint, not merely on entry.
    const handle_drag_over = (provider: UsageProvider, clientY: number, rect: DOMRect) => {
        if (!drag_id || drag_id === provider) return;
        set_over_id(provider);
        set_provider_order((prev) => {
            const base = build_reorder_base(prev, orderedProviders);
            const next = compute_drag_reorder(base, drag_id, provider, {
                pointer_y: clientY,
                rect_top: rect.top,
                rect_height: rect.height,
            });
            return next ?? prev;
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

    // wheel over the tab strip steps the selection one tab at a time (wraps around)
    useEffect(() => {
        const el = tabsRef.current;
        if (!el) return;
        const on_wheel = (e: WheelEvent) => {
            const d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
            if (!d) return;
            e.preventDefault();
            const now = Date.now();
            if (now - wheel_at_ref.current < 200) return;
            wheel_at_ref.current = now;
            const dir = d > 0 ? 1 : -1;
            setActiveTab((cur) => {
                const tab_order: (UsageProvider | "overview")[] = ["overview", ...orderedProviders];
                const i = tab_order.indexOf(cur);
                const n = tab_order.length;
                if (n === 0) return cur;
                const ni = (((i + dir) % n) + n) % n;
                return tab_order[ni] ?? cur;
            });
        };
        el.addEventListener("wheel", on_wheel, { passive: false });
        return () => {
            el.removeEventListener("wheel", on_wheel);
        };
    }, [orderedProviders]);

    const statusBar = useMemo(() => derive_status_bar(plugins, error), [plugins, error]);
    const statusDot = statusBar.dot;
    const statusLabel = statusBar.label;
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
                        {is_live && main_panel_mode === "floating" && (
                            <button
                                className="icon-btn floating-close-btn"
                                title="隐藏到托盘"
                                aria-label="隐藏主面板"
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
                <div className="scroll">
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

                        {account_action_error && (
                            <div className="net-banner" role="alert">
                                <Icon name="cloud_off" size={18} />
                                <span>{account_action_error}</span>
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
                                onToggleExpandProvider={
                                    is_live ? toggle_expand_provider : undefined
                                }
                                onToggleDisableProvider={
                                    is_live ? toggle_disable_provider : undefined
                                }
                                onEditAccount={is_live ? edit_account : undefined}
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
                                    onEditAccount={is_live ? edit_account : undefined}
                                    onReLogin={
                                        is_live
                                            ? (p: UsageProvider) => {
                                                  void handle_re_login(p);
                                              }
                                            : undefined
                                    }
                                    onDisableAccount={is_live ? disable_account : undefined}
                                    barColorScheme={usage_bar_color_scheme}
                                    barStyle={usage_bar_style}
                                    accountLabelMaps={account_label_maps}
                                    providerLabelMaps={provider_label_maps}
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
