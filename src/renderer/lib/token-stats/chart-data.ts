import type { EChartsOption } from "echarts";
import { bucketize, groupBy, metricValue, sessionRows, sumTokens, topGroups } from "./aggregate";
import { fmtTok, shortDir } from "./format";
import { TOP5_COLORS, colorForTopModel, colorForTopProject, paletteFor } from "./palette";
import type { AgentSessionUsage, Granularity, Metric, XAxis } from "./types";
import type {
    TokenStatsBucket,
    TokenStatsDashboardChartData,
    TokenStatsHeatmapCell,
    TokenStatsHourBucket,
    TokenStatsRollupRow,
    TokenStatsSession,
} from "../../../shared/types/token-stats";

/** A single donut segment. */
export interface DonutSegment {
    name: string;
    value: number;
    itemStyle: { color: string };
    extra?: string;
}

/** Value function: turns a record (or records) into a number for aggregation. */
export type RecordValue = (r: AgentSessionUsage) => number;

export const sumTokensValue: RecordValue = (r) => sumTokens(r);
export const oneValue: RecordValue = () => 1;

/** Build a key→alias resolver so multiple keys collapse into one label. */
export function build_resolver(
    aliases: readonly { alias: string; keys: readonly string[] }[],
): (key: string) => string {
    const map: Record<string, string> = {};
    for (const a of aliases) {
        for (const k of a.keys) map[k] = a.alias;
    }
    return (key) => map[key] ?? key;
}

/** Fixed display colors/labels for the four agents (matches SessionTable chips). */
const AGENT_COLORS: Record<string, string> = {
    "claude-code": "#ffb78a",
    "kimi-code": "#7ee8b0",
    opencode: "#8ad8ff",
    grok: "#b687f0",
};
const AGENT_LABELS: Record<string, string> = {
    "claude-code": "Claude Code",
    "kimi-code": "Kimi Code",
    opencode: "OpenCode",
    grok: "Grok",
};

/** Donut segments comparing token usage across the four agents. */
export function agentSegments(records: AgentSessionUsage[]): DonutSegment[] {
    const totals: Record<string, number> = {
        "claude-code": 0,
        "kimi-code": 0,
        opencode: 0,
        grok: 0,
    };
    for (const r of records) {
        totals[r.agent] = (totals[r.agent] ?? 0) + sumTokens(r);
    }
    return (["claude-code", "kimi-code", "opencode", "grok"] as const)
        .filter((a) => (totals[a] ?? 0) > 0)
        .map((a) => ({
            name: AGENT_LABELS[a] ?? a,
            value: totals[a] ?? 0,
            itemStyle: { color: AGENT_COLORS[a] ?? "#6b7890" },
        }));
}

/** Segments for the cache-hit-rate donut (cache_read / input / cache_write / output). */
export function compositionSegments(records: AgentSessionUsage[]): DonutSegment[] {
    const colors: Record<string, string> = {
        cache_read: "#3ddc97",
        input: "#4cc2ff",
        cache_write: "#ffb454",
        output: "#7c6cf6",
    };
    const totals = {
        cache_read: records.reduce((s, r) => s + r.cache_read_tokens, 0),
        input: records.reduce((s, r) => s + r.input_tokens, 0),
        cache_write: records.reduce((s, r) => s + r.cache_write_tokens, 0),
        output: records.reduce((s, r) => s + r.output_tokens, 0),
    };
    return (Object.keys(totals) as (keyof typeof totals)[])
        .filter((k) => totals[k] > 0)
        .map((k) => ({
            name: k,
            value: totals[k],
            itemStyle: { color: colors[k] ?? "#6b7890" },
        }));
}

/**
 * Build Top5 + "其他" donut segments by model.
 * The "其他" segment carries an `extra` HTML string listing the grouped models,
 * which the donut tooltip formatter appends.
 */
export function modelSegments(
    records: AgentSessionUsage[],
    valFn: RecordValue,
    theme: "dark" | "light",
): DonutSegment[] {
    const byModel = groupBy(records, (r) => r.model);
    const totals: Record<string, number> = {};
    for (const [model, rs] of Object.entries(byModel)) {
        totals[model] = rs.reduce((sum, r) => sum + valFn(r), 0);
    }
    const { top, rest } = topGroups(totals, 5);
    const palette = paletteFor(theme);
    const segs: DonutSegment[] = top.map((m, i) => ({
        name: m,
        value: totals[m] ?? 0,
        itemStyle: { color: colorForTopModel(m, i, theme) },
    }));
    if (rest.length) {
        const restItems = rest
            .map((m) => [m, totals[m] ?? 0] as const)
            .filter(([, v]) => v > 0)
            .sort((a, b) => b[1] - a[1]);
        const restTotal = restItems.reduce((sum, [, v]) => sum + v, 0);
        segs.push({
            name: `其他（${String(rest.length)} 个模型）`,
            value: restTotal,
            itemStyle: { color: palette.other },
            extra:
                restItems
                    .slice(0, 5)
                    .map(
                        ([k, v]) =>
                            `<br/><span style="opacity:.75">· ${escapeHtml(k)}: ${escapeHtml(fmtTok(v))}</span>`,
                    )
                    .join("") +
                (restItems.length > 5
                    ? `<br/><span style="opacity:.5">· 还有 ${String(restItems.length - 5)} 个</span>`
                    : ""),
        });
    }
    return segs;
}

