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
 * （min=0 / max=上限时回传 undefined，查询参数省略；展示对齐 demo：上限端
 * 显示「上限+」）。灰底轨道 + 两滑块间主色填充段。上限来自全量统计
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
    const fmt = format_value ?? ((v: number) => String(v));
    const pct = (v: number): number => (max_limit > 0 ? (v / max_limit) * 100 : 0);
    // 两滑块靠近时抬高对应 input 的层级，保证都可点（对齐 demo）。
    const lo_z = pct(min_val) > 50 ? 5 : 3;
    const hi_z = pct(min_val) > 50 ? 3 : 4;
    const range_text = `${fmt(min_val)} – ${max_val >= max_limit ? `${fmt(max_limit)}+` : fmt(max_val)}`;

    return (
        <div
            className="rounded-[14px] border border-[var(--color-hairline)] bg-[var(--color-surface-card)] px-4 py-3 shadow-[var(--shadow-card)]"
            data-testid={testid}
        >
            <div className="mb-2.5 flex items-center justify-between">
                <span className="text-[length:var(--text-label-caps)] uppercase text-[var(--color-on-surface-muted)]">
                    {label}
                </span>
                <span
                    className="text-[length:var(--text-label-md)] tabular-nums text-[var(--color-on-surface)]"
                    data-testid={`${testid}-value`}
                >
                    {disabled ? "暂无数据" : range_text}
                </span>
            </div>
            <div className="relative h-4">
                {/* 灰底轨道 + 选中区间主色填充段（demo 轨道配色）。 */}
                <div className="absolute left-0 right-0 top-1/2 h-[6px] -translate-y-1/2 rounded-full bg-[var(--color-surface-raised)]" />
                <div
                    className="absolute top-1/2 h-[6px] -translate-y-1/2 rounded-full bg-[var(--color-primary)]"
                    style={{
                        left: `${String(pct(min_val))}%`,
                        right: `${String(100 - pct(max_val))}%`,
                    }}
                />
                <input
                    type="range"
                    aria-label={`${label}下限`}
                    data-testid={`${testid}-min`}
                    disabled={disabled}
                    min={0}
                    max={max_limit}
                    step={step}
                    value={min_val}
                    style={{ zIndex: lo_z }}
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
                    style={{ zIndex: hi_z }}
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
