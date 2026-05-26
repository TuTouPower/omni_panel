// UsageBoardPlugin:
// {
//   "schemaVersion": 1,
//   "name": "Codex",
//   "name@zh-Hans": "Codex",
//   "name@en": "Codex",
//   "icon": "https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-png/light/codex-color.png",
//   "description": "查询 OpenAI Codex CLI 用量和统计",
//   "description@zh-Hans": "查询 OpenAI Codex CLI 用量和统计",
//   "description@en": "Query OpenAI Codex CLI usage and stats",
//   "parameters": [
//     {
//       "name": "AUTH_FILE",
//       "label": "认证文件",
//       "label@zh-Hans": "认证文件",
//       "label@en": "Auth File",
//       "type": "file",
//       "required": false,
//       "defaultValue": "~/.codex/auth.json",
//       "placeholder": "~/.codex/auth.json"
//     },
//     {
//       "name": "DATA_DIR",
//       "label": "数据目录",
//       "label@zh-Hans": "数据目录",
//       "label@en": "Data Directory",
//       "type": "directory",
//       "required": false,
//       "defaultValue": "~/.codex",
//       "placeholder": "~/.codex"
//     },
//     {
//       "name": "ENABLE_STATS",
//       "label": "统计",
//       "label@zh-Hans": "统计",
//       "label@en": "Statistics",
//       "type": "boolean",
//       "required": false,
//       "defaultValue": "true"
//     },
//     {
//       "name": "STAT_PERIOD",
//       "label": "统计周期",
//       "label@zh-Hans": "统计周期",
//       "label@en": "Stats Period",
//       "type": "choice",
//       "required": false,
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

import {
    definePlugin,
    fetchJson,
    ok,
    fail,
    makeTranslator,
    appLanguage,
    colorForPct,
    PluginHttpError,
} from "@omni-usage/plugin-sdk";
import type { AppLanguage, PluginChart } from "@omni-usage/plugin-sdk";

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { homedir } from "node:os";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ENDPOINT = "https://chatgpt.com/backend-api/wham/usage";
const CACHE_VERSION = 1;
const CACHE_FILENAME = ".usageboard-chart-cache.json";
const FILENAME_DATE = /rollout-(\d{4}-\d{2}-\d{2})T/;

// ---------------------------------------------------------------------------
// Translations
// ---------------------------------------------------------------------------

const translations = {
    no_stats_data: { "zh-Hans": "暂无可用统计数据", en: "No stats data available" },
    five_hour_usage: { "zh-Hans": "5 小时用量", en: "5-hour usage" },
    weekly_usage: { "zh-Hans": "周用量", en: "Weekly usage" },
    auth_file_not_found: {
        "zh-Hans": "未找到认证文件，请先登录 Codex（{path}）",
        en: "Auth file not found. Sign in to Codex first. ({path})",
    },
    auth_token_missing: {
        "zh-Hans": "认证信息不完整，请重新登录 Codex",
        en: "Incomplete auth. Sign in to Codex again.",
    },
    token_expired: {
        "zh-Hans": "登录已过期，请重新运行 codex auth",
        en: "Session expired. Run codex auth again.",
    },
    unauthorized: { "zh-Hans": "账号无权限访问", en: "Access denied. Check your plan." },
    stats_parse_failed: { "zh-Hans": "统计数据解析失败", en: "Failed to parse stats data" },
    no_quota_data: {
        "zh-Hans": "未获取到配额数据，账号可能不支持此 API",
        en: "No quota data. Account may not support this API.",
    },
};

// ---------------------------------------------------------------------------
// Date helpers  (all dates are "YYYY-MM-DD" strings in local time)
// ---------------------------------------------------------------------------

function todayStr(): string {
    const d = new Date();
    return fmtLocal(d);
}