/** Segments for the sessions donut grouped by project (Top5 + 其他). */
export function projectSegments(
    records: AgentSessionUsage[],
    theme: "dark" | "light",
): DonutSegment[] {
    const byDir = groupBy(records, (r) => r.directory ?? "(unknown)");
    const totals: Record<string, number> = {};
    for (const [dir, rs] of Object.entries(byDir)) {
        totals[dir] = new Set(rs.map((r) => r.session_id)).size;
    }
    const { top, rest } = topGroups(totals, 5);
    const palette = paletteFor(theme);
    const segs: DonutSegment[] = top.map((dir, i) => ({
        name: shortDir(dir),
        value: totals[dir] ?? 0,
        itemStyle: { color: colorForTopProject(dir, i, theme) },
    }));
    if (rest.length) {
        const restItems = rest
            .map((d) => [d, totals[d] ?? 0] as const)
            .filter(([, v]) => v > 0)
            .sort((a, b) => b[1] - a[1]);
        const restTotal = restItems.reduce((sum, [, v]) => sum + v, 0);
        segs.push({
            name: `其他（${String(rest.length)} 个项目）`,
            value: restTotal,
            itemStyle: { color: palette.other },
            extra:
                restItems
                    .slice(0, 5)
                    .map(
                        ([k, v]) =>
                            `<br/><span style="opacity:.75">· ${escapeHtml(shortDir(k))}: ${escapeHtml(String(v))}</span>`,
                    )
                    .join("") +
                (restItems.length > 5
                    ? `<br/><span style="opacity:.5">· 还有 ${String(restItems.length - 5)} 个</span>`
                    : ""),
        });
    }
    return segs;
}

/** Prepared data for the stacked bar chart. */
export interface BarData {
    labels: string[];
    bucketStarts: number[];
    seriesNames: string[];
    series: { name: string; data: number[]; itemStyle: { color: string } }[];
    otherDetails: [string, number][][];
}

export function prepareBarData(
    records: AgentSessionUsage[],
    metric: Metric,
    xaxis: XAxis,
    gran: Granularity,
    start: number,
    end: number,
    theme: "dark" | "light",
    dirAliases: readonly { alias: string; dirs: readonly string[] }[] = [],
    modelAliases: readonly { alias: string; models: readonly string[] }[] = [],
): BarData {
    const colorDim: "model" | "project" = metric === "sessions" ? "project" : "model";
    const dir_resolver = build_resolver(dirAliases.map((a) => ({ alias: a.alias, keys: a.dirs })));
    const model_resolver = build_resolver(
        modelAliases.map((a) => ({ alias: a.alias, keys: a.models })),
    );
    const dir_key = (r: AgentSessionUsage) => dir_resolver(r.directory ?? "(unknown)");
    const keyOf = (r: AgentSessionUsage) =>
        colorDim === "model" ? model_resolver(r.model) : dir_key(r);

    let labels: string[] = [];
    let bucket_starts: number[] = [];
    let idxOf: (r: AgentSessionUsage) => number;

    if (xaxis === "time") {
        const bk = bucketize(start, end, gran);
        labels = Array.from({ length: bk.n }, (_, i) => bk.label(i));
        bucket_starts = Array.from({ length: bk.n }, (_, i) => bk.startOf(i));
        idxOf = (r) => bk.idx(r.timestamp);
    } else if (xaxis === "project") {
        const dirs = Object.entries(groupBy(records, dir_key))
            .map(([k, rs]) => [k, metricValue(rs, metric)] as const)
            .sort((a, b) => b[1] - a[1])
            .map(([k]) => k);
        labels = dirs.map((d) => shortDir(d));
        idxOf = (r) => dirs.indexOf(dir_key(r));
    } else {
        const rows = sessionRows(records)
            .sort((a, b) => b.tokens - a.tokens)
            .slice(0, 20);
        labels = rows.map((r) => {
            const t = r.title;
            return t.length > 7 ? `${t.slice(0, 7)}…` : t;
        });
        idxOf = (r) => rows.findIndex((x) => x.session_id === r.session_id);
    }

    const n = labels.length;
    const cells: Record<string, number>[] = Array.from({ length: n }, () => ({}));
    const sessionSets: Record<string, Set<string>>[] = Array.from({ length: n }, () => ({}));

    for (const r of records) {
        const ci = idxOf(r);
        if (ci < 0 || ci >= n) continue;
        const cell = cells[ci];
        const sessionSet = sessionSets[ci];
        if (!cell || !sessionSet) continue;
        const k = keyOf(r);
        if (metric === "sessions") {
            (sessionSet[k] ??= new Set()).add(r.session_id);
        } else {
            cell[k] = (cell[k] ?? 0) + (metric === "tokens" ? sumTokens(r) : 1);
        }
    }

    if (metric === "sessions") {
        sessionSets.forEach((m, ci) => {
            const cell = cells[ci];
            if (!cell) return;
            Object.entries(m).forEach(([k, set]) => {
                cell[k] = set.size;
            });
        });
    }

    const totals: Record<string, number> = {};
    cells.forEach((m) => {
        Object.entries(m).forEach(([k, v]) => {
            totals[k] = (totals[k] ?? 0) + v;
        });
    });
    const { top, rest } = topGroups(totals, 5);
    const restSet = new Set(rest);
    const palette = paletteFor(theme);
    const seriesNames = rest.length ? [...top, "其他"] : top;
    const otherDetails: [string, number][][] = cells.map((m) =>
        Object.entries(m)
            .filter(([k]) => restSet.has(k))
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, 20),
    );

    const colorOf = (k: string, index: number) =>
        k === "其他"
            ? palette.other
            : colorDim === "model"
              ? colorForTopModel(k, index, theme)
              : colorForTopProject(k, index, theme);

    const series = seriesNames.map((nm, i) => ({
        name: nm,
        data: cells.map((m) =>
            Object.entries(m).reduce(
                (sum, [k, v]) => sum + (displayKey(k, restSet) === nm ? v : 0),
                0,
            ),
        ),
        itemStyle: { color: colorOf(nm, i) },
    }));

    return { labels, bucketStarts: bucket_starts, seriesNames, series, otherDetails };
}

