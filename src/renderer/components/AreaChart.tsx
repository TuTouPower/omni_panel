import type { PluginChart } from "../../shared/schemas/plugin-output";

const SERIES_COLORS = ["#4c63e6", "#14b8a6", "#e6a23a", "#9b5de5", "#f25f8a"];

interface AreaChartProps {
    chart: PluginChart;
    width?: number;
    plotH?: number;
}

export function AreaChart({ chart, width = 420, plotH = 132 }: AreaChartProps) {
    const padL = 34;
    const padR = 6;
    const padT = 8;
    const xLabelH = 22;
    const plotW = width - padL - padR;
    const totalH = padT + plotH + xLabelH;

    const n = chart.buckets.length;
    if (n === 0) return null;

    const models = chart.buckets[0]?.segments.map((s) => s.model) ?? [];
    const series = models.map((model, si) => ({
        color: SERIES_COLORS[si % SERIES_COLORS.length],
        data: chart.buckets.map((b) => {
            const seg = b.segments.find((s) => s.model === model);
            return seg?.tokens ?? 0;
        }),
    }));

    const allValues = series.flatMap((s) => s.data);
    const yMax = Math.max(...allValues, 1);

    const yTicks = niceYTicks(yMax);

    const xAt = (i: number) => padL + (n === 1 ? 0 : (i / (n - 1)) * plotW);
    const yAt = (v: number) => padT + (1 - Math.max(0, Math.min(v, yMax)) / yMax) * plotH;
    const baseY = padT + plotH;

    const fmtY = (t: number) => {
        if (t === 0) return "0";
        if (t >= 1_000_000) return `${(t / 1_000_000).toFixed(1)}M`;
        if (t >= 1_000) return `${(t / 1_000).toFixed(0)}K`;
        return String(t);
    };

    const svgW = String(width);
    const svgH = String(totalH);

    return (
        <svg
            width={width}
            height={totalH}
            viewBox={`0 0 ${svgW} ${svgH}`}
            style={{ fontVariantNumeric: "tabular-nums" }}
        >
            {yTicks.map((t) => (
                <g key={t}>
                    <line
                        x1={padL}
                        y1={yAt(t)}
                        x2={width - padR}
                        y2={yAt(t)}
                        stroke="var(--grid-line, #ececee)"
                        strokeWidth="1"
                    />
                    <text
                        x={padL - 7}
                        y={yAt(t) + 4}
                        textAnchor="end"
                        fontSize="11.5"
                        fill="var(--text-3, #b2b2b8)"
                    >
                        {fmtY(t)}
                    </text>
                </g>
            ))}
            {series.map((s, si) => {
                const pts = s.data.map((v, i) => `${String(xAt(i))},${String(yAt(v))}`);
                const area = `M ${String(xAt(0))},${String(baseY)} L ${pts.join(" L ")} L ${String(xAt(n - 1))},${String(baseY)} Z`;
                return <path key={`a${String(si)}`} d={area} fill={s.color} fillOpacity="0.1" />;
            })}
            {series.map((s, si) => {
                const line =
                    "M " + s.data.map((v, i) => `${String(xAt(i))},${String(yAt(v))}`).join(" L ");
                return (
                    <path
                        key={`l${String(si)}`}
                        d={line}
                        fill="none"
                        stroke={s.color}
                        strokeWidth="1.7"
                        strokeLinejoin="round"
                    />
                );
            })}
            {chart.buckets.map((b, i) => {
                const x = padL + (n === 1 ? 0 : (i / (n - 1)) * plotW);
                const anchor = i === 0 ? "start" : i === n - 1 ? "end" : "middle";
                return (
                    <text
                        key={b.label}
                        x={x}
                        y={totalH - 6}
                        textAnchor={anchor}
                        fontSize="11.5"
                        fill="var(--text-3, #a9a9af)"
                    >
                        {b.label}
                    </text>
                );
            })}
        </svg>
    );
}

function niceYTicks(max: number): number[] {
    if (max <= 0) return [0];
    const step = niceStep(max);
    const ticks: number[] = [];
    for (let v = 0; v <= max; v += step) {
        ticks.push(v);
    }
    if (ticks.length < 2) ticks.push(max);
    return ticks;
}

function niceStep(max: number): number {
    const rough = max / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(Math.max(rough, 1))));
    const norm = rough / mag;
    if (norm <= 1.5) return mag;
    if (norm <= 3.5) return 2 * mag;
    if (norm <= 7.5) return 5 * mag;
    return 10 * mag;
}
