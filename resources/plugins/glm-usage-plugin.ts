// UsageBoardPlugin:
// {
//   "schemaVersion": 1,
//   "name": "智谱",
//   "name@zh-Hans": "智谱",
//   "name@en": "Zhipu",
//   "icon": "https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-png/light/zhipu-color.png",
//   "description": "查询智谱 / ZAI Coding Plan 用量和 token 统计",
//   "description@zh-Hans": "查询智谱 / ZAI Coding Plan 用量和 token 统计",
//   "description@en": "Query Zhipu / ZAI Coding Plan usage and token stats",
//   "parameters": [
//     {
//       "name": "API_KEY",
//       "label": "Api Key",
//       "label@zh-Hans": "Api Key",
//       "type": "secret",
//       "required": true,
//       "placeholder": "Coding Plan API Key"
//     },
//     {
//       "name": "STAT_PERIOD",
//       "label": "统计周期",
//       "label@zh-Hans": "统计周期",
//       "label@en": "Stats Period",
//       "type": "choice",
//       "required": true,
//       "defaultValue": "7d",
//       "options": [
//         {"label": "7 天",  "label@zh-Hans": "7 天",  "label@en": "7 days",  "value": "7d"},
//         {"label": "15 天", "label@zh-Hans": "15 天", "label@en": "15 days", "value": "15d"},
//         {"label": "30 天", "label@zh-Hans": "30 天", "label@en": "30 days", "value": "30d"}
//       ]
//     }
//   ]
// }
// /UsageBoardPlugin

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
    definePlugin,
    requireParam,
    fetchJson,
    ok,
    fail,
    makeTranslator,
    appLanguage,
    numeric,
    statusFor,
    colorForPct,
} from "@omni-usage/plugin-sdk";
import type { AppLanguage, TranslateFn, UsageItem, PluginChart } from "@omni-usage/plugin-sdk";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QUOTA_ENDPOINT = "https://open.bigmodel.cn/api/monitor/usage/quota/limit";
const MODEL_USAGE_ENDPOINT = "https://bigmodel.cn/api/monitor/usage/model-usage";
const CACHE_VERSION = 1;
const CACHE_FILENAME_PREFIX = "glm-usage-chart-cache";

