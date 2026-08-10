import { Button } from "./ui/Button";
import { Switch } from "./ui/Switch";
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
    desensitizeRemarks?: boolean | undefined;
}

interface AccountStatus {
    color: string;
    text: string;
    severity_class: string;
}

function get_account_status(status: AccountRowProps["status"], enabled: boolean): AccountStatus {
    if (!enabled || status === "disabled") {
        return { color: "var(--color-on-surface-muted)", text: "已关闭", severity_class: "" };
    }
    if (status === "error") {
        return { color: "var(--color-risk-critical)", text: "采集失败", severity_class: " err" };
    }
    if (status === "auth") {
        return { color: "var(--color-risk-critical)", text: "凭证失效", severity_class: " err" };
    }
    if (status === "unknown") {
        return { color: "var(--color-on-surface-muted)", text: "未连接", severity_class: "" };
    }
    return { color: "var(--color-success)", text: "正常", severity_class: "" };
}

function get_vendor_name(provider: VendorId): string {
    if (provider === "cpa") return "CPA";
    if (provider === "overview") return "总览";
    return PROVIDER_LABELS[provider] ?? provider;
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
    desensitizeRemarks = false,
}: AccountRowProps) {
    const is_cpa_child = mode === "cpa-child";
    const effective_on = is_cpa_child ? !is_hidden && !is_removed : enabled;
    const account_status = get_account_status(status, enabled);
    const note_label = desensitizeRemarks ? "" : account_label;

    const row_class =
        "flex items-center gap-3 border-t-[0.5px] border-[var(--color-hairline)] px-[14px] py-3 " +
        "transition-[opacity,background-color] duration-[0.16s] first:border-t-0" +
        (effective_on ? "" : " opacity-[0.56]") +
        (is_cpa_child && is_hidden ? " opacity-50" : "") +
        (is_removed ? " opacity-[0.72]" : "") +
        (mode === "cpa-source"
            ? " bg-[color-mix(in_srgb,var(--color-surface)_4%,var(--color-surface-card))]"
            : "");

    return (
        <div className={row_class} data-testid="account-row" data-mode={mode}>
            <VendorMark id={provider} size={24} />
            <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <span
                    className="shrink-0 whitespace-nowrap text-[14px] font-[650] tracking-[-0.01em] text-[var(--color-on-surface)]"
                    data-testid="account-vendor"
                >
                    {get_vendor_name(provider)}
                </span>
                {note_label && (
                    <span className="truncate text-[13.5px] font-[550] text-[var(--color-on-surface-muted)]">
                        · {note_label}
                    </span>
                )}
                {is_cpa_child && is_removed && (
                    <span className="whitespace-nowrap text-[11.5px] font-semibold text-[var(--color-risk-high)]">
                        来源已移除
                    </span>
                )}
            </span>
            {!is_cpa_child && (
                <span
                    className="flex w-[72px] shrink-0 items-center gap-2"
                    data-testid="account-status"
                >
                    <span
                        className="h-[7px] w-[7px] shrink-0 rounded-full"
                        style={{ background: account_status.color }}
                    />
                    <span
                        className={
                            "whitespace-nowrap text-[11.5px] font-semibold text-[var(--color-on-surface-muted)]" +
                            (account_status.severity_class
                                ? " text-[var(--color-risk-critical)]"
                                : "")
                        }
                    >
                        {account_status.text}
                    </span>
                </span>
            )}
            <div className="ml-auto flex shrink-0 items-center gap-[3px]">
                {is_cpa_child ? (
                    is_removed ? (
                        <Button
                            variant="secondary"
                            size="sm"
                            className="text-[var(--color-error)]"
                            title="清除该来源已移除的账号"
                            onClick={on_clear}
                        >
                            清除
                        </Button>
                    ) : (
                        <>
                            <Button
                                variant="icon"
                                size="sm"
                                className="h-7 w-7 p-0"
                                title="改备注"
                                aria-label="改备注"
                                onClick={on_rename}
                            >
                                <Icon name="edit" size={15} />
                            </Button>
                            <Switch
                                checked={effective_on}
                                data-on={effective_on ? "1" : "0"}
                                aria-label="显示账号"
                                onChange={() => {
                                    (is_hidden ? on_unhide : on_hide)?.();
                                }}
                            />
                        </>
                    )
                ) : (
                    <>
                        <Switch
                            checked={enabled}
                            data-on={enabled ? "1" : "0"}
                            aria-label="启用账号"
                            onChange={() => {
                                on_toggle?.();
                            }}
                        />
                        <Button
                            variant="icon"
                            size="sm"
                            className="h-7 w-7 p-0"
                            title="刷新"
                            aria-label="刷新"
                            onClick={on_refresh}
                        >
                            <Icon name="refresh" size={15} />
                        </Button>
                        <Button
                            variant="icon"
                            size="sm"
                            className="h-7 w-7 p-0"
                            title="编辑"
                            aria-label="编辑"
                            onClick={on_edit}
                        >
                            <Icon name="edit" size={15} />
                        </Button>
                        <Button
                            variant="icon"
                            size="sm"
                            className="h-7 w-7 p-0 text-[var(--color-error)]"
                            title="删除账号"
                            aria-label="删除账号"
                            onClick={on_delete}
                        >
                            <Icon name="trash" size={15} />
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
}
