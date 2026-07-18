import type { EChartsOption } from "echarts";
import { bucketize, groupBy, metricValue, sessionRows, sumTokens, topGroups } from "./aggregate";
import { shortDir } from "./format";
import { modelColor, paletteFor, projectColor } from "./palette";
import type { AgentSessionUsage, Granularity, Metric, XAxis } from "./types";

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
    const segs: DonutSegment[] = top.map((m) => ({
        name: m,
        value: totals[m] ?? 0,
        itemStyle: { color: modelColor(m, theme) },
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
            extra: restItems
                .map(
                    ([k, v]) =>
                        `<br/><span style="opacity:.75">· ${escapeHtml(k)}: ${escapeHtml(String(v))}</span>`,
                )
                .join(""),
        });
    }
    return segs;
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
    return Object.entries(totals)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => ({
            name: k,
            value: v,
            itemStyle: { color: colors[k] ?? "#6b7890" },
        }));
}

/** Segments for the sessions donut grouped by project. */
export function projectSegments(records: AgentSessionUsage[]): DonutSegment[] {
    const byDir = groupBy(records, (r) => r.directory ?? "(unknown)");
    const segs: DonutSegment[] = [];
    for (const [dir, rs] of Object.entries(byDir)) {
        segs.push({
            name: shortDir(dir),
            value: new Set(rs.map((r) => r.session_id)).size,
            itemStyle: { color: projectColor(dir) },
        });
    }
    return segs.sort((a, b) => b.value - a.value);
}

/** Prepared data for the stacked bar chart. */
export interface BarData {
    labels: string[];
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
): BarData {
    const colorDim: "model" | "project" = metric === "sessions" ? "project" : "model";
    const keyOf = (r: AgentSessionUsage) =>
        colorDim === "model" ? r.model : (r.directory ?? "(unknown)");

    let labels: string[] = [];
    let idxOf: (r: AgentSessionUsage) => number;

    if (xaxis === "time") {
        const bk = bucketize(start, end, gran);
        labels = Array.from({ length: bk.n }, (_, i) => bk.label(i));
        idxOf = (r) => bk.idx(r.timestamp);
    } else if (xaxis === "project") {
        const dirs = Object.entries(groupBy(records, (r) => r.directory ?? "(unknown)"))
            .map(([k, rs]) => [k, metricValue(rs, metric)] as const)
            .sort((a, b) => b[1] - a[1])
            .map(([k]) => k);
        labels = dirs.map((d) => shortDir(d));
        idxOf = (r) => dirs.indexOf(r.directory ?? "(unknown)");
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
            .sort((a, b) => b[1] - a[1]),
    );

    const colorOf = (k: string) =>
        k === "其他"
            ? palette.other
            : colorDim === "model"
              ? modelColor(k, theme)
              : projectColor(k);

    const series = seriesNames.map((nm) => ({
        name: nm,
        data: cells.map((m) =>
            Object.entries(m).reduce(
                (sum, [k, v]) => sum + (displayKey(k, restSet) === nm ? v : 0),
                0,
            ),
        ),
        itemStyle: { color: colorOf(nm) },
    }));

    return { labels, seriesNames, series, otherDetails };
}

function displayKey(key: string, restSet: Set<string>): string {
    return restSet.has(key) ? "其他" : key;
}

function escapeHtml(text: string): string {
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
    const data: [number, number, number][] = [];
    let max = 1;
    grid.forEach((row, w) => {
        row.forEach((v, h) => {
            data.push([h, w, v]);
            if (v > max) max = v;
        });
    });
    return { data, max };
}

/** Minimal re-export of EChartsOption for convenience. */
export type { EChartsOption };
