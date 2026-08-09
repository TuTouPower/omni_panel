import { useEffect, useState } from "react";
import type { MetricRecord } from "../../shared/schemas/plugin-output";
import { build_label_map_rows, type LabelMapRow } from "../lib/label-map-util";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";
import { Input } from "./ui/Input";
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
    watched_metrics?: Readonly<Partial<Record<string, readonly string[]>>> | undefined;
    on_save: (instance_id: string, map: Record<string, string>) => Promise<void>;
    on_close: () => void;
    on_toggle_watched?: ((raw_label: string, account_keys: readonly string[]) => void) | undefined;
}

export function LabelMapDialog({
    instance_id,
    vendor_id,
    account_name,
    existing_map,
    watched_metrics,
    on_save,
    on_close,
    on_toggle_watched,
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
        <Dialog
            open
            onClose={on_close}
            width={420}
            ariaLabel="数据标签映射"
            backdropTestId="label-map-dialog-backdrop"
            title={
                <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary-container)] text-[var(--color-accent)]">
                        <Icon name="tag" size={20} strokeWidth={1.7} />
                    </span>
                    <div className="min-w-0">
                        <div className="text-title-sm font-semibold">数据标签映射</div>
                        <div className="mt-0.5 truncate text-body-sm text-[var(--color-on-surface-muted)]">
                            {vendor_id} · {account_name}
                        </div>
                    </div>
                    <Button
                        variant="icon"
                        size="sm"
                        className="ml-auto h-8 w-8 shrink-0 p-0"
                        onClick={on_close}
                        title="关闭"
                        aria-label="关闭"
                    >
                        <Icon name="close" size={17} strokeWidth={2} />
                    </Button>
                </div>
            }
            footer={
                <>
                    {rows.length > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            type="button"
                            onClick={reset_all}
                            disabled={!changed_count}
                            className="mr-auto"
                        >
                            <Icon name="refresh" size={14} strokeWidth={1.9} />
                            全部恢复默认
                        </Button>
                    )}
                    <Button variant="ghost" size="sm" type="button" onClick={on_close}>
                        取消
                    </Button>
                    <Button
                        variant="primary"
                        size="sm"
                        type="button"
                        onClick={() => {
                            void handle_save();
                        }}
                    >
                        保存映射
                    </Button>
                </>
            }
        >
            {loading ? (
                <div className="flex items-center justify-center gap-2 py-6 text-body-md text-[var(--color-on-surface-muted)]">
                    <span className="flex animate-spin">
                        <Icon name="refresh" size={16} />
                    </span>
                    正在加载标签数据…
                </div>
            ) : rows.length === 0 ? (
                <div className="flex flex-col items-center p-7 text-center">
                    <span className="mb-2.5 text-[var(--color-on-surface-muted)]">
                        <Icon name="tag" size={20} />
                    </span>
                    <div className="mb-1 text-body-md font-semibold text-[var(--color-on-surface-variant)]">
                        该服务暂无可映射的数据标签
                    </div>
                    <div className="max-w-[260px] text-body-sm leading-relaxed text-[var(--color-on-surface-muted)]">
                        完成一次成功同步后，接口返回的标签会显示在这里。
                    </div>
                </div>
            ) : (
                <>
                    <div className="mb-3.5 flex items-center gap-1.5 text-body-sm text-[var(--color-on-surface-muted)]">
                        <Icon name="info" size={13} />
                        以下标签来自接口最近一次返回
                        {synced ? ` · ${synced}` : ""}
                    </div>
                    <div className="mb-2 flex items-center gap-3 px-0.5 text-label-md font-semibold uppercase tracking-wide text-[var(--color-on-surface-muted)]">
                        <span className="min-w-0 flex-1">原始标签（来自接口）</span>
                        <span className="w-[140px] shrink-0">显示名称</span>
                    </div>
                    <div className="flex max-h-[280px] flex-col gap-1.5 overflow-y-auto">
                        {rows.map((r) => {
                            const v = effective(r);
                            const changed = v !== r.default;
                            const watched =
                                r.account_keys.length > 0 &&
                                r.account_keys.every(
                                    (account_key) =>
                                        watched_metrics?.[account_key]?.includes(r.raw) ?? false,
                                );
                            return (
                                <div className="flex items-center gap-2" key={r.raw}>
                                    <code
                                        className="min-w-[120px] flex-1 overflow-hidden text-ellipsis whitespace-nowrap rounded-md bg-[var(--color-surface-raised)] px-2 py-1.5 font-[var(--font-code-md)] text-label-md text-[var(--color-on-surface-variant)]"
                                        title={r.raw}
                                    >
                                        {r.raw}
                                    </code>
                                    <span className="shrink-0 text-[var(--color-on-surface-muted)]">
                                        <Icon name="chevron" size={14} />
                                    </span>
                                    <div className="relative w-[140px] shrink-0">
                                        <Input
                                            className="h-8 pr-8 font-[var(--font-code-md)] text-label-md"
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
                                            <Button
                                                variant="icon"
                                                size="sm"
                                                className="absolute right-0.5 top-1/2 h-7 w-7 -translate-y-1/2 p-0"
                                                title="恢复默认"
                                                aria-label="恢复默认"
                                                type="button"
                                                onClick={() => {
                                                    reset_row(r.raw);
                                                }}
                                            >
                                                <Icon name="refresh" size={13} strokeWidth={1.8} />
                                            </Button>
                                        )}
                                    </div>
                                    {watched_metrics && on_toggle_watched && (
                                        <Button
                                            variant="icon"
                                            size="sm"
                                            className="h-7 w-7 shrink-0 p-0"
                                            title="监控该数据标签的即将重置"
                                            aria-label="监控该数据标签的即将重置"
                                            aria-pressed={watched}
                                            type="button"
                                            onClick={() => {
                                                on_toggle_watched(r.raw, r.account_keys);
                                            }}
                                        >
                                            <Icon
                                                name="bell"
                                                size={14}
                                                style={{ opacity: watched ? 1 : 0.35 }}
                                            />
                                        </Button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </Dialog>
    );
}
