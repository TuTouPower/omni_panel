// UsageBoardPlugin:
// {
//   "name": "Claude",
//   "supportedProviders": ["claude"],
//   "defaultSource": "local",
//   "name@zh-Hans": "Claude",
//   "name@en": "Claude",
//   "icon": "https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-png/light/claude-color.png",
//   "description": "查询 Claude 订阅用量和统计",
//   "description@zh-Hans": "查询 Claude 订阅用量和统计",
//   "description@en": "Query Claude subscription usage and stats",
//   "parameters": [
//     {
//       "name": "PLAN",
//       "label": "Subscription Plan",
//       "label@zh-Hans": "订阅计划",
//       "label@en": "Subscription Plan",
//       "type": "choice",
//       "required": false,
//       "defaultValue": "pro",
//       "options": [
//         {"label": "None",    "label@zh-Hans": "无",      "label@en": "None",    "value": "none"},
//         {"label": "Pro",     "label@zh-Hans": "Pro",     "label@en": "Pro",     "value": "pro"},
//         {"label": "Max 5X",  "label@zh-Hans": "Max 5X",  "label@en": "Max 5X",  "value": "max5"},
//         {"label": "Max 20X", "label@zh-Hans": "Max 20X", "label@en": "Max 20X", "value": "max20"}
//       ]
//     },
//     {
//       "name": "STAT_PERIOD",
//       "label": "Stats Period",
//       "label@zh-Hans": "统计周期",
//       "label@en": "Stats Period",
//       "type": "choice",
//       "required": false,
//       "defaultValue": "7d",
//       "options": [
//         {"label": "7 days",  "label@zh-Hans": "7 天",  "label@en": "7 days",  "value": "7d"},
//         {"label": "15 days", "label@zh-Hans": "15 天", "label@en": "15 days", "value": "15d"},
//         {"label": "30 days", "label@zh-Hans": "30 天", "label@en": "30 days", "value": "30d"}
//       ]
//     },
//     {
//       "name": "CLAUDE_ONLY",
//       "label": "Claude Models Only",
//       "label@zh-Hans": "仅 Claude 模型",
//       "label@en": "Claude Models Only",
//       "type": "boolean",
//       "required": false,
//       "defaultValue": "false"
//     },
//     {
//       "name": "CALC_MODE",
//       "label": "Calculation Mode",
//       "label@zh-Hans": "计算方式",
//       "label@en": "Calculation Mode",
//       "type": "choice",
//       "required": false,
//       "defaultValue": "billable",
//       "options": [
//         {"label": "Billing-weighted", "label@zh-Hans": "计费倍率", "label@en": "Billing-weighted", "value": "billable"},
//         {"label": "Actual usage",     "label@zh-Hans": "实际消耗", "label@en": "Actual usage",     "value": "actual"}
//       ]
//     },
//     {
//       "name": "DATA_DIR",
//       "label": "Data Directory",
//       "label@zh-Hans": "数据目录",
//       "label@en": "Data Directory",
//       "type": "directory",
//       "required": false,
//       "defaultValue": "~/.claude",
//       "placeholder": "~/.claude"
//     }
//   ]
// }
// /UsageBoardPlugin

import { definePlugin, ok, failFromHttp, statusFor, colorForPct } from "@omni-usage/plugin-sdk";
import type { HttpClient } from "@omni-usage/plugin-sdk";

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";

const METADATA_ENDPOINTS = { anthropic: "https://api.anthropic.com" };
const SOURCE_INSTANCE_ID = process.env.OMNI_SOURCE_INSTANCE_ID ?? "unknown-source";

const itemContext = {
    provider: "claude" as const,
    source: "local" as const,
    sourceInstanceId: SOURCE_INSTANCE_ID,
    accountId: SOURCE_INSTANCE_ID,
    accountLabel: "Claude",
};

// ─── Constants ────────────────────────────────────────────────────────────────

const CACHE_VERSION = 3;
const CACHE_FILENAME = ".usageboard-chart-cache.json";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function expandHome(p: string): string {
    if (p.startsWith("~")) return path.join(os.homedir(), p.slice(1));
    return p;
}

