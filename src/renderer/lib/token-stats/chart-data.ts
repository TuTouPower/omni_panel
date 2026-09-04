import type { EChartsOption } from "echarts";
import { bucketize, groupBy, metricValue, sessionRows, sumTokens, topGroups } from "./aggregate";
import { fmtTok, shortDir } from "./format";
import { utc8_date_str, utc8_day_start, utc8_hour, utc8_weekday } from "./utc8";
import { agent_color, palette_for, top_category_color } from "../echarts_token_resolver";
import type { ChartTheme } from "../echarts_token_resolver";
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

/** Fixed display labels for the five agents (matches SessionTable chips). */
const AGENT_LABELS: Record<string, string> = {
    "claude-code": "Claude Code",
    "kimi-code": "Kimi Code",
    opencode: "OpenCode",
    grok: "Grok",
    codex: "Codex",
};

/** Agent（dash 键）→ 展示名单一来源（t448：会话表 Badge 与 donut 共用，防再次分叉）。 */
export function agentDisplayLabel(agent: string): string {
    return AGENT_LABELS[agent] ?? agent;
}

/** Donut segments comparing token usage across the four agents. */
export function agentSegments(
    records: AgentSessionUsage[],
    theme: ChartTheme = "dark",
): DonutSegment[] {
    const totals: Record<string, number> = {};
    for (const r of records) {
        totals[r.agent] = (totals[r.agent] ?? 0) + sumTokens(r);
    }
    return agent_segments(
        totals,
        ["claude-code", "kimi-code", "opencode", "grok", "codex"],
        AGENT_LABELS,
        theme,
    );
}

/** Segments for the cache-hit-rate donut (cache_read / input / cache_write / output). */
export function compositionSegments(
    records: AgentSessionUsage[],
    theme: ChartTheme = "dark",
): DonutSegment[] {
    const totals = {
        cache_read: records.reduce((s, r) => s + r.cache_read_tokens, 0),
        input: records.reduce((s, r) => s + r.input_tokens, 0),
        cache_write: records.reduce((s, r) => s + r.cache_write_tokens, 0),
        output: records.reduce((s, r) => s + r.output_tokens, 0),
    };
    return composition_segments(totals, theme);
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
    return top_segments(totals, theme, { restLabel: "模型", fmt_value: fmtTok });
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
    return top_segments(totals, theme, {
        restLabel: "项目",
        fmt_value: (v) => String(v),
        shorten: shortDir,
    });
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
        // t349 AC-003: 预构建 dir→index Map，避免逐行 indexOf 线性扫描。
        const dir_idx = new Map(dirs.map((d, i) => [d, i]));
        idxOf = (r) => dir_idx.get(dir_key(r)) ?? -1;
    } else {
        const rows = sessionRows(records)
            .sort((a, b) => b.tokens - a.tokens)
            .slice(0, 20);
        labels = rows.map((r) => {
            const t = r.title;
            return t.length > 7 ? `${t.slice(0, 7)}…` : t;
        });
        // t349 AC-003: 预构建 session_id→index Map，避免 findIndex 线性扫描。
        const session_idx = new Map(rows.map((r, i) => [r.session_id, i]));
        idxOf = (r) => session_idx.get(r.session_id) ?? -1;
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
    const palette = palette_for(theme);
    const seriesNames = rest.length ? [...top, "其他"] : top;
    const otherDetails: [string, number][][] = cells.map((m) =>
        Object.entries(m)
            .filter(([k]) => restSet.has(k))
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, 20),
    );

    const colorOf = (k: string, index: number) =>
        k === "其他" ? palette.other : top_category_color(index, theme);

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
    // t348: 日轴按 UTC+8 建（bucket_date 是 UTC+8 日期）。循环覆盖 [start, end)
    // 内全部 UTC+8 日；end 非日界时含 end 当天（utc8_day_start(end-1) 取 end
    // 所属日的日界，reviewer f007）。
    const dates: string[] = [];
    let cursor = utc8_day_start(start);
    const end_day = utc8_day_start(end - 1);
    while (cursor <= end_day) {
        dates.push(utc8_date_str(cursor));
        cursor += 86_400_000;
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
    const palette = palette_for(theme);
    const seriesNames = rest.length ? [...top, "其他"] : top;
    const otherDetails: [string, number][][] = cells.map((c) =>
        Object.entries(c)
            .filter(([k]) => restSet.has(k))
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, 20),
    );
    const colorOf = (k: string, index: number) =>
        k === "其他" ? palette.other : top_category_color(index, theme);

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
    top.forEach((m, i) => {
        map.set(m, top_category_color(i, theme));
    });
    return map;
}

// --- t349: 公共 donut segment 生成器（收敛 records/buckets/rollup 镜像） ---

/** Top5 + "其他" segment 生成器。`restLabel` 区分「模型/项目」，`fmt_value`
 * 控制 extra 里的值格式，`shorten` 可选（项目名缩短）。 */
