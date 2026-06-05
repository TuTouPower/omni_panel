// UsageBoardPlugin:
// {
//   "schemaVersion": 1,
//   "name": "CPA",
//   "supportedProviders": ["claude", "codex", "gemini", "antigravity", "kimi"],
//   "defaultSource": "cpa",
//   "name@zh-Hans": "CPA 额度",
//   "name@en": "CPA Quota",
//   "description": "Get quota from Claude/Codex/Gemini/Antigravity/Kimi via CPA-Manager",
//   "description@zh-Hans": "通过 CPA-Manager 获取 Claude/Codex/Gemini/Antigravity/Kimi 额度",
//   "description@en": "Get quota from Claude/Codex/Gemini/Antigravity/Kimi via CPA-Manager",
//   "endpoints": {
//     "default": null
//   },
//   "parameters": [
//     {
//       "name": "cpa_mgmt_key",
//       "label": "Management Key",
//       "label@zh-Hans": "管理密钥",
//       "label@en": "Management Key",
//       "type": "secret",
//       "required": true,
//       "placeholder": "CPA-Manager management key"
//     },
//     {
//       "name": "monitor_claude",
//       "label": "Monitor Claude",
//       "label@zh-Hans": "监控 Claude",
//       "label@en": "Monitor Claude",
//       "type": "boolean",
//       "required": false,
//       "defaultValue": "true"
//     },
//     {
//       "name": "monitor_codex",
//       "label": "Monitor Codex",
//       "label@zh-Hans": "监控 Codex",
//       "label@en": "Monitor Codex",
//       "type": "boolean",
//       "required": false,
//       "defaultValue": "true"
//     },
//     {
//       "name": "monitor_gemini",
//       "label": "Monitor Gemini",
//       "label@zh-Hans": "监控 Gemini",
//       "label@en": "Monitor Gemini",
//       "type": "boolean",
//       "required": false,
//       "defaultValue": "true"
//     },
//     {
//       "name": "monitor_antigravity",
//       "label": "Monitor Antigravity",
//       "label@zh-Hans": "监控 Antigravity",
//       "label@en": "Monitor Antigravity",
//       "type": "boolean",
//       "required": false,
//       "defaultValue": "true"
//     },
//     {
//       "name": "monitor_kimi",
//       "label": "Monitor Kimi",
//       "label@zh-Hans": "监控 Kimi",
//       "label@en": "Monitor Kimi",
//       "type": "boolean",
//       "required": false,
//       "defaultValue": "true"
//     }
//   ]
// }
// /UsageBoardPlugin

import { definePlugin, ok, failFromHttp, statusFor, colorForPct } from "@omni-usage/plugin-sdk";
import type { HttpClient, HttpError, UsageItem } from "@omni-usage/plugin-sdk";

// ─── Types ──────────────────────────────────────────────

interface AuthFile {
    name: string;
    provider: string;
    auth_index: string;
    email?: string;
    remark?: string;
    identifier?: string;
    masked_identifier?: string;
    disabled?: boolean;
}

interface ApiCallResult {
    status_code: number;
    body: unknown;
}

type UsageProvider = UsageItem["provider"];

interface CpaAccount {
    accountId: string;
    accountLabel: string;
}

// ─── Constants ──────────────────────────────────────────

const ANTIGRAVITY_URLS = [
    "https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels",
    "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:fetchAvailableModels",
    "https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels",
];
const SOURCE_INSTANCE_ID = process.env.OMNI_SOURCE_INSTANCE_ID ?? "unknown-source";

function itemContext(provider: UsageProvider, account: CpaAccount) {
    return {
        provider,
        source: "cpa" as const,
        sourceInstanceId: SOURCE_INSTANCE_ID,
        accountId: account.accountId,
        accountLabel: account.accountLabel,
    };
}

// ─── Email extraction ──────────────────────────────────

function extractEmail(name: string): string {
    const base = (name.split("/").pop() ?? name).replace(/\.json$/, "");
    const normalized = base.replace(/^auth-/, "").replace(/^[0-9a-f]{8,10}-/, "");
    const emailMatch = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(normalized);
    if (emailMatch?.[0]) return emailMatch[0].replace(/-(?:plus|pro|team[0-9a-f]*|free)$/, "");
    const parts = base.split("-", 2);
    if (parts.length < 2) return base;
    let email = parts[1] ?? "";
    email = email.replace(/^[0-9a-f]{8,10}-/, "");
    email = email.replace(/-(?:plus|pro|team[0-9a-f]*|free)$/, "");
    return email;
}