/**
 * Time-axis bar data from pre-aggregated buckets (day granularity). Used for
 * >=7d windows where per-message records exceed the fetch LIMIT (7d ~ 137k
 * rows). Buckets are already day+model grouped, so this just lays them out on
 * a date axis. `gran` must be "day" for buckets (hourly needs records).
 */
export function prepareBarDataFromBuckets(
    buckets: TokenStatsBucket[],
    metric: Metric,
    start: number,
    end: number,
    theme: "dark" | "light",
): BarData {
    // Build the full day axis from the window (UTC dates, matching bucket_date).
    const dates: string[] = [];
    const cursor = new Date(start);
    cursor.setUTCHours(0, 0, 0, 0);
    const end_day = new Date(end);
    end_day.setUTCHours(23, 59, 59, 999);
    while (cursor.getTime() <= end_day.getTime()) {
        const y = cursor.getUTCFullYear();
        const m = String(cursor.getUTCMonth() + 1).padStart(2, "0");
        const d = String(cursor.getUTCDate()).padStart(2, "0");
        dates.push(`${String(y)}-${m}-${d}`);
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    const labels = dates.map((d) => {
        const parts = d.split("-");
        const mm = parts[1] ?? "00";
        const dd = parts[2] ?? "00";
        return `${mm}/${dd}`;
    });

    // cells[date_idx][model] = aggregated value
    const cells: Record<string, number>[] = Array.from({ length: dates.length }, () => ({}));
    const date_idx = new Map(dates.map((d, i) => [d, i]));

    for (const b of buckets) {
        const ci = date_idx.get(b.bucket_date);
        if (ci === undefined) continue;
        const cell = cells[ci];
        if (!cell) continue;
        const v =
            metric === "tokens" ? bucket_tokens(b) : metric === "calls" ? b.calls : b.sessions;
        cell[b.model] = (cell[b.model] ?? 0) + v;
    }

    return { labels, bucketStarts: [], ...cells_to_bar_data(cells, theme) };
}

/**
 * Time-axis bar data from pre-aggregated hour buckets (t173). Used for >=7d
 * windows at hour granularity, where per-message records exceed the fetch LIMIT
 * (query_records truncates early hours). `hour_start` aligns with the
 * renderer's bucketize hour boundaries; the axis is zero-filled so every hour
 * of the window is present.
 */
export function prepareBarDataFromHourBuckets(
    buckets: TokenStatsHourBucket[],
    metric: Metric,
    start: number,
    end: number,
    theme: "dark" | "light",
): BarData {
    const bk = bucketize(start, end, "hour");
    const n = bk.n;
    const cells: Record<string, number>[] = Array.from({ length: n }, () => ({}));

    // bucketize.idx clamps any ts<=start to 0 and ts>=end to n-1, so a bucket
    // whose whole hour lies outside the window would land in the first/last
    // axis bucket and shift the data one hour. Only buckets whose hour_start
    // falls in the window's whole-hour span are legal (the first window hour
    // may be partial when start is not on the hour, matching the SQL's
    // timestamp>=start filter).
    const first_hour = new Date(start);
    first_hour.setMinutes(0, 0, 0);
    const last_hour = new Date(end);
    last_hour.setMinutes(0, 0, 0);

    for (const b of buckets) {
        if (b.hour_start < first_hour.getTime() || b.hour_start > last_hour.getTime()) continue;
        const ci = bk.idx(b.hour_start);
        if (ci < 0 || ci >= n) continue;
        const cell = cells[ci];
        if (!cell) continue;
        // sessions are per-hour-per-model distinct (same as the day-buckets
        // path); summing across models mirrors that path. Short-window hour
        // bars that still use records dedupe sessions per project instead, so
        // the two sources can differ when one session spans models in an hour.
        const v = metric === "tokens" ? b.tokens : metric === "calls" ? b.calls : b.sessions;
        cell[b.model] = (cell[b.model] ?? 0) + v;
    }

    return {
        labels: Array.from({ length: n }, (_, i) => bk.label(i)),
        bucketStarts: Array.from({ length: n }, (_, i) => bk.startOf(i)),
        ...cells_to_bar_data(cells, theme),
    };
}

/** Shared "Top5 + 其他" series derivation for pre-aggregated cell grids. */
function cells_to_bar_data(
    cells: Record<string, number>[],
    theme: "dark" | "light",
): Pick<BarData, "seriesNames" | "series" | "otherDetails"> {
    const totals: Record<string, number> = {};
    cells.forEach((c) => {
        Object.entries(c).forEach(([k, v]) => {
            totals[k] = (totals[k] ?? 0) + v;
        });
    });
    const { top, rest } = topGroups(totals, 5);
    const restSet = new Set(rest);
    const palette = paletteFor(theme);
    const seriesNames = rest.length ? [...top, "其他"] : top;
    const otherDetails: [string, number][][] = cells.map((c) =>
        Object.entries(c)
            .filter(([k]) => restSet.has(k))
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, 20),
    );
    const colorOf = (k: string, index: number) =>
        k === "其他" ? palette.other : colorForTopModel(k, index, theme);

    const series = seriesNames.map((nm, i) => ({
        name: nm,
        data: cells.map((c) =>
            Object.entries(c).reduce(
                (sum, [k, v]) => sum + (displayKey(k, restSet) === nm ? v : 0),
                0,
            ),
        ),
        itemStyle: { color: colorOf(nm, i) },
    }));

    return { seriesNames, series, otherDetails };
}

function displayKey(key: string, restSet: Set<string>): string {
    return restSet.has(key) ? "其他" : key;
}

/**
 * Build a color map for every model in `records` based on the current metric's
 * Top5 ranking. Models outside the Top5 fall back to the theme "其他" gray so
 * the session table tags stay consistent with the donut / bar highlighting.
 */