const translations: Record<string, Record<string, string>> = {
    period_5h: { "zh-Hans": "5小时", en: "5 hours" },
    period_week: { "zh-Hans": "周", en: "week" },
    period_month: { "zh-Hans": "月", en: "month" },
    tool_calls: { "zh-Hans": "工具调用", en: "Tool calls" },
    text_generation: { "zh-Hans": "文本生成", en: "Text generation" },
    five_hour_usage: { "zh-Hans": "5 小时用量", en: "5-hour usage" },
    weekly_usage: { "zh-Hans": "周用量", en: "Weekly usage" },
    mcp_month_usage: { "zh-Hans": "MCP 月用量", en: "MCP monthly usage" },
    no_stats_data: { "zh-Hans": "暂无可用统计数据", en: "No stats data available" },
    no_quota_items: { "zh-Hans": "未获取到配额数据", en: "No quota data found." },
    stats_query_failed: { "zh-Hans": "统计数据查询失败", en: "Failed to query stats data" },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type QuotaLimit = Record<string, unknown>;

interface QuotaPayload {
    data?: {
        limits?: QuotaLimit[];
        level?: unknown;
        x_time?: unknown[];
        modelDataList?: unknown[];
        tokensUsage?: unknown[];
        [key: string]: unknown;
    };
}

interface ChartCache {
    version: number;
    last_date: string;
    days: Record<string, Record<string, number>>;
}

type DailyMap = Record<string, Record<string, number>>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function firstPresent(source: Record<string, unknown>, keys: string[]): unknown {
    for (const key of keys) {
        const value = source[key];
        if (value !== undefined && value !== null && value !== "") return value;
    }
    return undefined;
}

function numericValue(value: unknown): number | null {
    if (typeof value === "number" && value >= 0) return value;
    if (typeof value === "string") {
        const normalized = value.trim().replace(/,/g, "");
        if (!normalized) return null;
        const n = Number(normalized);
        if (Number.isNaN(n) || n < 0) return null;
        return n;
    }
    return null;
}

function normalizeTimestamp(value: unknown): number | null {
    if (typeof value === "string") {
        const v = value.trim();
        if (!v) return null;
        if (/^\d+$/.test(v)) {
            value = Number(v);
        } else {
            const parsed = Date.parse(v.replace("Z", "+00:00"));
            if (!Number.isNaN(parsed)) return parsed / 1000;
            return null;
        }
    }
    if (typeof value !== "number" || value <= 0) return null;
    // GLM docs describe nextResetTime as milliseconds, but accept seconds too
    return value > 10_000_000_000 ? value / 1000 : value;
}

function formatDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${String(y)}-${m}-${day}`;
}

function parseDate(value: string): Date {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
}

function todayLocal(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function formatQueryTime(value: Date): string {
    const y = value.getFullYear();
    const mo = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    const h = String(value.getHours()).padStart(2, "0");
    const mi = String(value.getMinutes()).padStart(2, "0");
    const s = String(value.getSeconds()).padStart(2, "0");
    return `${String(y)}-${mo}-${d} ${h}:${mi}:${s}`;
}

// ---------------------------------------------------------------------------
// API fetches
// ---------------------------------------------------------------------------

async function fetchLimits(apiKey: string): Promise<QuotaPayload> {
    return fetchJson<QuotaPayload>(QUOTA_ENDPOINT, {
        headers: { Authorization: apiKey, "Content-Type": "application/json" },
    });
}

async function fetchModelUsage(
    apiKey: string,
    startTime: Date,
    endTime: Date,
): Promise<QuotaPayload> {
    const query = new URLSearchParams({
        startTime: formatQueryTime(startTime),
        endTime: formatQueryTime(endTime),
    }).toString();
    return fetchJson<QuotaPayload>(`${MODEL_USAGE_ENDPOINT}?${query}`, {
        headers: { Authorization: apiKey, "Content-Type": "application/json" },
    });
}

// ---------------------------------------------------------------------------
// Reset time
// ---------------------------------------------------------------------------

function resetAtIso(limit: QuotaLimit): string | null {
    const resetValue = firstPresent(limit, [
        "nextResetTime",
        "nextResetTimestamp",
        "resetTime",
        "resetAt",
        "expireTime",
        "expiresAt",
    ]);
    const ts = normalizeTimestamp(resetValue);
    if (ts === null) return null;
    return new Date(ts * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

// ---------------------------------------------------------------------------
// Period / kind / usage extraction from quota limit objects
// ---------------------------------------------------------------------------

type PeriodId = "5h" | "week" | "month";

function periodFor(
    limit: QuotaLimit,
    language: AppLanguage,
    translate: TranslateFn,
): [PeriodId, string] | null {
    const unit = limit.unit;
    const number = limit.number;
    if (unit === 3 && number === 5) return ["5h", translate(language, "period_5h")];
    if (unit === 6 && number === 1) return ["week", translate(language, "period_week")];
    if (unit === 5 && number === 1) return ["month", translate(language, "period_month")];
    return null;
}

function quotaKindText(limit: QuotaLimit): string {
    const keys = [
        "type",
        "kind",
        "category",
        "name",
        "displayName",
        "description",
        "quotaName",
        "quotaType",
        "resource",
        "resourceName",
        "resourceType",
        "service",
        "usageName",
        "usageType",
    ];
    return keys
        .map((k) => limit[k])
        .filter((v): v is string => typeof v === "string")
        .join(" ")
        .toLowerCase();
}

function quotaKind(
    limit: QuotaLimit,
    language: AppLanguage,
    translate: TranslateFn,
): ["tool" | "text", string] {
    if ("currentValue" in limit || "usage" in limit) {
        return ["tool", translate(language, "tool_calls")];
    }
    const text = quotaKindText(limit);
    const toolMarkers = ["tool", "工具", "function", "mcp"];
    const textMarkers = ["token", "text", "文本"];
    if (toolMarkers.some((m) => text.includes(m)))
        return ["tool", translate(language, "tool_calls")];
    if (textMarkers.some((m) => text.includes(m)))
        return ["text", translate(language, "text_generation")];
    return ["text", translate(language, "text_generation")];
}

function usageFromPercentage(limit: QuotaLimit): [number, number] {
    let pct = numeric(limit.percentage);
    pct = Math.max(0, Math.min(pct, 100));
    return [pct, 100];
}

function usageFromCurrentAndLimit(limit: QuotaLimit): [number, number] {
    const current = Math.max(numeric(limit.currentValue), 0);
    const usageLimit = Math.max(numeric(limit.usage), 0);
    return [current, usageLimit];
}

function usageFor(limit: QuotaLimit, kind: "tool" | "text"): [number, number, "ratio" | "percent"] {
    if (kind === "tool" && ("currentValue" in limit || "usage" in limit)) {
        const [used, total] = usageFromCurrentAndLimit(limit);
        return [used, total, "ratio"];
    }
    const [used, total] = usageFromPercentage(limit);
    return [used, total, "percent"];
}

// ---------------------------------------------------------------------------
// Build usage items from quota payload
// ---------------------------------------------------------------------------

function buildItems(
    payload: QuotaPayload,
    language: AppLanguage,
    translate: TranslateFn,
): { items: UsageItem[]; badge: string | null } {
    const data = payload.data ?? {};
    const limits = data.limits;
    if (!Array.isArray(limits)) return { items: [], badge: null };

    const badgeRaw = data.level;
    const badge = typeof badgeRaw === "string" ? badgeRaw : null;

    const output: UsageItem[] = [];

    for (const limit of limits) {
        if (typeof limit !== "object") continue;

        const period = periodFor(limit, language, translate);
        if (!period) continue;

        const [periodId, periodLabel] = period;
        const [kindId, kindLabel] = quotaKind(limit, language, translate);
        const [used, total, displayStyle] = usageFor(limit, kindId);
        if (total <= 0) continue;

        const id = `glm-${kindId}-${periodId}`;
        const pct = total > 0 ? (used / total) * 100 : 0;

        output.push({
            id,
            name: `${kindLabel} (${periodLabel})`,
            used,
            limit: total,
            displayStyle,
            resetAt: resetAtIso(limit),
            status: statusFor(used, total),
            color: colorForPct(pct),
        });
    }

    const displayNames: Record<string, string> = {
        "glm-text-5h": translate(language, "five_hour_usage"),
        "glm-text-week": translate(language, "weekly_usage"),
        "glm-tool-month": translate(language, "mcp_month_usage"),
    };
    const order: Record<string, number> = {
        "glm-text-5h": 0,
        "glm-text-week": 1,
        "glm-tool-month": 2,
    };
    for (const entry of output) {
        if (entry.id in displayNames) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- in-check above guarantees existence
            entry.name = displayNames[entry.id]!;
        }
    }
    output.sort((a, b) => (order[a.id] ?? 99) - (order[b.id] ?? 99));

    return { items: output, badge };
}

// ---------------------------------------------------------------------------
// Chart: model extraction helpers
// ---------------------------------------------------------------------------

function extractModel(record: Record<string, unknown>): string | null {
    const value = firstPresent(record, [
        "model",
        "modelName",
        "model_name",
        "modelCode",
        "model_code",
        "modelType",
        "model_type",
        "modelId",
        "model_id",
        "modelLabel",
        "model_label",
        "name",
    ]);
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

const TOKEN_KEYS = [
    "tokens",
    "token",
    "totalTokens",
    "total_tokens",
    "totalToken",
    "total_token",
    "totalTokensUsage",
    "total_tokens_usage",
    "totalTokenUsage",
    "total_token_usage",
    "tokensUsage",
    "tokens_usage",
    "tokenCount",
    "token_count",
    "tokensCount",
    "tokens_count",
    "consumeTokens",
    "consume_tokens",
    "consumedTokens",
    "consumed_tokens",
    "usedToken",
    "used_token",
    "tokenUsage",
    "token_usage",
    "usageTokens",
    "usage_tokens",
    "usedTokens",
    "used_tokens",
    "total",
    "value",
];

function extractTokens(record: QuotaLimit): number | null {
    for (const key of TOKEN_KEYS) {
        const n = numericValue(record[key]);
        if (n !== null) return n;
    }
    const usage = record.usage;
    if (typeof usage === "object" && usage !== null) {
        for (const key of TOKEN_KEYS) {
            const n = numericValue((usage as QuotaLimit)[key]);
            if (n !== null) return n;
        }
    }
    const totalUsage = record.totalUsage;
    if (typeof totalUsage === "object" && totalUsage !== null) {
        for (const key of TOKEN_KEYS) {
            const n = numericValue((totalUsage as QuotaLimit)[key]);
            if (n !== null) return n;
        }
    }
    const inputTokens = numericValue(record.inputTokens ?? record.input_tokens);
    const outputTokens = numericValue(record.outputTokens ?? record.output_tokens);
    if (inputTokens !== null || outputTokens !== null) {
        return (inputTokens ?? 0) + (outputTokens ?? 0);
    }
    return null;
}

function timestampFromValue(value: unknown): Date | null {
    const ts = normalizeTimestamp(value);
    if (ts !== null) return new Date(ts * 1000);

    if (typeof value === "string") {
        const text = value.trim();
        const patterns = [
            /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/,
            /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/,
            /^(\d{4})-(\d{2})-(\d{2}) (\d{2})$/,
            /^(\d{4})-(\d{2})-(\d{2})$/,
            /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})$/,
            /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})$/,
            /^(\d{4})\/(\d{2})\/(\d{2})$/,
        ];
        for (const pattern of patterns) {
            const m = text.match(pattern);
            if (m) {
                const parts = m.slice(1).map(Number);
                const date = new Date(
                    parts[0],
                    (parts[1] ?? 1) - 1,
                    parts[2],
                    parts[3] ?? 0,
                    parts[4] ?? 0,
                    parts[5] ?? 0,
                );
                if (!Number.isNaN(date.getTime())) return date;
            }
        }
    }
    return null;
}

function extractTimestamp(record: Record<string, unknown>): Date | null {
    const value = firstPresent(record, [
        "time",
        "date",
        "day",
        "hour",
        "statTime",
        "stat_time",
        "statDate",
        "stat_date",
        "startTime",
        "start_time",
        "timestamp",
        "requestTime",
        "request_time",
        "createdAt",
        "created_at",
        "createTime",
        "create_time",
    ]);
    const ts = normalizeTimestamp(value);
    if (ts !== null) return new Date(ts * 1000);
    if (typeof value === "string") return timestampFromValue(value);
    return null;
}

// ---------------------------------------------------------------------------
// Chart: bucket helpers
// ---------------------------------------------------------------------------

function bucketId(date: Date, bucketUnit: "hour" | "day"): string {
    if (bucketUnit === "hour") {
        const y = date.getFullYear();
        const mo = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        const h = String(date.getHours()).padStart(2, "0");
        return `${String(y)}-${mo}-${d}T${h}`;
    }
    return formatDate(date);
}

function bucketLabel(date: Date, bucketUnit: "hour" | "day"): string {
    if (bucketUnit === "hour") return String(date.getHours()).padStart(2, "0");
    const mo = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${mo}-${d}`;
}