function top_segments(
    totals: Record<string, number>,
    theme: "dark" | "light",
    opts: {
        restLabel: string;
        fmt_value: (v: number) => string;
        shorten?: (k: string) => string;
    },
): DonutSegment[] {
    const { top, rest } = topGroups(totals, 5);
    const palette = palette_for(theme);
    const segs: DonutSegment[] = top.map((k, i) => ({
        name: opts.shorten ? opts.shorten(k) : k,
        value: totals[k] ?? 0,
        itemStyle: { color: top_category_color(i, theme) },
    }));
    if (rest.length) {
        const restItems = rest
            .map((k) => [k, totals[k] ?? 0] as const)
            .filter(([, v]) => v > 0)
            .sort((a, b) => b[1] - a[1]);
        const restTotal = restItems.reduce((sum, [, v]) => sum + v, 0);
        const show = (k: string) => (opts.shorten ? opts.shorten(k) : k);
        segs.push({
            name: `其他（${String(rest.length)} 个${opts.restLabel}）`,
            value: restTotal,
            itemStyle: { color: palette.other },
            extra:
                restItems
                    .slice(0, 5)
                    .map(
                        ([k, v]) =>
                            `<br/><span style="opacity:.75">· ${escapeHtml(show(k))}: ${escapeHtml(opts.fmt_value(v))}</span>`,
                    )
                    .join("") +
                (restItems.length > 5
                    ? `<br/><span style="opacity:.5">· 还有 ${String(restItems.length - 5)} 个</span>`
                    : ""),
        });
    }
    return segs;
}

/** Cache-hit-rate donut（composition）生成器，收敛三套逐字镜像。 */
function composition_segments(
    totals: { cache_read: number; input: number; cache_write: number; output: number },
    theme: ChartTheme,
): DonutSegment[] {
    const palette = palette_for(theme);
    return (Object.keys(totals) as (keyof typeof totals)[])
        .filter((k) => totals[k] > 0)
        .map((k) => ({
            name: k,
            value: totals[k],
            itemStyle: { color: palette.composition[k] ?? palette.other },
        }));
}

