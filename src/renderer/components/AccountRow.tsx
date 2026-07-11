import { Icon, VendorMark, type VendorId } from "./Icon";
import { PROVIDER_LABELS } from "../lib/provider-usage";

interface AccountRowProps {
    mode: "direct" | "cpa-source" | "cpa-child";
    provider: VendorId;
    account_label: string;
    enabled: boolean;
    status: "ok" | "error" | "auth" | "disabled" | "unknown";
    is_hidden?: boolean;
    is_removed?: boolean;
    on_toggle?: () => void;
    on_refresh?: () => void;
    on_edit?: () => void;
    on_delete?: () => void;
    on_hide?: () => void;
    on_unhide?: () => void;
    on_clear?: () => void;
    on_rename?: () => void;
    show_vendor?: boolean;
}

const STATUS_DOT_COLOR: Record<string, string> = {
    ok: "var(--green)",
    error: "var(--risk-red)",
    auth: "var(--risk-orange)",
    disabled: "var(--text-3)",
    unknown: "var(--text-3)",
};

const STATUS_TEXT: Partial<Record<string, string>> = {
    error: "采集失败",
    auth: "凭证失效",
};

function get_status_dot(
    status: string,
    enabled: boolean,
    is_hidden: boolean,
    is_removed: boolean,
): string {
    if (is_removed) return "var(--risk-orange)";
    if (is_hidden) return "var(--text-3)";
    if (!enabled && status !== "error" && status !== "auth") return "var(--text-3)";
    return STATUS_DOT_COLOR[status] ?? STATUS_DOT_COLOR["unknown"] ?? "var(--text-3)";
}

function get_status_text(
    status: string,
    enabled: boolean,
    is_hidden: boolean,
    is_removed: boolean,
): string | null {
    if (is_removed) return "来源已移除";
    if (is_hidden) return "已关闭";
    if (!enabled) return null;
    return STATUS_TEXT[status] ?? null;
}

function get_vendor_name(provider: VendorId): string {
    if (provider === "cpa") return "CPA Manager";
    if (provider === "overview") return "总览";
    return provider in PROVIDER_LABELS ? PROVIDER_LABELS[provider] : provider;
}

export function AccountRow({
    mode,
    provider,
    account_label,
    enabled,
    status,
    is_hidden = false,
    is_removed = false,
    on_toggle,
    on_refresh,
    on_edit,
    on_delete,
    on_hide,
    on_unhide,
    on_clear,
    on_rename,
    show_vendor = true,
}: AccountRowProps) {
    const is_cpa_child = mode === "cpa-child";
    const effective_on = is_cpa_child ? !is_hidden && !is_removed : enabled;
    const dot = get_status_dot(status, enabled, is_hidden, is_removed);
    const status_text = get_status_text(status, enabled, is_hidden, is_removed);
    const severity_class = is_removed
        ? ""
        : status === "error"
          ? " err"
          : status === "auth"
            ? " warn"
            : "";

    const row_class =
        "acc-row" +
        (effective_on ? "" : " off") +
        (is_cpa_child && is_hidden ? " hidden" : "") +
        (is_removed ? " removed" : "") +
        (mode === "cpa-source" ? " ds-row" : "");

    return (
        <div className={row_class}>
            {show_vendor && (
                <span className="ar-vendor-col">
                    <VendorMark id={provider} size={24} />
                    <span className="ar-vendor">{get_vendor_name(provider)}</span>
                </span>
            )}
            <div className="ar-acct-col">
                <span className="ar-dot" style={{ background: dot }} />
                <span className="ar-note">{account_label}</span>
                {status_text && <span className={"ar-stat" + severity_class}>{status_text}</span>}
            </div>
            <div className="ar-actions">
                {is_cpa_child ? (
                    is_removed ? (
                        <button
                            className="sub-clear"
                            title="清除该来源已移除的账号"
                            onClick={on_clear}
                        >
                            清除
                        </button>
                    ) : (
                        <>
                            <button className="sp-ic" title="改备注名" onClick={on_rename}>
                                <Icon name="edit" size={15} />
                            </button>
                            <button
                                className="sw"
                                data-on={effective_on ? "1" : "0"}
                                onClick={is_hidden ? on_unhide : on_hide}
                            >
                                <i />
                            </button>
                        </>
                    )
                ) : (
                    <>
                        <button className="sw" data-on={enabled ? "1" : "0"} onClick={on_toggle}>
                            <i />
                        </button>
                        <button className="sp-ic" title="刷新" onClick={on_refresh}>
                            <Icon name="refresh" size={15} />
                        </button>
                        <button className="sp-ic" title="编辑" onClick={on_edit}>
                            <Icon name="edit" size={15} />
                        </button>
                        <button className="sp-ic danger" title="删除账号" onClick={on_delete}>
                            <Icon name="trash" size={15} />
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