export function modelColorMap(
    records: AgentSessionUsage[],
    metric: Metric,
    theme: "dark" | "light",
): Map<string, string> {
    const byModel = groupBy(records, (r) => r.model);
    const totals: Record<string, number> = {};
    for (const [model, rs] of Object.entries(byModel)) {
        totals[model] = metricValue(rs, metric);
    }
    const { top } = topGroups(totals, 5);
    const map = new Map<string, string>();
    const fallback = paletteFor(theme).other;
    top.forEach((m, i) => {
        map.set(m, TOP5_COLORS[i] ?? fallback);
    });
    return map;
}

export function escapeHtml(text: string): string {
    return text.replace(/[&<>'"]/g, (c) =>
        c === "&"
            ? "&amp;"
            : c === "<"
              ? "&lt;"
              : c === ">"
                ? "&gt;"
                : c === '"'
                  ? "&quot;"
                  : "&#39;",
    );
}

/** 7 (days) x 24 (hours) heatmap data. */
export interface HeatData {
    data: [number, number, number][];
    max: number;
    /** 7 octile boundaries (p12.5..p87.5) splitting positive values into 8 bands. */
    quantiles: number[];
}

export function prepareHeatmapData(records: AgentSessionUsage[], metric: Metric): HeatData {
    const grid: number[][] = Array.from({ length: 7 }, (): number[] =>
        Array.from({ length: 24 }, () => 0),
    );
    const sets: Set<string>[][] = Array.from({ length: 7 }, (): Set<string>[] =>
        Array.from({ length: 24 }, () => new Set<string>()),
    );
    for (const r of records) {
        const d = new Date(r.timestamp);
        const w = (d.getDay() + 6) % 7;
        const h = d.getHours();
        const row = grid[w];
        if (!row) continue;
        if (metric === "tokens") row[h] = (row[h] ?? 0) + sumTokens(r);
        else if (metric === "calls") row[h] = (row[h] ?? 0) + 1;
        else {
            const setRow = sets[w];
            if (!setRow) continue;
            (setRow[h] ??= new Set()).add(r.session_id);
        }
    }
    if (metric === "sessions") {
        sets.forEach((row, w) => {
            row.forEach((s, h) => {
                const gridRow = grid[w];
                if (gridRow) gridRow[h] = s.size;
            });
        });
    }
    return build_heat_data(grid);
}

/** Turn a filled 7x24 grid into ECharts heatmap data + octile bands. */
function build_heat_data(grid: number[][]): HeatData {
    const data: [number, number, number][] = [];
    let max = 1;
    grid.forEach((row, w) => {
        row.forEach((v, h) => {
            data.push([h, w, v]);
            if (v > max) max = v;
        });
    });
    // 8 bands: zero renders as background (no piece covers it, see s014);
    // positive values split into 8 equal-count bands by octile, so each band
    // carries roughly the same number of cells and boundaries track the
    // window's distribution rather than fixed thresholds (t205 AC3).
    const nonzero = data
        .map((d) => d[2])
        .filter((v) => v > 0)
        .sort((a, b) => a - b);
    const quantile = (arr: number[], p: number): number => {
        if (arr.length === 0) return 0;
        const idx = (p / 100) * (arr.length - 1);
        const lo = Math.floor(idx);
        const hi = Math.ceil(idx);
        const vlo = arr[lo] ?? 0;
        const vhi = arr[hi] ?? 0;
        if (lo === hi) return vlo;
        return Math.floor(vlo + (vhi - vlo) * (idx - lo));
    };
    // 7 interior octile boundaries: p12.5, p25, ..., p87.5.
    const quantiles = Array.from({ length: 7 }, (_, i) => quantile(nonzero, 12.5 + i * 12.5));
    return { data, max, quantiles };
}

/**
 * Build heatmap data from the backend's weekday×hour aggregate (t170).
 * `weekday` follows strftime('%w'): 0=Sunday, mapped to the Monday-first
 * grid with `(weekday + 6) % 7` — matching prepareHeatmapData's getDay() map.
 */
export function prepareHeatmapFromCells(cells: TokenStatsHeatmapCell[], metric: Metric): HeatData {
    const grid: number[][] = Array.from({ length: 7 }, (): number[] =>
        Array.from({ length: 24 }, () => 0),
    );
    for (const c of cells) {
        const row = grid[(c.weekday + 6) % 7];
        if (!row) continue;
        const v = metric === "tokens" ? c.tokens : metric === "calls" ? c.calls : c.sessions;
        row[c.hour] = (row[c.hour] ?? 0) + v;
    }
    return build_heat_data(grid);
}

/** Minimal re-export of EChartsOption for convenience. */
export type { EChartsOption };

// --- buckets-based aggregates (t164) ---
//
// These mirror the records-based segment/KPI functions but consume the
// pre-aggregated `token_stats_buckets` rows (one row per source/env/date/model
// with summed token components). The renderer reduces ~hundreds of rows here
// instead of hundreds of thousands of per-message records.

/** Sum the four token components on a single bucket row. */
function bucket_tokens(b: TokenStatsBucket): number {
    return b.input_tokens + b.output_tokens + b.cache_read_tokens + b.cache_write_tokens;
}

/** Fixed source → agent label/color mapping (mirrors records' AGENT_* maps). */
const BUCKET_AGENT_COLORS: Record<string, string> = {
    claude_code: "#ffb78a",
    opencode: "#8ad8ff",
    kimi_code: "#7ee8b0",
    grok: "#b687f0",
};
const BUCKET_AGENT_LABELS: Record<string, string> = {
    claude_code: "Claude Code",
    opencode: "OpenCode",
    kimi_code: "Kimi Code",
    grok: "Grok",
};

/** Donut segments comparing token usage across agents (source → agent). */
export function agentSegmentsFromBuckets(buckets: TokenStatsBucket[]): DonutSegment[] {
    const totals: Record<string, number> = {
        claude_code: 0,
        opencode: 0,
        kimi_code: 0,
        grok: 0,
    };
    for (const b of buckets) {
        totals[b.source] = (totals[b.source] ?? 0) + bucket_tokens(b);
    }
    return (["claude_code", "opencode", "kimi_code", "grok"] as const)
        .filter((s) => (totals[s] ?? 0) > 0)
        .map((s) => ({
            name: BUCKET_AGENT_LABELS[s] ?? s,
            value: totals[s] ?? 0,
            itemStyle: { color: BUCKET_AGENT_COLORS[s] ?? "#6b7890" },
        }));
}

/** Segments for the cache-hit-rate donut, summed across all buckets. */
export function compositionSegmentsFromBuckets(buckets: TokenStatsBucket[]): DonutSegment[] {
    const colors: Record<string, string> = {
        cache_read: "#3ddc97",
        input: "#4cc2ff",
        cache_write: "#ffb454",
        output: "#7c6cf6",
    };
    const totals = {
        cache_read: buckets.reduce((s, b) => s + b.cache_read_tokens, 0),
        input: buckets.reduce((s, b) => s + b.input_tokens, 0),
        cache_write: buckets.reduce((s, b) => s + b.cache_write_tokens, 0),
        output: buckets.reduce((s, b) => s + b.output_tokens, 0),
    };
    return (Object.keys(totals) as (keyof typeof totals)[])
        .filter((k) => totals[k] > 0)
        .map((k) => ({
            name: k,
            value: totals[k],
            itemStyle: { color: colors[k] ?? "#6b7890" },
        }));
}

/**
 * Top5 + "其他" donut segments by model from buckets. `valFn` selects the
 * per-bucket value to sum (default: token total). Sums across env/date for
 * the same model.
 */
export function modelSegmentsFromBuckets(
    buckets: TokenStatsBucket[],
    theme: "dark" | "light",
    valFn: (b: TokenStatsBucket) => number = bucket_tokens,
): DonutSegment[] {
    const totals: Record<string, number> = {};
    for (const b of buckets) {
        totals[b.model] = (totals[b.model] ?? 0) + valFn(b);
    }
    const { top, rest } = topGroups(totals, 5);
    const palette = paletteFor(theme);
    const segs: DonutSegment[] = top.map((m, i) => ({
        name: m,
        value: totals[m] ?? 0,
        itemStyle: { color: colorForTopModel(m, i, theme) },
    }));
    if (rest.length) {
        const restItems = rest
            .map((m) => [m, totals[m] ?? 0] as const)
            .filter(([, v]) => v > 0)
            .sort((a, b) => b[1] - a[1]);
        const restTotal = restItems.reduce((sum, [, v]) => sum + v, 0);
        segs.push({
            name: `其他（${String(rest.length)} 个模型）`,
            value: restTotal,
            itemStyle: { color: palette.other },
            extra:
                restItems
                    .slice(0, 5)
                    .map(
                        ([k, v]) =>
                            `<br/><span style="opacity:.75">· ${escapeHtml(k)}: ${escapeHtml(fmtTok(v))}</span>`,
                    )
                    .join("") +
                (restItems.length > 5
                    ? `<br/><span style="opacity:.5">· 还有 ${String(restItems.length - 5)} 个</span>`
                    : ""),
        });
    }
    return segs;
}

/** KPI totals (tokens / sessions / calls) summed across buckets. */
export function kpiFromBuckets(buckets: TokenStatsBucket[]): {
    tokens: number;
    sessions: number;
    calls: number;
} {
    let tokens = 0;
    let sessions = 0;
    let calls = 0;
    for (const b of buckets) {
        tokens += bucket_tokens(b);
        sessions += b.sessions;
        calls += b.calls;
    }
    return { tokens, sessions, calls };
}

/**
 * Build a model → color map from buckets' Top5 ranking by `valFn` (default:
 * token total). Mirrors the records-based `modelColorMap(records, metric)`
 * so session-table tags stay consistent with the metric's donut/bar Top5.
 * Models outside Top5 fall back to theme gray.
 */
export function modelColorMapFromBuckets(
    buckets: TokenStatsBucket[],
    theme: "dark" | "light",
    valFn: (b: TokenStatsBucket) => number = bucket_tokens,
): Map<string, string> {
    const totals: Record<string, number> = {};
    for (const b of buckets) {
        totals[b.model] = (totals[b.model] ?? 0) + valFn(b);
    }
    const { top } = topGroups(totals, 5);
    const map = new Map<string, string>();
    const fallback = paletteFor(theme).other;
    top.forEach((m, i) => {
        map.set(m, TOP5_COLORS[i] ?? fallback);
    });
    return map;
}

/**
 * Sessions donut segments by project (directory): counts distinct session ids
 * per directory, Top5 + "其他". Mirrors the records-based `projectSegments`
 * but consumes `token_stats_sessions` rows.
 */
export function projectSegmentsFromSessions(
    sessions: TokenStatsSession[],
    theme: "dark" | "light",
): DonutSegment[] {
    const byDir = new Map<string, Set<string>>();
    for (const s of sessions) {
        const dir = s.directory ?? "(unknown)";
        const set = byDir.get(dir) ?? new Set<string>();
        set.add(s.id);
        byDir.set(dir, set);
    }
    const totals: Record<string, number> = {};
    for (const [dir, set] of byDir) {
        totals[dir] = set.size;
    }
    const { top, rest } = topGroups(totals, 5);
    const palette = paletteFor(theme);
    const segs: DonutSegment[] = top.map((dir, i) => ({
        name: shortDir(dir),
        value: totals[dir] ?? 0,
        itemStyle: { color: colorForTopProject(dir, i, theme) },
    }));
    if (rest.length) {
        const restItems = rest
            .map((d) => [d, totals[d] ?? 0] as const)
            .filter(([, v]) => v > 0)
            .sort((a, b) => b[1] - a[1]);
        const restTotal = restItems.reduce((sum, [, v]) => sum + v, 0);
        segs.push({
            name: `其他（${String(rest.length)} 个项目）`,
            value: restTotal,
            itemStyle: { color: palette.other },
            extra:
                restItems
                    .slice(0, 5)
                    .map(
                        ([k, v]) =>
                            `<br/><span style="opacity:.75">· ${escapeHtml(shortDir(k))}: ${escapeHtml(String(v))}</span>`,
                    )
                    .join("") +
                (restItems.length > 5
                    ? `<br/><span style="opacity:.5">· 还有 ${String(restItems.length - 5)} 个</span>`
                    : ""),
        });
    }
    return segs;
}

// --- rollup-based aggregates (t184) ---
//
// These mirror the records-based segment/KPI/bar functions but consume the
// bounded (source, model, directory, session_id) rows from query_range_rollup.
// The 24h preset uses them so KPI/donut/project/session axes read the complete
// window instead of per-message records, whose ORDER BY DESC LIMIT truncates
// high-density windows (p020). Row count scales with distinct group combos,
// not per-message volume (AC5).

/** Sum the four token components on a single rollup row. */
function rollup_tokens(r: TokenStatsRollupRow): number {
    return r.input_tokens + r.output_tokens + r.cache_read_tokens + r.cache_write_tokens;
}

/** Token total value fn for rollup rows (mirrors sumTokensValue). */
export const sumTokensRollup: (r: TokenStatsRollupRow) => number = (r) => rollup_tokens(r);

/** Calls value fn: one rollup row aggregates calls across its messages. */
export const rollupCallValue: (r: TokenStatsRollupRow) => number = (r) => r.calls;

/** Aggregated metric total for a rollup group (distinct sessions dedupe). */
function rollup_group_metric(rows: TokenStatsRollupRow[], metric: Metric): number {
    if (metric === "tokens") {
        return rows.reduce((s, r) => s + rollup_tokens(r), 0);
    }
    if (metric === "calls") {
        return rows.reduce((s, r) => s + r.calls, 0);
    }
    return new Set(rows.map((r) => r.session_id)).size;
}

/** Fixed source → agent label/color mapping (mirrors BUCKET_AGENT_*). */
const ROLLUP_AGENT_COLORS: Record<string, string> = {
    claude_code: "#ffb78a",
    opencode: "#8ad8ff",
    kimi_code: "#7ee8b0",
    grok: "#b687f0",
};
const ROLLUP_AGENT_LABELS: Record<string, string> = {
    claude_code: "Claude Code",
    opencode: "OpenCode",
    kimi_code: "Kimi Code",
    grok: "Grok",
};

/** Donut segments comparing token usage across agents (source → agent). */
export function agentSegmentsFromRollup(rows: TokenStatsRollupRow[]): DonutSegment[] {
    const totals: Record<string, number> = {
        claude_code: 0,
        opencode: 0,
        kimi_code: 0,
        grok: 0,
    };
    for (const r of rows) {
        totals[r.source] = (totals[r.source] ?? 0) + rollup_tokens(r);
    }
    return (["claude_code", "opencode", "kimi_code", "grok"] as const)
        .filter((s) => (totals[s] ?? 0) > 0)
        .map((s) => ({
            name: ROLLUP_AGENT_LABELS[s] ?? s,
            value: totals[s] ?? 0,
            itemStyle: { color: ROLLUP_AGENT_COLORS[s] ?? "#6b7890" },
        }));
}

/** Segments for the cache-hit-rate donut, summed across all rollup rows. */
export function compositionSegmentsFromRollup(rows: TokenStatsRollupRow[]): DonutSegment[] {
    const colors: Record<string, string> = {
        cache_read: "#3ddc97",
        input: "#4cc2ff",
        cache_write: "#ffb454",
        output: "#7c6cf6",
    };
    const totals = {
        cache_read: rows.reduce((s, r) => s + r.cache_read_tokens, 0),
        input: rows.reduce((s, r) => s + r.input_tokens, 0),
        cache_write: rows.reduce((s, r) => s + r.cache_write_tokens, 0),
        output: rows.reduce((s, r) => s + r.output_tokens, 0),
    };
    return (Object.keys(totals) as (keyof typeof totals)[])
        .filter((k) => totals[k] > 0)
        .map((k) => ({
            name: k,
            value: totals[k],
            itemStyle: { color: colors[k] ?? "#6b7890" },
        }));
}

/** Top5 + "其他" donut segments by model from rollup rows. `valFn` selects the
 * per-row value to sum (default: token total). */
export function modelSegmentsFromRollup(
    rows: TokenStatsRollupRow[],
    valFn: (r: TokenStatsRollupRow) => number,
    theme: "dark" | "light",
): DonutSegment[] {
    const totals: Record<string, number> = {};
    for (const r of rows) {
        totals[r.model] = (totals[r.model] ?? 0) + valFn(r);
    }
    const { top, rest } = topGroups(totals, 5);
    const palette = paletteFor(theme);
    const segs: DonutSegment[] = top.map((m, i) => ({
        name: m,
        value: totals[m] ?? 0,
        itemStyle: { color: colorForTopModel(m, i, theme) },
    }));
    if (rest.length) {
        const restItems = rest
            .map((m) => [m, totals[m] ?? 0] as const)
            .filter(([, v]) => v > 0)
            .sort((a, b) => b[1] - a[1]);
        const restTotal = restItems.reduce((sum, [, v]) => sum + v, 0);
        segs.push({
            name: `其他（${String(rest.length)} 个模型）`,
            value: restTotal,
            itemStyle: { color: palette.other },
            extra:
                restItems
                    .slice(0, 5)
                    .map(
                        ([k, v]) =>
                            `<br/><span style="opacity:.75">· ${escapeHtml(k)}: ${escapeHtml(fmtTok(v))}</span>`,
                    )
                    .join("") +
                (restItems.length > 5
                    ? `<br/><span style="opacity:.5">· 还有 ${String(restItems.length - 5)} 个</span>`
                    : ""),
        });
    }
    return segs;
}

/** KPI totals (tokens / distinct sessions / calls) summed across rollup rows. */
export function kpiFromRollup(rows: TokenStatsRollupRow[]): {
    tokens: number;
    sessions: number;
    calls: number;
} {
    let tokens = 0;
    let calls = 0;
    for (const r of rows) {
        tokens += rollup_tokens(r);
        calls += r.calls;
    }
    return { tokens, sessions: new Set(rows.map((r) => r.session_id)).size, calls };
}

/** Cache hit rate: cache_read / (cache_read + input), summed across rows. */
export function hitRateOfRollup(rows: TokenStatsRollupRow[]): number {
    const cr = rows.reduce((sum, r) => sum + r.cache_read_tokens, 0);
    const inp = rows.reduce((sum, r) => sum + r.input_tokens + r.cache_read_tokens, 0);
    return inp ? cr / inp : 0;
}

/**
 * Project/session-axis bar data from rollup rows (24h preset, t184). Mirrors
 * prepareBarData's project/session branches but consumes the bounded SQL
 * aggregate so high-density windows keep their complete top groups instead of
 * the LIMIT-truncated records slice. Time axis is not supported here — the
 * 24h time bar routes through hour buckets.
 */
export function prepareBarDataFromRollup(
    rows: TokenStatsRollupRow[],
    metric: Metric,
    xaxis: XAxis,
    theme: "dark" | "light",
    dirAliases: readonly { alias: string; dirs: readonly string[] }[] = [],
    modelAliases: readonly { alias: string; models: readonly string[] }[] = [],
): BarData {
    const colorDim: "model" | "project" = metric === "sessions" ? "project" : "model";
    const dir_resolver = build_resolver(dirAliases.map((a) => ({ alias: a.alias, keys: a.dirs })));
    const model_resolver = build_resolver(
        modelAliases.map((a) => ({ alias: a.alias, keys: a.models })),
    );
    const dir_key = (r: TokenStatsRollupRow) => dir_resolver(r.directory ?? "(unknown)");
    const keyOf = (r: TokenStatsRollupRow) =>
        colorDim === "model" ? model_resolver(r.model) : dir_key(r);

    let labels: string[] = [];
    let idxOf: (r: TokenStatsRollupRow) => number;

    if (xaxis === "project") {
        const dirs = Object.entries(groupBy(rows, dir_key))
            .map(([k, rs]) => [k, rollup_group_metric(rs, metric)] as const)
            .sort((a, b) => b[1] - a[1])
            .map(([k]) => k);
        labels = dirs.map((d) => shortDir(d));
        idxOf = (r) => dirs.indexOf(dir_key(r));
    } else {
        // Session axis: a session spans multiple rollup rows when it uses
        // several models; merge per session_id, rank by token total, top 20.
        const ranked = Object.entries(groupBy(rows, (r) => r.session_id))
            .map(([session_id, rs]) => ({
                session_id,
                title: rs[0]?.title ?? "",
                tokens: rs.reduce((sum, r) => sum + rollup_tokens(r), 0),
            }))
            .sort((a, b) => b.tokens - a.tokens)
            .slice(0, 20);
        labels = ranked.map((s) => {
            const t = s.title;
            return t.length > 7 ? `${t.slice(0, 7)}…` : t;
        });
        idxOf = (r) => ranked.findIndex((s) => s.session_id === r.session_id);
    }

    const n = labels.length;
    const cells: Record<string, number>[] = Array.from({ length: n }, () => ({}));
    const sessionSets: Record<string, Set<string>>[] = Array.from({ length: n }, () => ({}));

    for (const r of rows) {
        const ci = idxOf(r);
        if (ci < 0 || ci >= n) continue;
        const cell = cells[ci];
        const sessionSet = sessionSets[ci];
        if (!cell || !sessionSet) continue;
        const k = keyOf(r);
        if (metric === "sessions") {
            (sessionSet[k] ??= new Set()).add(r.session_id);
        } else {
            cell[k] = (cell[k] ?? 0) + (metric === "tokens" ? rollup_tokens(r) : r.calls);
        }
    }
    if (metric === "sessions") {
        sessionSets.forEach((m, ci) => {
            const cell = cells[ci];
            if (!cell) return;
            Object.entries(m).forEach(([k, set]) => {
                cell[k] = set.size;
            });
        });
    }

    const totals: Record<string, number> = {};
    cells.forEach((m) => {
        Object.entries(m).forEach(([k, v]) => {
            totals[k] = (totals[k] ?? 0) + v;
        });
    });
    const { top, rest } = topGroups(totals, 5);
    const restSet = new Set(rest);
    const palette = paletteFor(theme);
    const seriesNames = rest.length ? [...top, "其他"] : top;
    const otherDetails: [string, number][][] = cells.map((m) =>
        Object.entries(m)
            .filter(([k]) => restSet.has(k))
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, 20),
    );
    const colorOf = (k: string, index: number) =>
        k === "其他"
            ? palette.other
            : colorDim === "model"
              ? colorForTopModel(k, index, theme)
              : colorForTopProject(k, index, theme);

    const series = seriesNames.map((nm, i) => ({
        name: nm,
        data: cells.map((m) =>
            Object.entries(m).reduce(
                (sum, [k, v]) => sum + (displayKey(k, restSet) === nm ? v : 0),
                0,
            ),
        ),
        itemStyle: { color: colorOf(nm, i) },
    }));

    return { labels, bucketStarts: [], seriesNames, series, otherDetails };
}