// ---------------------------------------------------------------------------
// Chart: iterate nested records and extract aligned series
// ---------------------------------------------------------------------------

interface RecordEntry {
    record: Record<string, unknown>;
    inheritedModel: string | null;
}

function* iterRecords(
    value: unknown,
    inheritedModel: string | null = null,
): Generator<RecordEntry> {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        const rec = value as Record<string, unknown>;
        yield { record: rec, inheritedModel };
        for (const child of Object.values(rec)) {
            yield* iterRecords(child, extractModel(rec) ?? inheritedModel);
        }
    } else if (Array.isArray(value)) {
        if (value.length >= 2 && typeof value[0] !== "object" && typeof value[1] !== "object") {
            yield {
                record: { time: value[0], value: value[1] },
                inheritedModel,
            };
        }
        for (const child of value) {
            yield* iterRecords(child, inheritedModel);
        }
    }
}

function applyAlignedValues(
    times: unknown[],
    values: unknown[],
    model: string,
    bucketValues: Record<string, Record<string, number>>,
    bucketUnit: "hour" | "day",
): void {
    for (let i = 0; i < times.length; i++) {
        if (i >= values.length) break;
        const ts = timestampFromValue(times[i]);
        const tokens = numericValue(values[i]);
        if (!ts || tokens === null || tokens <= 0) continue;
        const key = bucketId(ts, bucketUnit);
        if (!(key in bucketValues)) continue;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- in-check above guarantees existence
        const bucket = bucketValues[key]!;
        bucket[model] = (bucket[model] ?? 0) + tokens;
    }
}

