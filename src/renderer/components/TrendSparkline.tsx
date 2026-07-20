import { memo } from "react";

import type { TrendPoint } from "../../shared/types/ipc";

interface TrendSparklineProps {
    data: readonly (TrendPoint | null)[];
    width?: number | undefined;
    height?: number | undefined;
    label?: string | undefined;
}

const DEFAULT_WIDTH = 560;
const DEFAULT_HEIGHT = 150;

/**
 * 账号展开区近 7 天走势 sparkline。纯内联 SVG,零依赖。
 *
 * - viewBox 560×150,左侧 34px 留刻度,底部 24px 留日期
 * - 0/50/100% 三条网格线 + 左侧刻度
 * - 渐变面积 + 折线 + 数据点圆点
 * - 配色用 `--blue` / `--track` CSS 变量(主题切换自动跟随)
 * - `<2` 个有效点显示占位文案,避免画一条点误导用户
 *
 * 参考 `data/index.html` 的 `trendSVG` 绘图结构,不照搬配色。
 */
export const TrendSparkline = memo(function TrendSparkline({
    data,
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    label,
}: TrendSparklineProps) {
    const pad_left = 34;
    const pad_right = 12;
    const pad_top = 12;
    const pad_bottom = 24;
    const inner_width = width - pad_left - pad_right;
    const inner_height = height - pad_top - pad_bottom;

    const valid_points = data.filter((p): p is TrendPoint => p !== null);

    if (valid_points.length < 2) {
        return (
            <div
                className="trend-sparkline trend-sparkline-empty"
                style={{ minHeight: `${String(height)}px` }}
                role="img"
                aria-label={label ? `${label} 趋势数据不足` : "趋势数据不足"}
            >
                <span className="trend-sparkline-placeholder">
                    {label ? `${label}:` : ""}近 7 天数据不足
                </span>
            </div>
        );
    }

    const n = data.length;
    const x_at = (i: number) => pad_left + (n <= 1 ? 0 : (inner_width * i) / (n - 1));
    const y_at = (v: number) => pad_top + inner_height * (1 - v / 100);

    const points = data.map((p, i) =>
        p === null ? null : { x: x_at(i), y: y_at(p.percent), point: p },
    );
    const valid = points.filter(
        (p): p is { x: number; y: number; point: TrendPoint } => p !== null,
    );

    const line = valid.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

    const first = valid[0];
    const last = valid[valid.length - 1];
    const area_path =
        first !== undefined && last !== undefined
            ? `M${first.x.toFixed(1)},${(pad_top + inner_height).toFixed(1)} ` +
              valid.map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") +
              ` L${last.x.toFixed(1)},${(pad_top + inner_height).toFixed(1)} Z`
            : "";

    const grid_values = [0, 50, 100];

    return (
        <div className="trend-sparkline" style={{ minHeight: `${String(height)}px` }}>
            <svg
                className="trend-svg"
                viewBox={`0 0 ${String(width)} ${String(height)}`}
                width="100%"
                height={height}
                preserveAspectRatio="xMidYMid meet"
                role="img"
                aria-label={label ? `${label} 近 7 天走势` : "近 7 天走势"}
            >
                <defs>
                    <linearGradient id="trend-sparkline-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--blue)" stopOpacity="0.28" />
                        <stop offset="100%" stopColor="var(--blue)" stopOpacity="0.02" />
                    </linearGradient>
                </defs>
                {grid_values.map((g) => (
                    <g key={g}>
                        <line
                            x1={pad_left}
                            y1={y_at(g)}
                            x2={width - pad_right}
                            y2={y_at(g)}
                            stroke="var(--track)"
                            strokeWidth={1}
                        />
                        <text
                            x={pad_left - 6}
                            y={y_at(g) + 3.5}
                            fill="var(--text-3)"
                            fontSize={9.5}
                            textAnchor="end"
                        >
                            {String(g)}%
                        </text>
                    </g>
                ))}
                {data.map((p, i) => {
                    if (p === null) return null;
                    return (
                        <text
                            key={`d${String(i)}`}
                            x={x_at(i)}
                            y={height - 8}
                            fill="var(--text-3)"
                            fontSize={9.5}
                            textAnchor="middle"
                        >
                            {p.date.slice(5)}
                        </text>
                    );
                })}
                {area_path !== "" && <path d={area_path} fill="url(#trend-sparkline-fill)" />}
                <polyline
                    points={line}
                    fill="none"
                    stroke="var(--blue)"
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                />
                {valid.map((p, i) => (
                    <circle
                        key={`p${String(i)}`}
                        cx={p.x}
                        cy={p.y}
                        r={2.6}
                        fill="var(--blue)"
                        stroke="var(--card-bg)"
                        strokeWidth={1.2}
                    />
                ))}
            </svg>
        </div>
    );
});
