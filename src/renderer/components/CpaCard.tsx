import { useMemo } from "react";
import { Button } from "./ui/Button";
import { Switch } from "./ui/Switch";
import { Icon, VendorMark, type VendorId } from "./Icon";
import { AccountRow } from "./AccountRow";

interface CpaCardRow {
    provider: VendorId;
    account_id: string;
    account_label: string;
    status: "ok" | "error" | "auth" | "disabled" | "unknown";
    is_hidden: boolean;
    is_removed: boolean;
}

interface CpaCardProps {
    instance_id: string;
    display_name: string;
    enabled: boolean;
    status: "ok" | "partial" | "error" | "disabled" | "unknown";
    rows: CpaCardRow[];
    on_toggle: () => void;
    on_refresh: () => void;
    on_edit: () => void;
    on_delete: () => void;
    on_hide: (target: { provider: string; account_id: string }) => void;
    on_unhide: (target: { provider: string; account_id: string }) => void;
    on_clear: (target: { provider: string; account_id: string }) => void;
    on_rename: (target: { provider: string; account_id: string }) => void;
    desensitizeRemarks?: boolean | undefined;
}

interface CpaStatus {
    color: string;
    text: string;
    severity_class: string;
}

function get_cpa_status(status: CpaCardProps["status"], enabled: boolean): CpaStatus {
    if (!enabled || status === "disabled") {
        return { color: "var(--color-on-surface-muted)", text: "已关闭", severity_class: "" };
    }
    if (status === "partial" || status === "error") {
        return {
            color: "var(--color-risk-critical)",
            text: "采集失败",
            severity_class: " err",
        };
    }
    return { color: "var(--color-success)", text: "正常", severity_class: "" };
}

export function CpaCard({
    display_name,
    enabled,
    status,
    rows,
    on_toggle,
    on_refresh,
    on_edit,
    on_delete,
    on_hide,
    on_unhide,
    on_clear,
    on_rename,
    desensitizeRemarks = false,
}: CpaCardProps) {
    const cpa_status = get_cpa_status(status, enabled);
    const note = desensitizeRemarks ? "" : display_name;

    const unique_accounts = useMemo(() => {
        const seen = new Map<string, CpaCardRow>();
        for (const row of rows) {
            const key = `${row.provider}:${row.account_id}`;
            if (!seen.has(key)) {
                seen.set(key, row);
            }
        }
        return Array.from(seen.values());
    }, [rows]);

    return (
        <div
            className={
                "overflow-hidden rounded-[14px] border-[0.5px] border-[var(--color-outline)] " +
                "bg-[var(--color-surface-card)] shadow-card transition-[opacity,box-shadow] duration-[0.16s]" +
                (enabled ? "" : " opacity-[0.56]")
            }
            data-testid="account-card"
        >
            <div
                className={
                    "flex items-center gap-3 border-t-[0.5px] border-[var(--color-hairline)] " +
                    "bg-[color-mix(in_srgb,var(--color-surface)_4%,var(--color-surface-card))] " +
                    "px-[14px] py-3 transition-[opacity,background-color] duration-[0.16s] first:border-t-0"
                }
                data-testid="account-row"
                data-mode="cpa-source"
            >
                <VendorMark id="cpa" size={24} />
                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span
                        className="shrink-0 whitespace-nowrap text-[14px] font-[650] tracking-[-0.01em] text-[var(--color-on-surface)]"
                        data-testid="account-vendor"
                    >
                        CPA
                    </span>
                    {note && note !== "CPA" && (
                        <span className="truncate text-[13.5px] font-[550] text-[var(--color-on-surface-muted)]">
                            · {note}
                        </span>
                    )}
                </span>
                <span
                    className="flex w-[72px] shrink-0 items-center gap-2"
                    data-testid="account-status"
                >
                    <span
                        className="h-[7px] w-[7px] shrink-0 rounded-full"
                        style={{ background: cpa_status.color }}
                    />
                    <span
                        className={
                            "whitespace-nowrap text-[11.5px] font-semibold text-[var(--color-on-surface-muted)]" +
                            (cpa_status.severity_class ? " text-[var(--color-risk-critical)]" : "")
                        }
                    >
                        {cpa_status.text}
                    </span>
                </span>
                <div className="ml-auto flex shrink-0 items-center gap-[3px]">
                    <Switch
                        checked={enabled}
                        data-on={enabled ? "1" : "0"}
                        aria-label="启用 CPA"
                        onChange={() => {
                            on_toggle();
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
                        title="编辑（连接设置）"
                        aria-label="编辑（连接设置）"
                        onClick={on_edit}
                    >
                        <Icon name="edit" size={15} />
                    </Button>
                    <Button
                        variant="icon"
                        size="sm"
                        className="h-7 w-7 p-0 text-[var(--color-error)]"
                        title="移除数据源"
                        aria-label="移除数据源"
                        onClick={on_delete}
                    >
                        <Icon name="trash" size={15} />
                    </Button>
                </div>
            </div>
            {unique_accounts.map((row) => (
                <AccountRow
                    key={`${row.provider}-${row.account_id}`}
                    mode="cpa-child"
                    provider={row.provider}
                    account_label={row.account_label}
                    enabled={!row.is_hidden && !row.is_removed}
                    status={row.status}
                    is_hidden={row.is_hidden}
                    is_removed={row.is_removed}
                    desensitizeRemarks={desensitizeRemarks}
                    on_hide={() => {
                        on_hide({ provider: row.provider, account_id: row.account_id });
                    }}
                    on_unhide={() => {
                        on_unhide({
                            provider: row.provider,
                            account_id: row.account_id,
                        });
                    }}
                    on_clear={() => {
                        on_clear({
                            provider: row.provider,
                            account_id: row.account_id,
                        });
                    }}
                    on_rename={() => {
                        on_rename({
                            provider: row.provider,
                            account_id: row.account_id,
                        });
                    }}
                />
            ))}
        </div>
    );
}
