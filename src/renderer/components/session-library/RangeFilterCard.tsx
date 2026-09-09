export interface RangeValue {
    readonly min?: number | undefined;
    readonly max?: number | undefined;
}

interface RangeFilterCardProps {
    /** 维度名（Token 数 / 轮次），用于 aria-label 前缀。 */
    readonly label: string;
    /** 数轴上限（全量会话最大值）；<=0 时禁用（数据未就绪）。 */
    readonly max_limit: number;
    readonly value: RangeValue;
    /** 数值展示格式化（如 format_tokens）；缺省原样。 */
    readonly format_value?: ((v: number) => string) | undefined;
    readonly testid: string;
    readonly on_change: (next: RangeValue) => void;
}

/** 双滑杆 thumb 可点：轨道本身不截获事件，只露拇指。 */
const THUMB_CLASSES =
    "pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-3 " +
    "[&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full " +
    "[&::-webkit-slider-thumb]:bg-[var(--color-primary)] [&::-moz-range-thumb]:pointer-events-auto " +
    "[&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full " +
    "[&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-[var(--color-primary)]";

/**
 * 会话库数轴筛选卡：双滑杆选 [min, max]（含边界）。拖到端点即「不限」该侧
 * （min=0 / max=上限时回传 undefined，查询参数省略）。上限来自全量统计
 * （session_stats.max_tokens/max_calls），未就绪（<=0）时禁用。
 */
export function RangeFilterCard({
    label,
    max_limit,
    value,
    format_value,
    testid,
    on_change,
}: RangeFilterCardProps) {
    const disabled = max_limit <= 0;
    const step = Math.max(1, Math.round(max_limit / 200));
    const min_val = value.min ?? 0;
    const max_val = value.max ?? max_limit;
    const active = value.min !== undefined || value.max !== undefined;
    const fmt = format_value ?? ((v: number) => String(v));
    const range_text = active ? `${fmt(min_val)} – ${fmt(max_val)}` : "不限";

    return (
        <div className="flex flex-col gap-2" data-testid={testid}>
            <div className="flex items-baseline justify-between">
                <span className="text-[length:var(--text-label-md)] text-[var(--color-on-surface-variant)]">
                    {label}
                </span>
                <span
                    className="font-code-md text-[length:var(--text-label-md)] tabular-nums text-[var(--color-on-surface-muted)]"
                    data-testid={`${testid}-value`}
                >
                    {disabled ? "暂无数据" : range_text}
                </span>
            </div>
            <div className="relative h-4">
                <input
                    type="range"
                    aria-label={`${label}下限`}
                    data-testid={`${testid}-min`}
                    disabled={disabled}
                    min={0}
                    max={max_limit}
                    step={step}
                    value={min_val}
                    className={`absolute inset-0 h-4 w-full appearance-none bg-transparent ${THUMB_CLASSES}`}
                    onChange={(e) => {
                        const v = Math.min(Number(e.target.value), max_val);
                        on_change({
                            ...(v > 0 ? { min: v } : {}),
                            ...(value.max !== undefined ? { max: value.max } : {}),
                        });
                    }}
                />
                <input
                    type="range"
                    aria-label={`${label}上限`}
                    data-testid={`${testid}-max`}
                    disabled={disabled}
                    min={0}
                    max={max_limit}
                    step={step}
                    value={max_val}
                    className={`absolute inset-0 h-4 w-full appearance-none bg-transparent ${THUMB_CLASSES}`}
                    onChange={(e) => {
                        const v = Math.max(Number(e.target.value), min_val);
                        on_change({
                            ...(value.min !== undefined ? { min: value.min } : {}),
                            ...(v < max_limit ? { max: v } : {}),
                        });
                    }}
                />
            </div>
        </div>
    );
}