function applyAlignedModelSeries(
    payload: QuotaPayload,
    bucketValues: Record<string, Record<string, number>>,
    bucketUnit: "hour" | "day",
): void {
    const data = payload.data;
    if (typeof data !== "object") return;

    const times = data.x_time;
    if (!Array.isArray(times)) return;

    const modelEntries = data.modelDataList;
    if (Array.isArray(modelEntries)) {
        for (const entry of modelEntries) {
            if (typeof entry !== "object" || entry === null) continue;
            const rec = entry as Record<string, unknown>;
            const model = extractModel(rec);
            const values = rec.tokensUsage;
            if (!model || !Array.isArray(values)) continue;
            applyAlignedValues(times, values, model, bucketValues, bucketUnit);
        }
    }

    const totalValues = data.tokensUsage;
    if (
        Array.isArray(totalValues) &&
        !Object.values(bucketValues).some((b) => Object.keys(b).length > 0)
    ) {
        applyAlignedValues(times, totalValues, "总计", bucketValues, bucketUnit);
    }
}

// ---------------------------------------------------------------------------
// Chart: build from raw payload
// ---------------------------------------------------------------------------

function dayWindow(start: Date, end: Date): { start: Date; end: Date; buckets: Date[] } {
    const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59);
    const dayCount =
        Math.round((endDay.getTime() - startDay.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    const buckets: Date[] = [];
    for (let i = 0; i < dayCount; i++) {
        buckets.push(new Date(startDay.getTime() + i * 24 * 60 * 60 * 1000));
    }
    return { start: startDay, end: endDay, buckets };
}

function buildChart(
    payload: QuotaPayload,
    period: string,
    buckets: Date[],
    bucketUnit: "hour" | "day",
    language: AppLanguage,
    translate: TranslateFn,
): PluginChart {
    const bucketValues: Record<string, Record<string, number>> = {};
    for (const b of buckets) {
        bucketValues[bucketId(b, bucketUnit)] = {};
    }

    applyAlignedModelSeries(payload, bucketValues, bucketUnit);

    for (const { record, inheritedModel } of iterRecords(payload)) {
        let model = extractModel(record);
        model ??= inheritedModel;
        const tokens = extractTokens(record);
        const ts = extractTimestamp(record);
        if (!model || tokens === null || tokens <= 0 || !ts) continue;

        const key = bucketId(ts, bucketUnit);
        if (!(key in bucketValues)) continue;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- in-check above guarantees existence
        const bucket = bucketValues[key]!;
        bucket[model] = (bucket[model] ?? 0) + tokens;
    }

    const chartBuckets: PluginChart["buckets"] = [];
    for (const b of buckets) {
        const key = bucketId(b, bucketUnit);
        const segments = Object.entries(bucketValues[key] ?? {})
            .sort(([a], [b]) => a.localeCompare(b))
            .filter(([, tokens]) => tokens > 0)
            .map(([model, tokens]) => ({ model, tokens: chartTokenValue(tokens) }));
        chartBuckets.push({ id: key, label: bucketLabel(b, bucketUnit), segments });
    }

    const message = !chartBuckets.some((bk) => bk.segments.length > 0)
        ? translate(language, "no_stats_data")
        : null;

    return { kind: "line", period, bucketUnit, buckets: chartBuckets, message };
}

function chartTokenValue(value: number): number {
    return Number.isInteger(value) ? value : value;
}

// ---------------------------------------------------------------------------
// Chart cache: file-based 30-day maintenance
// ---------------------------------------------------------------------------

function cacheKey(apiKey: string): string {
    return crypto.createHash("sha256").update(apiKey).digest("hex").slice(0, 16);
}

function cachePath(apiKey: string): string {
    const root =
        process.env.USAGEBOARD_CACHE_DIR ??
        path.join(
            process.env.APPDATA ?? path.join(process.env.USERPROFILE ?? "~", "AppData", "Roaming"),
            "OmniUsage",
            "plugin-caches",
        );
    return path.join(root, `${CACHE_FILENAME_PREFIX}-${cacheKey(apiKey)}.json`);
}

function loadChartCache(apiKey: string): ChartCache | null {
    const filePath = cachePath(apiKey);
    try {
        if (!fs.existsSync(filePath)) return null;
        const raw = fs.readFileSync(filePath, "utf-8");
        const data = JSON.parse(raw) as ChartCache;
        if (data.version !== CACHE_VERSION) return null;
        if (typeof data.days !== "object") return null;
        return data;
    } catch {
        return null;
    }
}

function saveChartCache(apiKey: string, cacheData: ChartCache): void {
    const filePath = cachePath(apiKey);
    try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(cacheData), "utf-8");
    } catch {
        // intentionally silent on write failures
    }
}

