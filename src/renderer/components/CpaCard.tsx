import { useMemo } from "react";
import { Icon, VendorMark } from "./Icon";
import { AccountRow } from "./AccountRow";
import { PROVIDER_LABELS } from "../lib/provider-usage";
import type { UsageProvider } from "../../shared/schemas/plugin-output";

interface CpaCardRow {
    provider: string;
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
    source_count: number;
    account_count: number;
    fail_count?: number;
    rows: CpaCardRow[];
    on_toggle: () => void;
    on_refresh: () => void;
    on_edit: () => void;
    on_delete: () => void;
    on_hide: (index: number) => void;
    on_unhide: (index: number) => void;
    on_clear: (index: number) => void;
}

const CPA_STATUS_DOT: Record<string, string> = {
    ok: "var(--green)",
    partial: "var(--risk-orange)",
    error: "var(--risk-red)",
    disabled: "var(--text-3)",
    unknown: "var(--text-3)",
};

export function CpaCard({
    display_name,
    enabled,
    status,
    source_count,
    account_count,
    fail_count = 0,
    rows,
    on_toggle,
    on_refresh,
    on_edit,
    on_delete,
    on_hide,
    on_unhide,
    on_clear,
}: CpaCardProps) {
    const dot = enabled ? (CPA_STATUS_DOT[status] ?? CPA_STATUS_DOT.unknown) : "var(--text-3)";

    const groups = useMemo(() => {
        const map = new Map<string, { rows: typeof rows; indices: number[] }>();
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const existing = map.get(row.provider);
            if (existing) {
                existing.rows.push(row);
                existing.indices.push(i);
            } else {
                map.set(row.provider, { rows: [row], indices: [i] });
            }
        }
        return Array.from(map.entries());
    }, [rows]);

    return (
        <div className={"acc-card" + (enabled ? "" : " off")}>
            <div className="acc-row ds-row">
                <span className="ar-vendor-col ds-vendor">
                    <VendorMark id="cpa" size={24} />
                    <span className="ar-vendor">{display_name}</span>
                </span>
                <div className="ar-acct-col">
                    <span className="ar-dot" style={{ background: dot }} />
                    <span className="ar-note">
                        {account_count} 账号 · {source_count} 服务商
                    </span>
                    {fail_count > 0 && (
                        <span className="cpa-fail">
                            <Icon name="cloud_off" size={12} strokeWidth={1.9} />
                            {fail_count} 个采集失败
                        </span>
                    )}
                </div>
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
            {groups.map(([provider, group]) => (
                <div className="disc-grp" key={provider} role="group">
                    <div className="disc-head">
                        <VendorMark id={provider as UsageProvider} size={20} />
                        <span className="dh-name">
                            {PROVIDER_LABELS[provider as UsageProvider]}
                        </span>
                        <span className="dh-count">{group.rows.length} 个</span>
                    </div>
                    <div className="disc-rows">
                        {group.rows.map((row, gi) => (
                            <AccountRow
                                key={`${row.provider}-${row.account_label}`}
                                mode="cpa-child"
                                provider={row.provider}
                                account_label={row.account_label}
                                enabled={!row.is_hidden && !row.is_removed}
                                status={row.status}
                                is_hidden={row.is_hidden}
                                is_removed={row.is_removed}
                                show_vendor={false}
                                on_hide={() => {
                                    on_hide(group.indices[gi]);
                                }}
                                on_unhide={() => {
                                    on_unhide(group.indices[gi]);
                                }}
                                on_clear={() => {
                                    on_clear(group.indices[gi]);
                                }}
                            />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