/**
 * Derive the project/session axis bar from the bounded rollup rows (t200),
 * mirroring the server's dashboard_chart_from_rollup exactly so the renderer
 * output equals the pre-t200 server chart. Session-axis labels use the raw
 * title (not truncated); series keys are alias-resolved; top 20 + "其他".
 */
export function prepareBarDataFromDashboardRollup(
    rows: TokenStatsRollupRow[],
    metric: Metric,
    xaxis: XAxis,
    theme: "dark" | "light",
    dirAliases: readonly { alias: string; dirs: readonly string[] }[] = [],
    modelAliases: readonly { alias: string; models: readonly string[] }[] = [],
): BarData {
    const value_of = (row: TokenStatsRollupRow): number =>
        metric === "tokens"
            ? row.input_tokens + row.output_tokens + row.cache_read_tokens + row.cache_write_tokens
            : metric === "calls"
              ? row.calls
              : 1;
    const directory_resolver = build_resolver(
        dirAliases.map((a) => ({ alias: a.alias, keys: a.dirs })),
    );
    const model_resolver = build_resolver(
        modelAliases.map((a) => ({ alias: a.alias, keys: a.models })),
    );
    const session_key = (row: TokenStatsRollupRow): string =>
        `${row.source}|${row.env}|${row.session_id}`;
    const category_of = (row: TokenStatsRollupRow): string =>
        xaxis === "project" ? directory_resolver(row.directory ?? "(unknown)") : session_key(row);
    const category_totals = new Map<string, number>();
    const category_sessions = new Map<string, Set<string>>();
    for (const row of rows) {
        const category = category_of(row);
        if (metric === "sessions") {
            const sessions = category_sessions.get(category) ?? new Set<string>();
            sessions.add(session_key(row));
            category_sessions.set(category, sessions);
        } else {
            category_totals.set(category, (category_totals.get(category) ?? 0) + value_of(row));
        }
    }
    if (metric === "sessions") {
        for (const [category, sessions] of category_sessions) {
            category_totals.set(category, sessions.size);
        }
    }
    const ranked_categories = [...category_totals.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 20)
        .map(([category]) => category);
    const category_set = new Set(ranked_categories);
    const labels = ranked_categories.map((category) =>
        xaxis === "session"
            ? (rows.find((row) => category_of(row) === category)?.title ?? "")
            : category,
    );
    const cells: Record<string, number>[] = ranked_categories.map(() => ({}));
    const session_cells: Record<string, Set<string>>[] = ranked_categories.map(() => ({}));
    const other_index = ranked_categories.length < category_totals.size ? cells.length : -1;
    if (other_index >= 0) {
        labels.push("其他");
        cells.push({});
        session_cells.push({});
    }
    for (const row of rows) {
        const raw_category = category_of(row);
        const index = category_set.has(raw_category)
            ? ranked_categories.indexOf(raw_category)
            : other_index;
        if (index < 0) continue;
        const cell = cells[index];
        if (!cell) continue;
        const key =
            metric === "sessions"
                ? directory_resolver(row.directory ?? "(unknown)")
                : model_resolver(row.model);
        if (metric === "sessions") {
            const session_cell = session_cells[index];
            if (!session_cell) continue;
            const sessions = session_cell[key] ?? new Set<string>();
            sessions.add(session_key(row));
            session_cell[key] = sessions;
        } else {
            cell[key] = (cell[key] ?? 0) + value_of(row);
        }
    }
    if (metric === "sessions") {
        session_cells.forEach((session_cell, index) => {
            const cell = cells[index];
            if (!cell) return;
            for (const [key, sessions] of Object.entries(session_cell)) cell[key] = sessions.size;
        });
    }
    return { labels, bucketStarts: [], ...cells_to_bar_data(cells, theme) };
}

