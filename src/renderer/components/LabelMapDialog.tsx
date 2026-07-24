import { useEffect, useState } from "react";
import type { MetricRecord } from "../../shared/schemas/plugin-output";
import { build_label_map_rows, type LabelMapRow } from "../lib/label-map-util";
import { Icon } from "./Icon";

function normalize_cpa_label(item: MetricRecord): string {
    const fallback = item.normalized_label;
    if (item.source !== "gateway") return fallback;
    if (!item.accountLabel) return fallback;
    const escaped_label = item.accountLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const without_account = fallback
        .replace(new RegExp(`\\s*\\(${escaped_label}\\)`, "g"), "")
        .replace(new RegExp(`\\s*${escaped_label}\\s*`, "g"), " ")
        .replace(/\s+/g, " ")
        .trim();
    return without_account.length > 0 ? without_account : fallback;
}

interface LabelMapDialogProps {
    instance_id: string;
    vendor_id: string;
    account_name: string;
    existing_map: Readonly<Record<string, string>>;
    on_save: (instance_id: string, map: Record<string, string>) => Promise<void>;
    on_close: () => void;
}

export function LabelMapDialog({
    instance_id,
    vendor_id,
    account_name,
    existing_map,
    on_save,
    on_close,
}: LabelMapDialogProps) {
    const [rows, set_rows] = useState<LabelMapRow[]>([]);
    const [map, set_map] = useState<Record<string, string>>({});
    const [loading, set_loading] = useState(true);
    const [synced, set_synced] = useState<string | null>(null);

    // Fetch raw labels from plugin state
    useEffect(() => {
        void (async () => {
            set_loading(true);
            try {
                const state = await window.usageboard.connector.getState(instance_id);
                const items =
                    state.status === "ready" || state.status === "failed"
                        ? (state.items ?? [])
                        : [];
                const filtered = items.filter((item) => item.provider === vendor_id);
                set_rows(build_label_map_rows(filtered, existing_map, normalize_cpa_label));
                if (state.status === "ready") {
                    set_synced(new Date(state.updatedAt).toLocaleString());
                }
            } catch {
                set_rows([]);
            } finally {
                set_loading(false);
            }
        })();
    }, [instance_id, vendor_id, existing_map]);

    const effective = (r: LabelMapRow) => map[r.raw] ?? r.display;
    const changed_count = rows.filter((r) => effective(r) !== r.default).length;

    const set_value = (raw: string, v: string) => {
        set_map((m) => ({ ...m, [raw]: v }));
    };
    const reset_row = (raw: string) => {
        const row = rows.find((r) => r.raw === raw);
        if (!row) return;
        set_map((m) => ({ ...m, [raw]: row.default }));
    };
    const reset_all = () => {
        const next: Record<string, string> = {};
        for (const r of rows) {
            next[r.raw] = r.default;
        }
        set_map(next);
    };

    const handle_save = async () => {
        // Persist only non-default mappings, keyed by raw_label.
        const merged: Record<string, string> = {};
        for (const r of rows) {
            const v = effective(r);
            if (v !== r.default) {
                merged[r.raw] = v;
            }
        }
        await on_save(instance_id, merged);
    };

    // ESC to close
    useEffect(() => {
        const h = (e: KeyboardEvent) => {
            if (e.key === "Escape") on_close();
        };
        window.addEventListener("keydown", h);
        return () => {
            window.removeEventListener("keydown", h);
        };
    }, [on_close]);

    return (
        <div className="acct-dialog-scrim" onMouseDown={on_close}>
            <div
                className="acct-dialog aa"
                onMouseDown={(e) => {
                    e.stopPropagation();
                }}
            >
                {/* Header */}
                <div className="ad-head">
                    <span className="ad-mark">
                        <Icon name="tag" size={20} strokeWidth={1.7} />
                    </span>
                    <div className="ad-htext">
                        <div className="ad-title">数据标签映射</div>
                        <div className="ad-sub">
                            {vendor_id} · {account_name}
                        </div>
                    </div>
                    <button className="ad-close" onClick={on_close} title="关闭" type="button">
                        <Icon name="close" size={17} strokeWidth={2} />
                    </button>
                </div>

                {/* Body */}
                <div className="ad-body">
                    {loading ? (
                        <div className="scan-busy">
                            <span className="sb-spin">
                                <Icon name="refresh" size={16} />
                            </span>
                            正在加载标签数据…
                        </div>
                    ) : rows.length === 0 ? (
                        <div className="lm-empty">
                            <span className="lme-ic">
                                <Icon name="tag" size={20} />
                            </span>
                            <div className="lme-title">该服务暂无可映射的数据标签</div>
                            <div className="lme-sub">
                                完成一次成功同步后，接口返回的标签会显示在这里。
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="lm-meta">
                                <Icon name="info" size={13} />
                                以下标签来自接口最近一次返回
                                {synced ? ` · ${synced}` : ""}
                            </div>
                            <div className="lm-cols">
                                <span>原始标签（来自接口）</span>
                                <span>显示名称</span>
                            </div>
                            <div className="lm-list">
                                {rows.map((r) => {
                                    const v = effective(r);
                                    const changed = v !== r.default;
                                    return (
                                        <div className="lm-row" key={r.raw}>
                                            <code className="lm-raw" title={r.raw}>
                                                {r.raw}
                                            </code>
                                            <span className="lm-arrow">
                                                <Icon name="chevron" size={14} />
                                            </span>
                                            <div className="lm-inwrap">
                                                <input
                                                    className="lm-input"
                                                    spellCheck={false}
                                                    autoCorrect="off"
                                                    autoCapitalize="off"
                                                    value={v}
                                                    placeholder={r.default}
                                                    onChange={(e) => {
                                                        set_value(r.raw, e.target.value);
                                                    }}
                                                />
                                                {changed && (
                                                    <button
                                                        className="lm-reset"
                                                        title="恢复默认"
                                                        type="button"
                                                        onClick={() => {
                                                            reset_row(r.raw);
                                                        }}
                                                    >
                                                        <Icon
                                                            name="refresh"
                                                            size={13}
                                                            strokeWidth={1.8}
                                                        />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="ad-foot">
                    {rows.length > 0 && (
                        <button
                            className="ad-test"
                            type="button"
                            onClick={reset_all}
                            disabled={!changed_count}
                            style={changed_count ? undefined : { opacity: 0.45, cursor: "default" }}
                        >
                            <Icon name="refresh" size={14} strokeWidth={1.9} />
                            全部恢复默认
                        </button>
                    )}
                    <div className="ad-foot-r">
                        <button className="ad-btn ghost" type="button" onClick={on_close}>
                            取消
                        </button>
                        <button
                            className="ad-btn primary"
                            type="button"
                            onClick={() => {
                                void handle_save();
                            }}
                        >
                            保存映射
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