function chartPayloadToDaily(
    payload: QuotaPayload,
    startDate: Date,
    endDate: Date,
    language: AppLanguage,
    translate: TranslateFn,
): DailyMap {
    const { buckets } = dayWindow(startDate, endDate);
    const chart = buildChart(payload, "30d", buckets, "day", language, translate);
    const daily: DailyMap = {};
    for (const bucket of chart.buckets) {
        const values: Record<string, number> = {};
        for (const segment of bucket.segments) {
            const tokens = numericValue(segment.tokens);
            if (segment.model && tokens !== null && tokens > 0) {
                values[segment.model] = (values[segment.model] ?? 0) + tokens;
            }
        }
        if (bucket.id) daily[bucket.id] = values;
    }
    return daily;
}

async function maintainChartCache(
    apiKey: string,
    language: AppLanguage,
    translate: TranslateFn,
): Promise<DailyMap> {
    const today = todayLocal();
    const cutoff = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000);

    const cache = loadChartCache(apiKey);

    const fetchRange = async (start: Date, end: Date): Promise<DailyMap> => {
        const { start: s, end: e } = dayWindow(start, end);
        const payload = await fetchModelUsage(apiKey, s, e);
        return chartPayloadToDaily(payload, start, end, language, translate);
    };

    const fullFetchAndSave = async (): Promise<DailyMap> => {
        const days = await fetchRange(cutoff, today);
        saveChartCache(apiKey, {
            version: CACHE_VERSION,
            last_date: formatDate(today),
            days,
        });
        return days;
    };

    if (!cache) return fullFetchAndSave();

    let lastDate: Date;
    try {
        lastDate = parseDate(cache.last_date);
    } catch {
        return fullFetchAndSave();
    }

    const gapDays = Math.round((today.getTime() - lastDate.getTime()) / (24 * 60 * 60 * 1000));

    if (gapDays < 0 || gapDays > 30) return fullFetchAndSave();

    // Today is always dirty, so refresh it even when the cache is already current.
    const scanStart = gapDays === 0 ? today : new Date(lastDate.getTime() + 24 * 60 * 60 * 1000);
    const newDays = await fetchRange(scanStart, today);

    const merged: DailyMap = {};
    for (const [dateKey, value] of Object.entries(cache.days)) {
        try {
            const parsed = parseDate(dateKey);
            if (parsed >= cutoff && parsed < scanStart && typeof value === "object") {
                merged[dateKey] = value;
            }
        } catch {
            continue;
        }
    }

    const dayCount =
        Math.round((today.getTime() - scanStart.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    for (let i = 0; i < dayCount; i++) {
        const dateKey = formatDate(new Date(scanStart.getTime() + i * 24 * 60 * 60 * 1000));
        merged[dateKey] = newDays[dateKey] ?? {};
    }

    saveChartCache(apiKey, {
        version: CACHE_VERSION,
        last_date: formatDate(today),
        days: merged,
    });
    return merged;
}

function buildChartFromCache(
    daily: DailyMap,
    period: string,
    language: AppLanguage,
    translate: TranslateFn,
): PluginChart {
    const dayCount: Record<string, number> = { "7d": 7, "15d": 15, "30d": 30 };
    const count = dayCount[period] ?? 7;
    const today = todayLocal();
    const dates: string[] = [];
    for (let i = count - 1; i >= 0; i--) {
        dates.push(formatDate(new Date(today.getTime() - i * 24 * 60 * 60 * 1000)));
    }

    const buckets: PluginChart["buckets"] = [];
    for (const dateKey of dates) {
        const segments: PluginChart["buckets"][number]["segments"] = [];
        const dayData = daily[dateKey] ?? {};
        for (const [model, rawTokens] of Object.entries(dayData).sort(([a], [b]) =>
            a.localeCompare(b),
        )) {
            const tokens = numericValue(rawTokens);
            if (model && tokens !== null && tokens > 0) {
                segments.push({ model, tokens: chartTokenValue(tokens) });
            }
        }
        buckets.push({ id: dateKey, label: dateKey.slice(5), segments });
    }

    const message = !buckets.some((bk) => bk.segments.length > 0)
        ? translate(language, "no_stats_data")
        : null;

    return { kind: "line", period, bucketUnit: "day", buckets, message };
}

// ---------------------------------------------------------------------------
// Stat range helper
// ---------------------------------------------------------------------------

function statRange(period: string): { buckets: Date[]; bucketUnit: "day" } {
    const dayCount: Record<string, number> = { "7d": 7, "15d": 15, "30d": 30 };
    const count = dayCount[period] ?? 7;
    const today = todayLocal();
    const startDate = new Date(today.getTime() - (count - 1) * 24 * 60 * 60 * 1000);
    const { buckets } = dayWindow(startDate, today);
    return { buckets, bucketUnit: "day" };
}

function chartMessage(
    message: string,
    period: string,
    buckets: Date[],
    bucketUnit: "hour" | "day",
): PluginChart {
    return {
        kind: "line",
        period,
        bucketUnit,
        buckets: buckets.map((b) => ({
            id: bucketId(b, bucketUnit),
            label: bucketLabel(b, bucketUnit),
            segments: [],
        })),
        message,
    };
}

// ---------------------------------------------------------------------------
// Plugin entry point
// ---------------------------------------------------------------------------

definePlugin(async ({ params }) => {
    const apiKey = requireParam(params, "API_KEY");
    let period = (params.STAT_PERIOD ?? "7d").toLowerCase();
    if (period !== "7d" && period !== "15d" && period !== "30d") period = "7d";
    const language = appLanguage(params);
    const translate = makeTranslator(translations);

    let payload: QuotaPayload;
    try {
        payload = await fetchLimits(apiKey);
    } catch (err) {
        if (err instanceof Error && "statusCode" in err) {
            const s = (err as { statusCode: number }).statusCode;
            if (s === 401) return fail("AUTH_FAILED", translate(language, "missing_api_key"));
            if (s === 429) return fail("RATE_LIMITED", "Rate limited. Try again later.");
            if (s >= 500) return fail("SERVER_ERROR", `Service unavailable (HTTP ${String(s)})`);
            return fail("HTTP_ERROR", `HTTP ${String(s)} from ${QUOTA_ENDPOINT}`);
        }
        return fail("NETWORK_ERROR", translate(language, "network_error"));
    }

    let items: UsageItem[];
    let badge: string | null;
    try {
        const result = buildItems(payload, language, translate);
        items = result.items;
        badge = result.badge;
    } catch {
        return fail("PARSE_ERROR", translate(language, "usage_parse_failed"));
    }

    if (!items.length) return fail("NO_DATA", translate(language, "no_quota_items"));

    const { buckets, bucketUnit } = statRange(period);
    let chart: PluginChart;
    try {
        const daily = await maintainChartCache(apiKey, language, translate);
        chart = buildChartFromCache(daily, period, language, translate);
    } catch {
        chart = chartMessage(
            translate(language, "stats_query_failed"),
            period,
            buckets,
            bucketUnit,
        );
    }

    return ok({ items, badge: badge ?? undefined, chart });
});