/**
 * Derive the bar chart from the metric/xaxis-agnostic dashboard chart source
 * (t200). For the time axis the server-built `axis` maps metric/session buckets
 * onto the exact buckets the server used; for the project/session axes the
 * bounded rollup rows are derived via prepareBarDataFromDashboardRollup. The
 * result equals the pre-t200 server chart for every metric/xaxis/gran combo.
 */
export function prepareBarDataFromDashboardChartData(
    chart_data: TokenStatsDashboardChartData,
    metric: Metric,
    xaxis: XAxis,
    theme: "dark" | "light",
    dirAliases: readonly { alias: string; dirs: readonly string[] }[] = [],
    modelAliases: readonly { alias: string; models: readonly string[] }[] = [],
): BarData {
    if (xaxis !== "time") {
        return prepareBarDataFromDashboardRollup(
            chart_data.rollup,
            metric,
            xaxis,
            theme,
            dirAliases,
            modelAliases,
        );
    }
    const { labels, bucket_starts } = chart_data.axis;
    const dir_resolver = build_resolver(dirAliases.map((a) => ({ alias: a.alias, keys: a.dirs })));
    const model_resolver = build_resolver(
        modelAliases.map((a) => ({ alias: a.alias, keys: a.models })),
    );
    const index_of = (timestamp: number): number => {
        let low = 0;
        let high = bucket_starts.length;
        while (low < high) {
            const mid = Math.floor((low + high) / 2);
            if ((bucket_starts[mid] ?? 0) <= timestamp) low = mid + 1;
            else high = mid;
        }
        return Math.max(0, low - 1);
    };
    const cells: Record<string, number>[] = bucket_starts.map(() => ({}));
    if (metric === "sessions") {
        for (const bucket of chart_data.session_buckets) {
            const cell = cells[index_of(bucket.hour_start)];
            if (!cell) continue;
            const key = dir_resolver(bucket.directory);
            cell[key] = (cell[key] ?? 0) + bucket.sessions;
        }
    } else {
        for (const bucket of chart_data.metric_buckets) {
            const cell = cells[index_of(bucket.hour_start)];
            if (!cell) continue;
            const key = model_resolver(bucket.model);
            cell[key] = (cell[key] ?? 0) + (metric === "tokens" ? bucket.tokens : bucket.calls);
        }
    }
    return { labels, bucketStarts: bucket_starts, ...cells_to_bar_data(cells, theme) };
}
