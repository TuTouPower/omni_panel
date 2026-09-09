import { useState } from "react";
import { time_filter_range, type TimePreset } from "../../lib/session-library/filter";
import { format_compact_datetime } from "../../lib/workspace/pane";
import { Segmented } from "../ui/Segmented";
import { RangePicker } from "../token-stats/RangePicker";

interface TimeRangeFilterProps {
    /** 当前预设；custom 表示弹层自选区间已生效。 */
    readonly preset: TimePreset;
    /** 当前生效的查询区间（预设点击时冻结），用于回显自定义弹层。 */
    readonly applied_range: { start_at?: number; end_at?: number };
    /** 预设或自定义区间变更。range 为「点击时刻冻结」的查询区间。 */
    readonly on_change: (preset: TimePreset, range: { start_at?: number; end_at?: number }) => void;
}

/** 自定义弹层默认回填：最近 7 天。 */
const CUSTOM_DEFAULT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * 会话库时间筛选（对齐 demo）：预设分段（全部/24h/7d/30d）+ 行末日历图标弹层
 * （复用 token-stats RangePicker）；自定义生效后整行变主色胶囊（区间文本 +
 * 重选 / 清除）。预设区间在点击时刻冻结（Date.now 快照），不在渲染期反复计算，
 * 避免 backend_filters 身份每渲染漂移引发循环拉取。
 */
export function TimeRangeFilter({ preset, applied_range, on_change }: TimeRangeFilterProps) {
    const [pickerOpen, setPickerOpen] = useState(false);
    const now = Date.now();

    if (preset === "custom") {
        const fmt = (ts: number | undefined): string =>
            ts === undefined ? "…" : format_compact_datetime(ts);
        return (
            <div
                className="flex items-center gap-2 rounded-md bg-[var(--color-primary-container)] px-3 py-2"
                data-testid="time-custom-pill"
            >
                <span className="flex-1 truncate text-[length:var(--text-label-md)] tabular-nums text-[var(--color-primary)]">
                    {fmt(applied_range.start_at)} → {fmt(applied_range.end_at)}
                </span>
                <button
                    type="button"
                    aria-label="重选时间范围"
                    data-testid="time-custom-reselect"
                    className="shrink-0 text-[var(--color-primary)] transition-feedback hover:text-[var(--color-on-surface)]"
                    onClick={() => {
                        setPickerOpen(true);
                    }}
                >
                    📅
                </button>
                <button
                    type="button"
                    aria-label="清除自定义时间"
                    data-testid="time-custom-clear"
                    className="shrink-0 text-[var(--color-primary)] transition-feedback hover:text-[var(--color-error)]"
                    onClick={() => {
                        setPickerOpen(false);
                        on_change("all", {});
                    }}
                >
                    ✕
                </button>
                <RangePicker
                    start={applied_range.start_at ?? now - CUSTOM_DEFAULT_WINDOW_MS}
                    end={applied_range.end_at ?? now}
                    open={pickerOpen}
                    onOpenChange={setPickerOpen}
                    onApply={(range) => {
                        setPickerOpen(false);
                        on_change("custom", { start_at: range.start, end_at: range.end });
                    }}
                />
            </div>
        );
    }

    return (
        <div className="flex items-center gap-1">
            <div className="min-w-0 flex-1">
                <Segmented
                    size="sm"
                    aria-label="时间范围"
                    value={preset}
                    options={[
                        { value: "all", label: "全部", "data-testid": "time-preset-all" },
                        { value: "24h", label: "24h", "data-testid": "time-preset-24h" },
                        { value: "7d", label: "7d", "data-testid": "time-preset-7d" },
                        { value: "30d", label: "30d", "data-testid": "time-preset-30d" },
                    ]}
                    onChange={(value) => {
                        setPickerOpen(false);
                        on_change(value, time_filter_range(value, null, Date.now()));
                    }}
                />
            </div>
            <button
                type="button"
                aria-label="自定义时间范围"
                data-testid="time-custom-button"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-sm text-[var(--color-on-surface-variant)] transition-feedback hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-on-surface)]"
                onClick={() => {
                    setPickerOpen((open) => !open);
                }}
            >
                📅
            </button>
            <RangePicker
                start={applied_range.start_at ?? now - CUSTOM_DEFAULT_WINDOW_MS}
                end={applied_range.end_at ?? now}
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                onApply={(range) => {
                    setPickerOpen(false);
                    on_change("custom", { start_at: range.start, end_at: range.end });
                }}
            />
        </div>
    );
}
