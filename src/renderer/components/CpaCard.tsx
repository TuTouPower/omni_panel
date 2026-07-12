import { useMemo } from "react";
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
}

interface CpaStatus {
    color: string;
    text: string;
    severity_class: string;
}

function get_cpa_status(status: CpaCardProps["status"], enabled: boolean): CpaStatus {
    if (!enabled || status === "disabled") {
        return { color: "var(--text-3)", text: "已关闭", severity_class: "" };
    }
    if (status === "partial" || status === "error") {
        return { color: "var(--risk-red)", text: "采集失败", severity_class: " err" };
    }
    return { color: "var(--green)", text: "正常", severity_class: "" };
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
}: CpaCardProps) {
    const cpa_status = get_cpa_status(status, enabled);

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
        <div className={"acc-card" + (enabled ? "" : " off")}>
            <div className="acc-row ds-row">
                <VendorMark id="cpa" size={24} />
                <span className="ar-id">
                    <span className="ar-vendor">CPA</span>
                    {display_name && display_name !== "CPA" && (
                        <span className="ar-note">· {display_name}</span>
                    )}
                </span>
                <span className="ar-status">
                    <span className="ar-dot" style={{ background: cpa_status.color }} />
                    <span className={"ar-stat" + cpa_status.severity_class}>{cpa_status.text}</span>
                </span>
                <div className="ar-actions">
                    <button className="sw" data-on={enabled ? "1" : "0"} onClick={on_toggle}>
                        <i />
                    </button>
                    <button className="sp-ic" title="刷新" onClick={on_refresh}>
                        <Icon name="refresh" size={15} />
                    </button>
                    <button className="sp-ic" title="编辑（连接设置）" onClick={on_edit}>
                        <Icon name="edit" size={15} />
                    </button>
                    <button className="sp-ic danger" title="移除数据源" onClick={on_delete}>
                        <Icon name="trash" size={15} />
                    </button>
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