function accountFromAuthFile(authFile: AuthFile): CpaAccount {
    const extractedEmail = extractEmail(authFile.name);
    const label =
        authFile.email ??
        authFile.remark ??
        authFile.masked_identifier ??
        (extractedEmail.includes("@") ? extractedEmail : `Account ${authFile.auth_index}`);
    return { accountId: authFile.auth_index, accountLabel: label };
}

// ─── CPA-Manager HTTP helpers ──────────────────────────

async function cpaApiCall(
    http: HttpClient,
    mgmtKey: string,
    method: string,
    url: string,
    authIndex: string,
    reqHeaders: Record<string, string>,
    reqBody?: Record<string, unknown>,
): Promise<ApiCallResult> {
    const payload: Record<string, unknown> = {
        method,
        url,
        auth_index: authIndex,
        header: reqHeaders,
    };
    if (reqBody !== undefined) {
        payload.data = JSON.stringify(reqBody);
    }
    const result = await http.postJson<ApiCallResult>("default", "/v0/management/api-call", {
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${mgmtKey}`,
        },
        body: payload,
    });
    if (!result.ok) throw Object.assign(new Error("http"), result.error);
    return result.value;
}

async function cpaGetAuthFiles(http: HttpClient, mgmtKey: string): Promise<AuthFile[]> {
    const result = await http.getJson<{ files?: AuthFile[] }>(
        "default",
        "/v0/management/auth-files",
        {
            headers: { Authorization: `Bearer ${mgmtKey}` },
        },
    );
    if (!result.ok) throw Object.assign(new Error("http"), result.error);
    return result.value.files ?? [];
}

async function loadCodeAssistProject(
    http: HttpClient,
    mgmtKey: string,
    authIndex: string,
): Promise<string> {
    const result = await cpaApiCall(
        http,
        mgmtKey,
        "POST",
        "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist",
        authIndex,
        { Authorization: "Bearer $TOKEN$", "Content-Type": "application/json" },
        {},
    );
    if (result.status_code < 200 || result.status_code >= 300) return "";
    const body = (
        typeof result.body === "string" ? JSON.parse(result.body) : result.body
    ) as Record<string, unknown>;
    return typeof body.cloudaicompanionProject === "string" ? body.cloudaicompanionProject : "";
}

// ─── API result parser ─────────────────────────────────

function parseApiResult(result: ApiCallResult): Record<string, unknown> {
    if (result.status_code < 200 || result.status_code >= 300) {
        throw new Error(`Upstream API returned HTTP ${String(result.status_code)}`);
    }
    const body = result.body;
    if (typeof body === "string") return JSON.parse(body) as Record<string, unknown>;
    return body as Record<string, unknown>;
}

// ─── Provider parsers ─────────────────────────────────

function parseClaude(body: Record<string, unknown>, account: CpaAccount): UsageItem[] {
    const items: UsageItem[] = [];
    const periods: [string, string][] = [
        ["five_hour", "5小时"],
        ["seven_day", "每周"],
    ];
    for (const [periodKey, label] of periods) {
        const period = body[periodKey] as Record<string, unknown> | undefined;
        if (typeof period !== "object") continue;
        const rawUtil = Number(period.utilization ?? 0);
        let pct = rawUtil <= 1 ? rawUtil * 100 : rawUtil;
        pct = Math.min(pct, 100);
        const resetAt = (period.resets_at ??
            period.resetsAt ??
            period.reset_time ??
            period.resetTime ??
            null) as string | null;
        items.push({
            id: `claude:${account.accountId}:${label}`,
            ...itemContext("claude", account),
            name: `Claude (${account.accountLabel}) · ${label}`,
            used: Math.round(pct * 10) / 10,
            limit: 100.0,
            displayStyle: "percent",
            resetAt,
            status: statusFor(pct, 100),
            color: colorForPct(pct),
        });
    }
    return items;
}

function parseCodex(body: Record<string, unknown>, account: CpaAccount): UsageItem[] {
    const items: UsageItem[] = [];
    const rateLimit = (body.rate_limit ?? body.rateLimit ?? {}) as Record<string, unknown>;
    const windows: [string, string][] = [
        ["primary_window", "5小时"],
        ["secondary_window", "每周"],
    ];
    for (const [windowKey, label] of windows) {
        const window = (rateLimit[windowKey] ?? rateLimit[windowKey.replace(/_/g, "")]) as
            | Record<string, unknown>
            | undefined;
        if (typeof window !== "object") continue;
        if (window.used_percent === undefined && window.usedPercent === undefined) continue;
        const pct = Number(window.used_percent ?? window.usedPercent ?? 0);
        const rawReset = window.reset_at ?? window.resetAt;
        let resetAt: string | null = null;
        if (rawReset != null) {
            let ts = Number(rawReset);
            if (ts < 1e12) ts *= 1000;
            resetAt = new Date(ts).toISOString().replace(/\.\d{3}Z$/, "Z");
        } else if (window.reset_after_seconds != null) {
            resetAt = new Date(Date.now() + Number(window.reset_after_seconds) * 1000)
                .toISOString()
                .replace(/\.\d{3}Z$/, "Z");
        }
        items.push({
            id: `codex:${account.accountId}:${label}`,
            ...itemContext("codex", account),
            name: `Codex (${account.accountLabel}) · ${label}`,
            used: Math.round(pct * 10) / 10,
            limit: 100.0,
            displayStyle: "percent",
            resetAt,
            status: statusFor(pct, 100),
            color: colorForPct(pct),
        });
    }
    return items;
}

function formatGeminiModelLabel(modelId: string): string {
    return modelId
        .replace(/^gemini[-_]?/i, "")
        .split(/[-_\s]+/)
        .filter((part) => part.length > 0)
        .map((part) => {
            const lower = part.toLowerCase();
            if (lower === "pro") return "Pro";
            if (lower === "flash") return "Flash";
            return part;
        })
        .join(" ");
}

function formatGeminiTokenType(tokenType: string): string {
    const normalized = tokenType.toLowerCase().replace(/[-\s]+/g, "_");
    if (normalized === "input_tokens") return "输入";
    if (normalized === "output_tokens") return "输出";
    if (normalized === "requests") return "";
    return tokenType.replace(/[_-]+/g, " ").trim();
}

function formatGeminiBucketLabel(modelId: string, tokenType: string): string {
    const modelLabel = formatGeminiModelLabel(modelId);
    const tokenLabel = tokenType ? formatGeminiTokenType(tokenType) : "";
    return tokenLabel ? `${modelLabel} ${tokenLabel}` : modelLabel;
}

function parseGeminiBuckets(body: Record<string, unknown>, account: CpaAccount): UsageItem[] {
    const items: UsageItem[] = [];
    const buckets = (body.buckets ?? []) as Record<string, unknown>[];
    for (const bucket of buckets) {
        const modelId: string = (bucket.modelId as string | undefined) ?? "unknown";
        const tokenType: string = (bucket.tokenType as string | undefined) ?? "";
        let remaining = Number(bucket.remainingFraction ?? 1.0);
        if (remaining <= 1) remaining *= 100;
        const usedPct = Math.min(Math.max(0, 100 - remaining), 100);
        const resetAt = (bucket.resetTime ?? bucket.reset_time ?? null) as string | null;
        const label = formatGeminiBucketLabel(modelId, tokenType);
        items.push({
            id: `gemini:${account.accountId}:${label}`,
            ...itemContext("gemini", account),
            name: `Gemini (${account.accountLabel}) · ${label}`,
            used: Math.round(usedPct * 10) / 10,
            limit: 100.0,
            displayStyle: "percent",
            resetAt,
            status: statusFor(usedPct, 100),
            color: colorForPct(usedPct),
        });
    }
    return items;
}

function parseAntigravityModels(body: Record<string, unknown>, account: CpaAccount): UsageItem[] {
    const items: UsageItem[] = [];
    const models = (body.models ?? {}) as Record<string, Record<string, unknown>>;
    for (const [modelId, modelInfo] of Object.entries(models)) {
        const quotaInfo = (modelInfo.quotaInfo ?? modelInfo.quota_info) as
            | Record<string, unknown>
            | undefined;
        if (typeof quotaInfo !== "object") continue;
        let remaining = Number(quotaInfo.remainingFraction ?? 1.0);
        if (remaining <= 1) remaining *= 100;
        const usedPct = Math.min(Math.max(0, 100 - remaining), 100);
        const resetAt = (quotaInfo.resetTime ?? quotaInfo.reset_time ?? null) as string | null;
        const displayName: string = (modelInfo.displayName as string | undefined) ?? modelId;
        items.push({
            id: `antigravity:${account.accountId}:${modelId}`,
            ...itemContext("antigravity", account),
            name: `Antigravity (${account.accountLabel}) · ${displayName}`,
            used: Math.round(usedPct * 10) / 10,
            limit: 100.0,
            displayStyle: "percent",
            resetAt,
            status: statusFor(usedPct, 100),
            color: colorForPct(usedPct),
        });
    }
    return items;
}

function parseKimi(body: Record<string, unknown>, account: CpaAccount): UsageItem[] {
    const items: UsageItem[] = [];
    const limits = (body.limits ?? []) as Record<string, unknown>[];
    for (const limitEntry of limits) {
        const used = Number(limitEntry.used ?? 0);
        const total = Number(limitEntry.limit ?? 0);
        if (total <= 0) continue;
        const pct = (used / total) * 100;
        const name: string = (limitEntry.name as string | undefined) ?? "";
        const title: string = (limitEntry.title as string | undefined) ?? name;
        const duration: string = (limitEntry.duration as string | undefined) ?? "";
        const timeUnit: string = (limitEntry.timeUnit as string | undefined) ?? "";
        const periodLabel: string = duration && timeUnit ? `${duration} ${timeUnit}` : title;
        const resetAt = (limitEntry.reset_at ??
            limitEntry.resetAt ??
            (limitEntry.detail as Record<string, unknown> | undefined)?.resetAt ??
            null) as string | null;
        items.push({
            id: `kimi:${account.accountId}:${periodLabel}`,
            ...itemContext("kimi", account),
            name: `Kimi (${account.accountLabel}) · ${periodLabel}`,
            used: Math.round(pct * 10) / 10,
            limit: 100.0,
            displayStyle: "percent",
            resetAt,
            status: statusFor(pct, 100),
            color: colorForPct(pct),
        });
    }
    return items;
}

// ─── Provider fetchers ─────────────────────────────────

async function fetchClaudeQuota(http: HttpClient, mgmtKey: string, authIndex: string) {
    const result = await cpaApiCall(
        http,
        mgmtKey,
        "GET",
        "https://api.anthropic.com/api/oauth/usage",
        authIndex,
        {
            Authorization: "Bearer $TOKEN$",
            "Content-Type": "application/json",
            "anthropic-beta": "oauth-2025-04-20",
        },
    );
    return parseApiResult(result);
}

async function fetchCodexQuota(http: HttpClient, mgmtKey: string, authIndex: string) {
    const result = await cpaApiCall(
        http,
        mgmtKey,
        "GET",
        "https://chatgpt.com/backend-api/wham/usage",
        authIndex,
        {
            Authorization: "Bearer $TOKEN$",
            "Content-Type": "application/json",
            "User-Agent": "codex_cli_rs/0.76.0 (Debian 13.0.0; x86_64) WindowsTerminal",
        },
    );
    return parseApiResult(result);
}

async function fetchGeminiQuota(http: HttpClient, mgmtKey: string, authIndex: string) {
    const project = await loadCodeAssistProject(http, mgmtKey, authIndex);
    const bodyPayload: Record<string, unknown> = {};
    if (project) bodyPayload.project = project;
    const result = await cpaApiCall(
        http,
        mgmtKey,
        "POST",
        "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota",
        authIndex,
        { Authorization: "Bearer $TOKEN$", "Content-Type": "application/json" },
        bodyPayload,
    );
    return parseApiResult(result);
}

async function fetchAntigravityQuota(http: HttpClient, mgmtKey: string, authIndex: string) {
    const project = await loadCodeAssistProject(http, mgmtKey, authIndex);
    const bodyPayload: Record<string, unknown> = {};
    if (project) bodyPayload.project = project;

    let lastError: Error | null = null;
    for (const url of ANTIGRAVITY_URLS) {
        try {
            const result = await cpaApiCall(
                http,
                mgmtKey,
                "POST",
                url,
                authIndex,
                {
                    Authorization: "Bearer $TOKEN$",
                    "Content-Type": "application/json",
                    "User-Agent": "antigravity/1.11.5 windows/amd64",
                },
                bodyPayload,
            );
            return parseApiResult(result);
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
        }
    }
    throw lastError ?? new Error("All Antigravity URLs failed");
}

async function fetchKimiQuota(http: HttpClient, mgmtKey: string, authIndex: string) {
    const result = await cpaApiCall(
        http,
        mgmtKey,
        "GET",
        "https://api.kimi.com/coding/v1/usages",
        authIndex,
        { Authorization: "Bearer $TOKEN$" },
    );
    return parseApiResult(result);
}

// ─── Provider registry ─────────────────────────────────

interface ProviderEntry {
    usageProvider: UsageProvider;
    fetch: (
        http: HttpClient,
        mgmtKey: string,
        authIndex: string,
    ) => Promise<Record<string, unknown>>;
    parse: (body: Record<string, unknown>, account: CpaAccount) => UsageItem[];
}

const PROVIDER_REGISTRY: Record<string, ProviderEntry> = {
    claude: { usageProvider: "claude", fetch: fetchClaudeQuota, parse: parseClaude },
    codex: { usageProvider: "codex", fetch: fetchCodexQuota, parse: parseCodex },
    "gemini-cli": { usageProvider: "gemini", fetch: fetchGeminiQuota, parse: parseGeminiBuckets },
    antigravity: {
        usageProvider: "antigravity",
        fetch: fetchAntigravityQuota,
        parse: parseAntigravityModels,
    },
    kimi: { usageProvider: "kimi", fetch: fetchKimiQuota, parse: parseKimi },
};

// ─── Main ──────────────────────────────────────────────

definePlugin(
    async (ctx) => {
        const mgmtKey = (ctx.params.cpa_mgmt_key ?? "").trim();
        if (!mgmtKey) {
            return failFromHttp({ kind: "missing_endpoint", key: "cpa_mgmt_key" }, "cpa");
        }

        const monitorFlags: Record<string, boolean> = {
            claude: (ctx.params.monitor_claude ?? "true").toLowerCase() === "true",
            codex: (ctx.params.monitor_codex ?? "true").toLowerCase() === "true",
            "gemini-cli": (ctx.params.monitor_gemini ?? "true").toLowerCase() === "true",
            antigravity: (ctx.params.monitor_antigravity ?? "true").toLowerCase() === "true",
            kimi: (ctx.params.monitor_kimi ?? "true").toLowerCase() === "true",
        };

        let authFiles: AuthFile[];
        try {
            authFiles = await cpaGetAuthFiles(ctx.http, mgmtKey);
        } catch (err) {
            if (typeof err === "object" && err !== null && "kind" in err)
                return failFromHttp(err as HttpError, "cpa");
            return failFromHttp({ kind: "network", message: String(err) }, "cpa");
        }

        const activeAuthFiles = authFiles.filter((af) => !af.disabled && monitorFlags[af.provider]);

        const tasks = activeAuthFiles.map(async (af) => {
            const provider = PROVIDER_REGISTRY[af.provider];
            if (!provider) return [];
            const account = accountFromAuthFile(af);
            const body = await provider.fetch(ctx.http, mgmtKey, af.auth_index);
            return provider.parse(body, account);
        });

        const results = await Promise.allSettled(tasks);
        const items: UsageItem[] = [];
        const warnings: string[] = [];

        for (const result of results) {
            if (result.status === "fulfilled") {
                items.push(...result.value);
            } else {
                warnings.push(String(result.reason));
            }
        }

        if (items.length > 0) return ok({ items });
        if (warnings.length > 0)
            return failFromHttp({ kind: "network", message: warnings.join("; ") }, "cpa");
        return ok({ items });
    },
    { metadata: { endpoints: { default: null } }, translations: {} },
);