/** Agent donut 生成器：totals 已按 agent/source 聚合，labels 按数据源选。 */
function agent_segments(
    totals: Record<string, number>,
    order: readonly string[],
    labels: Record<string, string>,
    theme: ChartTheme,
): DonutSegment[] {
    return order
        .filter((a) => (totals[a] ?? 0) > 0)
        .map((a) => ({
            name: labels[a] ?? a,
            value: totals[a] ?? 0,
            itemStyle: { color: agent_color(a, theme) },
        }));
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
        // t348: 热力图按 UTC+8 归周/小时（服务端聚合口径），非系统时区。
        const w = (utc8_weekday(r.timestamp) + 6) % 7;
        const h = utc8_hour(r.timestamp);
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
 * grid with `(weekday + 6) % 7` — matching prepareHeatmapData's utc8_weekday map.
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

/** Fixed source → agent label mapping (mirrors records' AGENT_* maps). */
const BUCKET_AGENT_LABELS: Record<string, string> = {
    claude_code: "Claude Code",
    opencode: "OpenCode",
    kimi_code: "Kimi Code",
    grok: "Grok",
    codex: "Codex",
};

/** Donut segments comparing token usage across agents (source → agent). */
export function agentSegmentsFromBuckets(
    buckets: TokenStatsBucket[],
    theme: ChartTheme = "dark",
): DonutSegment[] {
    const totals: Record<string, number> = {};
    for (const b of buckets) {
        totals[b.source] = (totals[b.source] ?? 0) + bucket_tokens(b);
    }
    return agent_segments(
        totals,
        ["claude_code", "opencode", "kimi_code", "grok", "codex"],
        BUCKET_AGENT_LABELS,
        theme,
    );
}

/** Segments for the cache-hit-rate donut, summed across all buckets. */
export function compositionSegmentsFromBuckets(
    buckets: TokenStatsBucket[],
    theme: ChartTheme = "dark",
): DonutSegment[] {
    const totals = {
        cache_read: buckets.reduce((s, b) => s + b.cache_read_tokens, 0),
        input: buckets.reduce((s, b) => s + b.input_tokens, 0),
        cache_write: buckets.reduce((s, b) => s + b.cache_write_tokens, 0),
        output: buckets.reduce((s, b) => s + b.output_tokens, 0),
    };
    return composition_segments(totals, theme);
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
    return top_segments(totals, theme, { restLabel: "模型", fmt_value: fmtTok });
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
    top.forEach((m, i) => {
        map.set(m, top_category_color(i, theme));
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
    return top_segments(totals, theme, {
        restLabel: "项目",
        fmt_value: (v) => String(v),
        shorten: shortDir,
    });
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

/** Session identity key for rollup rows（p052/t217：跨 env 同 session_id 不合并；
 * t349：提为导出供 KPI 复用）。 */
export function rollup_session_key(r: TokenStatsRollupRow): string {
    return `${r.source}|${r.env}|${r.session_id}`;
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
    return new Set(rows.map((r) => rollup_session_key(r))).size;
}

/** Fixed source → agent label mapping (mirrors BUCKET_AGENT_*). */
const ROLLUP_AGENT_LABELS: Record<string, string> = {
    claude_code: "Claude Code",
    opencode: "OpenCode",
    kimi_code: "Kimi Code",
    grok: "Grok",
    codex: "Codex",
};

/** Donut segments comparing token usage across agents (source → agent). */
export function agentSegmentsFromRollup(
    rows: TokenStatsRollupRow[],
    theme: ChartTheme = "dark",
): DonutSegment[] {
    const totals: Record<string, number> = {};
    for (const r of rows) {
        totals[r.source] = (totals[r.source] ?? 0) + rollup_tokens(r);
    }
    return agent_segments(
        totals,
        ["claude_code", "opencode", "kimi_code", "grok", "codex"],
        ROLLUP_AGENT_LABELS,
        theme,
    );
}

/** Segments for the cache-hit-rate donut, summed across all rollup rows. */
export function compositionSegmentsFromRollup(
    rows: TokenStatsRollupRow[],
    theme: ChartTheme = "dark",
): DonutSegment[] {
    const totals = {
        cache_read: rows.reduce((s, r) => s + r.cache_read_tokens, 0),
        input: rows.reduce((s, r) => s + r.input_tokens, 0),
        cache_write: rows.reduce((s, r) => s + r.cache_write_tokens, 0),
        output: rows.reduce((s, r) => s + r.output_tokens, 0),
    };
    return composition_segments(totals, theme);
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
    return top_segments(totals, theme, { restLabel: "模型", fmt_value: fmtTok });
}

/** KPI totals (tokens / distinct sessions / calls) summed across rollup rows. */
export function kpiFromRollup(rows: TokenStatsRollupRow[]): {
    tokens: number;
    sessions: number;
    calls: number;
} {
    let tokens = 0;
    let calls = 0;
    const sessions = new Set<string>();
    for (const r of rows) {
        tokens += rollup_tokens(r);
        calls += r.calls;
        // t349 AC-002: 按 source|env|session_id 去重（与 donut/会话轴一致），
        // 裸 session_id 会跨 env 重复计数。
        sessions.add(rollup_session_key(r));
    }
    return { tokens, sessions: sessions.size, calls };
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
        // t396 AC-003: 预构建 dir→index Map，避免逐行 indexOf 线性扫描（对齐 prepareBarData）。
        const dir_idx = new Map(dirs.map((d, i) => [d, i]));
        idxOf = (r) => dir_idx.get(dir_key(r)) ?? -1;
    } else {
        // Session axis: a session spans multiple rollup rows when it uses
        // several models; merge per rollup_session_key（p052：跨 env 同
        // session_id 不合并），rank by token total, top 20.
        const ranked = Object.entries(groupBy(rows, rollup_session_key))
            .map(([key, rs]) => ({
                key,
                title: rs[0]?.title ?? "",
                tokens: rs.reduce((sum, r) => sum + rollup_tokens(r), 0),
            }))
            .sort((a, b) => b.tokens - a.tokens)
            .slice(0, 20);
        labels = ranked.map((s) => {
            const t = s.title;
            return t.length > 7 ? `${t.slice(0, 7)}…` : t;
        });
        // t396 AC-003: 预构建 session key→index Map，避免 findIndex 线性扫描（对齐 prepareBarData）。
        const session_idx = new Map(ranked.map((s, i) => [s.key, i]));
        idxOf = (r) => session_idx.get(rollup_session_key(r)) ?? -1;
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
            (sessionSet[k] ??= new Set()).add(rollup_session_key(r));
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
    const palette = palette_for(theme);
    const seriesNames = rest.length ? [...top, "其他"] : top;
    const otherDetails: [string, number][][] = cells.map((m) =>
        Object.entries(m)
            .filter(([k]) => restSet.has(k))
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, 20),
    );
    const colorOf = (k: string, index: number) =>
        k === "其他" ? palette.other : top_category_color(index, theme);

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
    const category_of = (row: TokenStatsRollupRow): string =>
        xaxis === "project"
            ? directory_resolver(row.directory ?? "(unknown)")
            : rollup_session_key(row);
    const category_totals = new Map<string, number>();
    const category_sessions = new Map<string, Set<string>>();
    for (const row of rows) {
        const category = category_of(row);
        if (metric === "sessions") {
            const sessions = category_sessions.get(category) ?? new Set<string>();
            sessions.add(rollup_session_key(row));
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
            sessions.add(rollup_session_key(row));
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