function toLocalDateString(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${String(y)}-${m}-${day}`;
}

function addDays(dateStr: string, days: number): string {
    const d = new Date(dateStr + "T12:00:00");
    d.setDate(d.getDate() + days);
    return toLocalDateString(d);
}

function diffDays(a: string, b: string): number {
    const da = new Date(a + "T12:00:00");
    const db = new Date(b + "T12:00:00");
    return Math.round((da.getTime() - db.getTime()) / (24 * 60 * 60 * 1000));
}

function isClaudeModel(modelName: string): boolean {
    return modelName.startsWith("claude-");
}

interface TokenBreakdown {
    input: number;
    output: number;
    cache_creation: number;
    cache_read: number;
}

function computeTokens(breakdown: TokenBreakdown, mode: string): number {
    const i = breakdown.input;
    const o = breakdown.output;
    const cc = breakdown.cache_creation;
    const cr = breakdown.cache_read;
    if (mode === "actual") return i + o + cc + cr;
    return Math.round(i * 1.0 + o * 5.0 + cc * 1.25 + cr * 0.1);
}

// ─── Translations ─────────────────────────────────────────────────────────────

const translations = {
    five_hour: { en: "5-hour usage", "zh-Hans": "5 小时用量" },
    weekly: { en: "Weekly usage", "zh-Hans": "周用量" },
    design_weekly: { en: "Design weekly usage", "zh-Hans": "Design 周用量" },
    no_data_dir: {
        en: "~/.claude not found. Install Claude Code CLI first.",
        "zh-Hans": "~/.claude 目录不存在，请先安装 Claude Code CLI",
    },
    login_hint: {
        en: "Not signed in. Run claude to sign in.",
        "zh-Hans": "未找到登录凭证，请运行 claude 登录",
    },
    api_error: {
        en: "API request failed. Check your network.",
        "zh-Hans": "API 请求失败，请检查网络",
    },
    api_401: { en: "Credentials expired. Sign in again.", "zh-Hans": "登录凭证已失效，请重新登录" },
    api_5xx: { en: "Service unavailable (HTTP {code})", "zh-Hans": "服务暂时不可用 (HTTP {code})" },
    no_stats_data: { en: "No stats data available", "zh-Hans": "暂无可用统计数据" },
};

// ─── OAuth ────────────────────────────────────────────────────────────────────

function loadOAuthToken(): string | null {
    // Try macOS keychain
    try {
        const result = execSync('security find-generic-password -s "Claude Code-credentials" -w', {
            encoding: "utf8",
            timeout: 5000,
        });
        const data = JSON.parse(result.trim()) as Record<string, unknown>;
        const oauth = data.claudeAiOauth as Record<string, unknown> | undefined;
        const token = oauth?.accessToken;
        if (token) return token as string;
    } catch {
        /* fall through */
    }

    // Fallback to credentials file
    const credPath = path.join(os.homedir(), ".claude", ".credentials.json");
    try {
        const raw = fs.readFileSync(credPath, "utf8");
        const data = JSON.parse(raw) as Record<string, unknown>;
        const oauth = data.claudeAiOauth as Record<string, unknown> | undefined;
        return (oauth?.accessToken as string | undefined) ?? null;
    } catch {
        /* fall through */
    }

    return null;
}

async function fetchOAuthUsage(
    http: HttpClient,
    token: string,
): Promise<Record<string, unknown> | null> {
    const result = await http.getJson<Record<string, unknown>>("anthropic", "/api/oauth/usage", {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            "anthropic-beta": "oauth-2025-04-20",
        },
        timeoutMs: 10_000,
    });
    if (!result.ok) return null;
    return result.value;
}

interface OAuthUsageItem {
    id: string;
    provider: "claude";
    source: "local";
    sourceInstanceId: string;
    accountId: string;
    accountLabel: string;
    name: string;
    displayStyle: "percent";
    used: number;
    limit: number;
    resetAt: string | null | undefined;
    color: ReturnType<typeof colorForPct>;
    status: ReturnType<typeof statusFor>;
}

function buildItemsFromOAuth(
    data: Record<string, unknown>,
    t: (key: string) => string,
): OAuthUsageItem[] {
    const fh = (data.five_hour ?? {}) as Record<string, unknown>;
    const sd = (data.seven_day ?? {}) as Record<string, unknown>;
    const designWeek = data.seven_day_omelette as Record<string, unknown> | undefined;

    const fhPct = Number(fh.utilization ?? 0);
    const sdPct = Number(sd.utilization ?? 0);

    const items: OAuthUsageItem[] = [
        {
            id: "claude-five-hour",
            ...itemContext,
            name: t("five_hour"),
            displayStyle: "percent",
            used: Math.round(Math.min(fhPct, 100) * 10) / 10,
            limit: 100,
            resetAt: (fh.resets_at as string | undefined) ?? null,
            color: colorForPct(fhPct),
            status: statusFor(fhPct, 100),
        },
        {
            id: "claude-seven-day",
            ...itemContext,
            name: t("weekly"),
            displayStyle: "percent",
            used: Math.round(Math.min(sdPct, 100) * 10) / 10,
            limit: 100,
            resetAt: (sd.resets_at as string | undefined) ?? null,
            color: colorForPct(sdPct),
            status: statusFor(sdPct, 100),
        },
    ];

    if (designWeek && typeof designWeek === "object" && Object.keys(designWeek).length > 0) {
        const designPct = Number(designWeek.utilization ?? 0);
        items.push({
            id: "claude-design-seven-day",
            ...itemContext,
            name: t("design_weekly"),
            displayStyle: "percent",
            used: Math.round(Math.min(designPct, 100) * 10) / 10,
            limit: 100,
            resetAt: (designWeek.resets_at as string | undefined) ?? null,
            color: colorForPct(designPct),
            status: statusFor(designPct, 100),
        });
    }

    return items;
}

// ─── JSONL scanning ───────────────────────────────────────────────────────────

function allJsonlFiles(dataDir: string): string[] {
    const expanded = expandHome(dataDir);
    const projectsDir = path.join(expanded, "projects");
    const results: string[] = [];

    function walk(dir: string): void {
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full);
            } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
                results.push(full);
            }
        }
    }

    walk(projectsDir);
    return results;
}

function recentJsonlFiles(dataDir: string, cutoffMs: number): string[] {
    return allJsonlFiles(dataDir).filter((f) => {
        try {
            return fs.statSync(f).mtimeMs >= cutoffMs;
        } catch {
            return false;
        }
    });
}

interface ParsedRecord {
    ts: Date;
    model: string;
    breakdown: TokenBreakdown;
}

function parseRecords(files: string[], startDt: Date, endDt: Date): ParsedRecord[] {
    const seenIds = new Set<string>();
    const records: ParsedRecord[] = [];
    const startMs = startDt.getTime();
    const endMs = endDt.getTime();

    for (const filepath of files) {
        try {
            const content = fs.readFileSync(filepath, "utf8");
            for (const line of content.split("\n")) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                let obj: Record<string, unknown>;
                try {
                    obj = JSON.parse(trimmed) as Record<string, unknown>;
                } catch {
                    continue;
                }
                if (obj.type !== "assistant") continue;

                const msg = obj.message as Record<string, unknown> | undefined;
                if (!msg) continue;
                const msgId = msg.id as string | undefined;
                if (!msgId || seenIds.has(msgId)) continue;
                seenIds.add(msgId);

                const usage = (msg.usage ?? {}) as Record<string, number>;
                const breakdown: TokenBreakdown = {
                    input: usage.input_tokens ?? 0,
                    output: usage.output_tokens ?? 0,
                    cache_creation: usage.cache_creation_input_tokens ?? 0,
                    cache_read: usage.cache_read_input_tokens ?? 0,
                };
                if (
                    breakdown.input +
                        breakdown.output +
                        breakdown.cache_creation +
                        breakdown.cache_read <=
                    0
                ) {
                    continue;
                }

                const rawTs = obj.timestamp as string | undefined;
                if (!rawTs) continue;
                const ts = new Date(rawTs);
                if (isNaN(ts.getTime())) continue;

                if (startMs <= ts.getTime() && ts.getTime() <= endMs) {
                    records.push({
                        ts,
                        model: (msg.model as string | undefined) ?? "unknown",
                        breakdown,
                    });
                }
            }
        } catch {
            continue;
        }
    }
    return records;
}

type DailyData = Record<string, Record<string, TokenBreakdown>>;

function groupByLocalDate(records: ParsedRecord[]): DailyData {
    const result: DailyData = {};
    for (const { ts, model, breakdown } of records) {
        const day = toLocalDateString(ts);
        const dayData = (result[day] ??= {});
        const bucket = (dayData[model] ??= {
            input: 0,
            output: 0,
            cache_creation: 0,
            cache_read: 0,
        });
        bucket.input += breakdown.input;
        bucket.output += breakdown.output;
        bucket.cache_creation += breakdown.cache_creation;
        bucket.cache_read += breakdown.cache_read;
    }
    return result;
}

// ─── Stats cache ──────────────────────────────────────────────────────────────

interface StatsCache {
    version: number;
    last_date: string;
    days: DailyData;
}

function cachePath(dataDir: string): string {
    return path.join(expandHome(dataDir), CACHE_FILENAME);
}

function loadStatsCache(dataDir: string): StatsCache | null {
    const p = cachePath(dataDir);
    if (!fs.existsSync(p)) return null;
    try {
        const data = JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, unknown>;
        if (data.version !== CACHE_VERSION) return null;
        return data as unknown as StatsCache;
    } catch {
        return null;
    }
}

function saveStatsCache(dataDir: string, cacheData: StatsCache): void {
    const p = cachePath(dataDir);
    try {
        fs.writeFileSync(p, JSON.stringify(cacheData));
    } catch {
        /* ignore write failures */
    }
}

function maintainCache(dataDir: string): DailyData {
    const today = toLocalDateString(new Date());
    const cutoff = addDays(today, -29);

    const cache = loadStatsCache(dataDir);
    const now = new Date();

    function fullScanAndSave(): DailyData {
        const scanStartUtc = new Date(cutoff + "T00:00:00Z");
        scanStartUtc.setTime(scanStartUtc.getTime() - 14 * 60 * 60 * 1000);
        const records = parseRecords(allJsonlFiles(dataDir), scanStartUtc, now);
        const byDay = groupByLocalDate(records);
        const days: DailyData = {};
        for (let i = 0; i < 30; i++) {
            const d = addDays(cutoff, i);
            if (d <= today) days[d] = byDay[d] ?? {};
        }
        saveStatsCache(dataDir, { version: CACHE_VERSION, last_date: today, days });
        return days;
    }

    if (!cache) return fullScanAndSave();

    const lastDate = cache.last_date;
    const gapDays = diffDays(today, lastDate);

    if (gapDays < 0 || gapDays > 30) return fullScanAndSave();

    const scanStart = gapDays === 0 ? today : addDays(lastDate, 1);
    const scanStartUtc = new Date(scanStart + "T00:00:00Z");
    scanStartUtc.setTime(scanStartUtc.getTime() - 14 * 60 * 60 * 1000);
    const cutoffMs = scanStartUtc.getTime();

    const recentFiles = recentJsonlFiles(dataDir, cutoffMs);
    const records = parseRecords(recentFiles, scanStartUtc, now);
    const newDays = groupByLocalDate(records);

    const merged: DailyData = {};
    for (const [d, v] of Object.entries(cache.days)) {
        if (d >= cutoff && d < scanStart) merged[d] = v;
    }

    const dayCount = diffDays(today, scanStart) + 1;
    for (let i = 0; i < dayCount; i++) {
        const dateStr = addDays(scanStart, i);
        merged[dateStr] = newDays[dateStr] ?? {};
    }

    saveStatsCache(dataDir, { version: CACHE_VERSION, last_date: today, days: merged });
    return merged;
}

// ─── Chart ────────────────────────────────────────────────────────────────────

function buildChart(
    params: Record<string, string>,
    daily: DailyData,
    t: (key: string) => string,
    mode: string,
) {
    const statPeriod = params.STAT_PERIOD ?? "7d";
    const claudeOnly = (params.CLAUDE_ONLY ?? "false").toLowerCase() === "true";
    const statDays: Record<string, number> = { "7d": 7, "15d": 15, "30d": 30 };
    const numDays = statDays[statPeriod] ?? 7;

    const dateList: string[] = [];
    for (let i = numDays - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dateList.push(toLocalDateString(d));
    }

    const buckets = dateList.map((date) => {
        const dayData = daily[date] ?? {};
        const segments: { model: string; tokens: number }[] = [];
        for (const model of Object.keys(dayData).sort()) {
            if (claudeOnly && !isClaudeModel(model)) continue;
            const tokens = computeTokens(dayData[model], mode);
            if (tokens > 0) segments.push({ model, tokens });
        }
        return { id: date, label: date.slice(5), segments };
    });

    const message = buckets.some((b) => b.segments.length > 0) ? null : t("no_stats_data");

    return {
        kind: "line" as const,
        period: statPeriod,
        bucketUnit: "day" as const,
        buckets,
        message,
    };
}

// ─── Entry point ──────────────────────────────────────────────────────────────

definePlugin(
    async (ctx) => {
        const dataDir = path.resolve(expandHome(ctx.params.DATA_DIR ?? "~/.claude"));
        const plan = (ctx.params.PLAN ?? "pro").toLowerCase();

        if (!fs.existsSync(dataDir) || !fs.statSync(dataDir).isDirectory()) {
            return failFromHttp({ kind: "network", message: ctx.t("no_data_dir") }, "claude");
        }

        const mode = ctx.params.CALC_MODE ?? "billable";
        const daily = maintainCache(dataDir);
        const chart = buildChart(ctx.params, daily, ctx.t, mode);

        if (plan === "none") {
            return ok({ items: [], chart });
        }

        const token = loadOAuthToken();
        if (!token) {
            return failFromHttp({ kind: "network", message: ctx.t("login_hint") }, "claude");
        }

        const oauthData = await fetchOAuthUsage(ctx.http, token);
        if (!oauthData) {
            return failFromHttp({ kind: "http", status: 401, body: null }, "claude");
        }

        try {
            const items = buildItemsFromOAuth(oauthData, ctx.t);
            const rawBadge =
                (oauthData.plan_type as string | undefined) ?? ctx.params.PLAN ?? "pro";
            const badge = rawBadge.charAt(0).toUpperCase() + rawBadge.slice(1).toLowerCase();
            return ok({ items, chart, badge });
        } catch {
            return failFromHttp({ kind: "invalid_json", status: 200, raw: "" }, "claude");
        }
    },
    { metadata: { endpoints: METADATA_ENDPOINTS }, translations },
);
