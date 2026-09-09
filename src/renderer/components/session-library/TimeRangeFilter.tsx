import { useState } from "react";
import { time_filter_range, type TimePreset } from "../../lib/session-library/filter";
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
 * 会话库时间筛选：预设分段（全部/24h/7 天/30 天）+ 「📅 自定义」弹层（复用
 * token-stats RangePicker）。预设区间在点击时刻冻结（Date.now 快照），不在渲染期
 * 反复计算，避免 backend_filters 身份每渲染漂移引发循环拉取。
 */
export function TimeRangeFilter({ preset, applied_range, on_change }: TimeRangeFilterProps) {
    const [pickerOpen, setPickerOpen] = useState(false);
    const now = Date.now();

    return (
        <div className="flex flex-wrap items-center gap-2">
            <Segmented
                size="sm"
                aria-label="时间范围"
                value={preset === "custom" ? "" : preset}
                options={[
                    { value: "all", label: "全部", "data-testid": "time-preset-all" },
                    { value: "24h", label: "24h", "data-testid": "time-preset-24h" },
                    { value: "7d", label: "7 天", "data-testid": "time-preset-7d" },
                    { value: "30d", label: "30 天", "data-testid": "time-preset-30d" },
                ]}
                onChange={(value) => {
                    setPickerOpen(false);
                    on_change(value, time_filter_range(value, null, Date.now()));
                }}
            />
            <button
                type="button"
                aria-label="📅 自定义"
                className="rounded-md border border-[var(--color-outline)] px-2 py-1 text-[length:var(--text-label-md)] text-[var(--color-on-surface-variant)]"
                onClick={() => {
                    setPickerOpen((open) => !open);
                }}
            >
                📅 自定义
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
