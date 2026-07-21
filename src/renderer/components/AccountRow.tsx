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
    /** t041: upcoming-reset monitoring is OFF for this account. */
    upcoming_reset_off?: boolean | undefined;
    /** t041: toggle upcoming-reset monitoring. */
    on_toggle_upcoming?: (() => void) | undefined;
    desensitizeRemarks?: boolean | undefined;
}

interface AccountStatus {
    color: string;
    text: string;
    severity_class: string;
}

function get_account_status(status: AccountRowProps["status"], enabled: boolean): AccountStatus {
    if (!enabled || status === "disabled") {
        return { color: "var(--text-3)", text: "已关闭", severity_class: "" };
    }
    if (status === "error") {
        return { color: "var(--risk-red)", text: "采集失败", severity_class: " err" };
    }
    if (status === "auth") {
        return { color: "var(--risk-red)", text: "凭证失效", severity_class: " err" };
    }
    return { color: "var(--green)", text: "正常", severity_class: "" };
}

function get_vendor_name(provider: VendorId): string {
    if (provider === "cpa") return "CPA";
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
    upcoming_reset_off = false,
    on_toggle_upcoming,
    desensitizeRemarks = false,
}: AccountRowProps) {
    const is_cpa_child = mode === "cpa-child";
    const effective_on = is_cpa_child ? !is_hidden && !is_removed : enabled;
    const account_status = get_account_status(status, enabled);
    const note_label = desensitizeRemarks ? "" : account_label;

    const row_class =
        "acc-row" +
        (effective_on ? "" : " off") +
        (is_cpa_child && is_hidden ? " hidden" : "") +
        (is_removed ? " removed" : "") +
        (mode === "cpa-source" ? " ds-row" : "");

    return (
        <div className={row_class}>
            <VendorMark id={provider} size={24} />
            <span className="ar-id">
                <span className="ar-vendor">{get_vendor_name(provider)}</span>
                {note_label && <span className="ar-note">· {note_label}</span>}
                {is_cpa_child && is_removed && <span className="ar-removed">来源已移除</span>}
            </span>
            {!is_cpa_child && (
                <span className="ar-status">
                    <span className="ar-dot" style={{ background: account_status.color }} />
                    <span className={"ar-stat" + account_status.severity_class}>
                        {account_status.text}
                    </span>
                </span>
            )}
            <div className="ar-actions">
                {on_toggle_upcoming && (
                    <button
                        className="sp-ic"
                        title="是否监控即将重置"
                        aria-label="是否监控即将重置"
                        aria-pressed={!upcoming_reset_off}
                        onClick={on_toggle_upcoming}
                    >
                        <Icon
                            name="bell"
                            size={15}
                            style={{ opacity: upcoming_reset_off ? 0.35 : 1 }}
                        />
                    </button>
                )}
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
                            <button className="sp-ic" title="改备注" onClick={on_rename}>
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