function fmtLocal(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${String(y)}-${m}-${day}`;
}

function addDays(dateStr: string, days: number): string {
    const [y, m, d] = dateStr.split("-").map(Number);
    const date = new Date(y ?? 0, (m ?? 1) - 1, (d ?? 0) + days);
    return fmtLocal(date);
}

function diffDays(later: string, earlier: string): number {
    const a = Date.UTC(+later.slice(0, 4), +later.slice(5, 7) - 1, +later.slice(8, 10));
    const b = Date.UTC(+earlier.slice(0, 4), +earlier.slice(5, 7) - 1, +earlier.slice(8, 10));
    return Math.round((a - b) / 86400000);
}

function dateRange(startStr: string, endStr: string): string[] {
    const result: string[] = [];
    let cur = startStr;
    while (cur <= endStr) {
        result.push(cur);
        cur = addDays(cur, 1);
    }
    return result;
}

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

function expandHome(p: string): string {
    if (p.startsWith("~")) return join(homedir(), p.slice(1));
    return p;
}

function findJsonlFiles(dir: string, recursive: boolean): string[] {
    if (!existsSync(dir)) return [];
    const results: string[] = [];
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isFile() && entry.name.endsWith(".jsonl")) {
            results.push(fullPath);
        } else if (recursive && entry.isDirectory()) {
            results.push(...findJsonlFiles(fullPath, true));
        }
    }
    return results;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function loadAuth(authPath: string): Record<string, unknown> | null {
    const expanded = expandHome(authPath);
    if (!existsSync(expanded)) return null;
    try {
        return JSON.parse(readFileSync(expanded, "utf-8")) as Record<string, unknown>;
    } catch {
        return null;
    }
}

function extractAuthCredentials(auth: Record<string, unknown>): [string | null, string | null] {
    const tokens =
        typeof auth.tokens === "object" && auth.tokens !== null && !Array.isArray(auth.tokens)
            ? (auth.tokens as Record<string, unknown>)
            : {};

    let accessToken = (tokens.access_token as string) || (auth.access_token as string);
    let accountId = (tokens.account_id as string) || (auth.account_id as string);

    if (typeof accessToken !== "string" || !accessToken.trim()) accessToken = null;
    if (typeof accountId !== "string" || !accountId.trim()) accountId = null;

    return [accessToken, accountId];
}

// ---------------------------------------------------------------------------
// Epoch / ISO helpers
// ---------------------------------------------------------------------------

function epochMsToIso(value: unknown): string | null {
    if (value == null) return null;
    const raw = Number(value);
    if (!Number.isFinite(raw)) return null;
    const ms = raw > 1e11 ? raw : raw * 1000;
    return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

// ---------------------------------------------------------------------------
// Window parsing  (rate-limit window data from the API)
// ---------------------------------------------------------------------------

function getWindow(
    data: Record<string, unknown>,
    ...keys: string[]
): Record<string, unknown> | null {
    for (const key of keys) {
        const value = data[key];
        if (value && typeof value === "object" && !Array.isArray(value)) {
            return value as Record<string, unknown>;
        }
    }
    return null;
}

function getPercentLeft(window: Record<string, unknown>): number | null {
    for (const key of ["percent_left", "remaining_percent"]) {
        const value = window[key];
        if (value != null) {
            const n = Number(value);
            if (Number.isFinite(n)) return n;
        }
    }
    const used = window.used_percent;
    if (used != null) {
        const n = Number(used);
        if (Number.isFinite(n)) return Math.max(0, 100 - n);
    }
    return null;
}

function getResetAt(window: Record<string, unknown>): string | null {
    for (const key of ["reset_time_ms", "reset_at"]) {
        const value = window[key];
        if (value != null) return epochMsToIso(value);
    }
    const nested = window.primary_window;
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
        return getResetAt(nested as Record<string, unknown>);
    }
    return null;
}

// ---------------------------------------------------------------------------
// Build UsageItems from API payload
// ---------------------------------------------------------------------------

function buildItems(
    payload: Record<string, unknown>,
    language: AppLanguage,
    translate: (lang: AppLanguage, key: string, kwargs?: Record<string, string>) => string,
): { items: Record<string, unknown>[]; badge: string | null } {
    const rateLimits = getWindow(payload, "rate_limit", "rate_limits");
    if (!rateLimits) return { items: [], badge: null };

    const badge: string | null = typeof payload.plan_type === "string" ? payload.plan_type : null;

    let fiveHour = getWindow(
        rateLimits,
        "five_hour",
        "five_hour_limit",
        "five_hour_rate_limit",
        "primary",
    );
    let weekly = getWindow(rateLimits, "weekly", "weekly_limit", "weekly_rate_limit", "secondary");

    fiveHour ??= getWindow(rateLimits, "primary_window");
    weekly ??= getWindow(rateLimits, "secondary_window");

    const items: Record<string, unknown>[] = [];

    if (fiveHour) {
        const pct = getPercentLeft(fiveHour);
        if (pct !== null) {
            const used = Math.round((100 - pct) * 10) / 10;
            items.push({
                id: "codex-five-hour",
                name: translate(language, "five_hour_usage"),
                used,
                limit: 100,
                displayStyle: "percent",
                resetAt: getResetAt(fiveHour),
                status: used >= 90 ? "critical" : used >= 75 ? "warning" : "normal",
                color: colorForPct(used),
            });
        }
    }

    if (weekly) {
        const pct = getPercentLeft(weekly);
        if (pct !== null) {
            const used = Math.round((100 - pct) * 10) / 10;
            items.push({
                id: "codex-weekly",
                name: translate(language, "weekly_usage"),
                used,
                limit: 100,
                displayStyle: "percent",
                resetAt: getResetAt(weekly),
                status: used >= 90 ? "critical" : used >= 75 ? "warning" : "normal",
                color: colorForPct(used),
            });
        }
    }

    return { items, badge };
}

// ---------------------------------------------------------------------------
// Session file scanning  (JSONL files under ~/.codex)
// ---------------------------------------------------------------------------

function parseDateFromFilename(filename: string): string | null {
    const m = FILENAME_DATE.exec(basename(filename));
    return m?.[1] ?? null;
}

function collectSessionFiles(dataDir: string, startDate: string, endDate: string): string[] {
    const expanded = expandHome(dataDir);
    const files: string[] = [];
    files.push(...findJsonlFiles(join(expanded, "sessions"), true));
    files.push(...findJsonlFiles(join(expanded, "archived_sessions"), false));

    return files.filter((f) => {
        const fileDate = parseDateFromFilename(f);
        return fileDate && startDate <= fileDate && fileDate <= endDate;
    });
}

function parseSessionsForChart(
    files: string[],
    dateList: string[],
    period: string,
    language: AppLanguage,
    translate: (lang: AppLanguage, key: string) => string,
): PluginChart {
    const bucketKeys: Record<string, Record<string, number>> = {};
    for (const d of dateList) bucketKeys[d] = {};

    const modelTotals: Record<string, number> = {};

    for (const filepath of files) {
        let currentModel: string | null = null;
        const prevUsage: Record<string, number> = {};

        try {
            const content = readFileSync(filepath, "utf-8");
            for (const line of content.split("\n")) {
                if (!line.includes("turn_context") && !line.includes("token_count")) continue;
                let event: Record<string, unknown>;
                try {
                    event = JSON.parse(line) as Record<string, unknown>;
                } catch {
                    continue;
                }

                const kind = event.type;
                const payload = event.payload;
                if (!payload || typeof payload !== "object" || Array.isArray(payload)) continue;
                const p = payload as Record<string, unknown>;

                if (kind === "turn_context") {
                    const model = p.model;
                    if (typeof model === "string" && model.trim()) {
                        currentModel = model.trim();
                    }
                }

                if (p.type === "token_count") {
                    const info = p.info;
                    if (!info || typeof info !== "object" || Array.isArray(info)) continue;
                    const i = info as Record<string, unknown>;

                    const totalUsage = i.total_token_usage;
                    if (!totalUsage || typeof totalUsage !== "object" || Array.isArray(totalUsage))
                        continue;
                    const tu = totalUsage as Record<string, unknown>;

                    const totalTokens = tu.total_tokens;
                    if (typeof totalTokens !== "number") continue;

                    let delta = Math.max(totalTokens - (prevUsage.total_tokens ?? 0), 0);
                    if (!("total_tokens" in prevUsage)) delta = totalTokens;
                    prevUsage.total_tokens = totalTokens;

                    const model = currentModel ?? "unknown";
                    const ts = p.timestamp ?? event.timestamp;
                    if (ts && delta > 0) {
                        try {
                            const tsStr =
                                typeof ts === "string"
                                    ? ts
                                    : typeof ts === "number"
                                      ? String(ts)
                                      : null;
                            if (!tsStr) continue;
                            const dt = new Date(tsStr.replace("Z", "+00:00"));
                            if (isNaN(dt.getTime())) continue;
                            const key = fmtLocal(dt);
                            if (key in bucketKeys) {
                                bucketKeys[key][model] = (bucketKeys[key][model] ?? 0) + delta;
                                modelTotals[model] = (modelTotals[model] ?? 0) + delta;
                            }
                        } catch {
                            continue;
                        }
                    }
                }
            }
        } catch {
            continue;
        }
    }

    const sortedModels = Object.entries(modelTotals)
        .sort(([, a], [, b]) => b - a)
        .map(([m]) => m);

    const buckets = dateList.map((d) => {
        const bk = bucketKeys[d] ?? {};
        const segments = sortedModels
            .filter((m) => (bk[m] ?? 0) > 0)
            .map((m) => ({ model: m, tokens: Math.round(bk[m]) }));
        return { id: d, label: d.slice(5), segments };
    });

    const message = buckets.some((b) => b.segments.length > 0)
        ? undefined
        : translate(language, "no_stats_data");

    return { kind: "line", period, bucketUnit: "day", buckets, message };
}

// ---------------------------------------------------------------------------
// Chart cache
// ---------------------------------------------------------------------------

function cachePath(dataDir: string): string {
    return join(expandHome(dataDir), CACHE_FILENAME);
}

function loadChartCache(dataDir: string): Record<string, unknown> | null {
    const p = cachePath(dataDir);
    if (!existsSync(p)) return null;
    try {
        const data = JSON.parse(readFileSync(p, "utf-8")) as Record<string, unknown>;
        if (data.version !== CACHE_VERSION) return null;
        return data;
    } catch {
        return null;
    }
}

function saveChartCache(dataDir: string, cacheData: Record<string, unknown>): void {
    try {
        writeFileSync(cachePath(dataDir), JSON.stringify(cacheData), "utf-8");
    } catch {
        // best-effort
    }
}

function maintainChartCache(
    dataDir: string,
    language: AppLanguage,
    translate: (lang: AppLanguage, key: string) => string,
): Record<string, Record<string, number>> {
    const today = todayStr();
    const cutoff = addDays(today, -29);

    const cache = loadChartCache(dataDir);

    function fullScanAndSave(): Record<string, Record<string, number>> {
        const dateList = dateRange(cutoff, today);
        const files = collectSessionFiles(dataDir, cutoff, today);
        const result = parseSessionsForChart(files, dateList, "30d", language, translate);
        const days: Record<string, Record<string, number>> = {};
        for (const b of result.buckets) {
            if (b.segments.length > 0 && b.id != null) {
                days[b.id] = Object.fromEntries(b.segments.map((s) => [s.model, s.tokens]));
            }
        }
        saveChartCache(dataDir, { version: CACHE_VERSION, last_date: today, days });
        return days;
    }

    if (cache === null) return fullScanAndSave();

    const lastDate = (cache.last_date as string | undefined) ?? "2000-01-01";
    const gapDays = diffDays(today, lastDate);

    if (gapDays < 0 || gapDays > 30) return fullScanAndSave();

    // Today is always dirty — re-scan it. If gap_days >= 1, also scan missed days.
    const scanStart = gapDays === 0 ? today : addDays(lastDate, 1);
    const dayCount = diffDays(today, scanStart) + 1;
    const scanDates: string[] = [];
    for (let i = 0; i < dayCount; i++) scanDates.push(addDays(scanStart, i));

    const files = collectSessionFiles(dataDir, scanStart, today);
    const result = parseSessionsForChart(files, scanDates, "30d", language, translate);
    const newDays: Record<string, Record<string, number>> = {};
    for (const b of result.buckets) {
        if (b.segments.length > 0 && b.id != null) {
            newDays[b.id] = Object.fromEntries(b.segments.map((s) => [s.model, s.tokens]));
        }
    }

    // Merge: keep old cached days that are still within the 30-day window but before scanStart
    const merged: Record<string, Record<string, number>> = {};
    const oldDays = (cache.days ?? {}) as Record<string, Record<string, number>>;
    for (const [d, v] of Object.entries(oldDays)) {
        if (d >= cutoff && d < scanStart) merged[d] = v;
    }

    for (let i = 0; i < dayCount; i++) {
        const dateStr = addDays(scanStart, i);
        merged[dateStr] = newDays[dateStr] ?? {};
    }

    saveChartCache(dataDir, { version: CACHE_VERSION, last_date: today, days: merged });
    return merged;
}

function buildChartFromCache(
    daily: Record<string, Record<string, number>>,
    period: string,
    language: AppLanguage,
    translate: (lang: AppLanguage, key: string) => string,
): PluginChart {
    const dayCount = ({ "7d": 7, "15d": 15, "30d": 30 } as Record<string, number>)[period] ?? 7;
    const today = todayStr();

    // dateList: oldest → newest
    const dateList: string[] = [];
    for (let i = dayCount - 1; i >= 0; i--) dateList.push(addDays(today, -i));

    // Determine model order by total tokens descending
    const modelTotals: Record<string, number> = {};
    for (const date of dateList) {
        const dayData = daily[date] ?? {};
        for (const [model, tokens] of Object.entries(dayData)) {
            modelTotals[model] = (modelTotals[model] ?? 0) + tokens;
        }
    }
    const sortedModels = Object.entries(modelTotals)
        .sort(([, a], [, b]) => b - a)
        .map(([m]) => m);

    const buckets = dateList.map((date) => {
        const dayData = daily[date] ?? {};
        const segments = sortedModels
            .filter((m) => (dayData[m] ?? 0) > 0)
            .map((m) => ({ model: m, tokens: Math.round(dayData[m]) }));
        return { id: date, label: date.slice(5), segments };
    });

    const message = buckets.some((b) => b.segments.length > 0)
        ? undefined
        : translate(language, "no_stats_data");

    return { kind: "line", period, bucketUnit: "day", buckets, message };
}

function chartMessage(msg: string, period: string, dateList: string[]): PluginChart {
    return {
        kind: "line",
        period,
        bucketUnit: "day",
        buckets: dateList.map((d) => ({ id: d, label: d.slice(5), segments: [] })),
        message: msg,
    };
}

function statRangeDates(period: string): string[] {
    const dayCount = ({ "7d": 7, "15d": 15, "30d": 30 } as Record<string, number>)[period] ?? 7;
    const today = todayStr();
    return dateRange(addDays(today, -(dayCount - 1)), today);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

definePlugin(async ({ params }) => {
    const language = appLanguage(params);
    const translate = makeTranslator(translations);
    const authFile = params.AUTH_FILE ?? "~/.codex/auth.json";
    const dataDir = resolve(expandHome(params.DATA_DIR ?? "~/.codex"));
    const enableStats = (params.ENABLE_STATS ?? "true").toLowerCase() !== "false";
    let period = (params.STAT_PERIOD ?? "7d").toLowerCase();
    if (period !== "7d" && period !== "15d" && period !== "30d") period = "7d";

    // --- Auth ---
    const auth = loadAuth(authFile);
    if (!auth) {
        return fail(
            "AUTH_FILE_NOT_FOUND",
            translate(language, "auth_file_not_found", { path: expandHome(authFile) }),
        );
    }

    const [accessToken, accountId] = extractAuthCredentials(auth);
    if (!accessToken || !accountId) {
        return fail("AUTH_TOKEN_MISSING", translate(language, "auth_token_missing"));
    }

    // --- Fetch usage ---
    let payload: Record<string, unknown>;
    try {
        payload = await fetchJson<Record<string, unknown>>(ENDPOINT, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/json",
                "ChatGPT-Account-Id": accountId,
                Origin: "https://chatgpt.com",
                Referer: "https://chatgpt.com/",
                "User-Agent": "Mozilla/5.0",
            },
        });
    } catch (err) {
        if (err instanceof PluginHttpError) {
            if (err.statusCode === 401)
                return fail("TOKEN_EXPIRED", translate(language, "token_expired"));
            if (err.statusCode === 403)
                return fail("UNAUTHORIZED", translate(language, "unauthorized"));
            if (err.statusCode === 0)
                return fail("NETWORK_ERROR", translate(language, "network_error"));
            return fail(`HTTP_${String(err.statusCode)}`, err.message);
        }
        return fail("NETWORK_ERROR", translate(language, "network_error"));
    }

    // --- Build items ---
    let items: Record<string, unknown>[];
    let badge: string | null;
    try {
        const result = buildItems(payload, language, translate);
        items = result.items;
        badge = result.badge;
    } catch {
        return fail("USAGE_PARSE_FAILED", translate(language, "usage_parse_failed"));
    }

    // --- Chart ---
    let chart: PluginChart | undefined;
    if (enableStats) {
        try {
            const daily = maintainChartCache(dataDir, language, translate);
            chart = buildChartFromCache(daily, period, language, translate);
        } catch {
            const dateList = statRangeDates(period);
            chart = chartMessage(translate(language, "stats_parse_failed"), period, dateList);
        }
    }

    if (items.length === 0) {
        return fail("NO_QUOTA_DATA", translate(language, "no_quota_data"));
    }

    return ok({ items, ...(badge !== null && { badge }), ...(chart !== undefined && { chart }) });
});
