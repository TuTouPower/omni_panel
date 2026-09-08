import type { ConnectorContext } from "../../src/main/core/connector/host-io";
import type { ScriptObservation } from "../../src/shared/types/observation";

// NOTE: All 4 provider parsers live in one file because the connector runtime
// (runtime.ts:compile_script) forbids runtime import/export. Splitting requires
// runtime changes to support module bundling. See review #11.

declare const ctx: ConnectorContext;

interface AuthFile {
    readonly name: string;
    readonly provider: string;
    readonly auth_index: string;
    readonly email?: string;
    readonly remark?: string;
    readonly masked_identifier?: string;
    readonly disabled?: boolean;
}

interface AuthFilesResponse {
    readonly files?: AuthFile[];
}

interface ApiCallResult {
    readonly status_code: number;
    readonly body: unknown;
}

interface CpaAccount {
    readonly account_id: string;
    readonly account_label: string;
}

function is_record(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function to_number(value: unknown): number {
    const parsed = typeof value === "number" ? value : Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

function to_pct(value: unknown): number {
    const raw = to_number(value);
    const pct = raw <= 1 ? raw * 100 : raw;
    // t361 AC-002: 钳制 [0,100]，负值/超 100 不再出现。
    return Math.round(Math.max(0, Math.min(pct, 100)) * 10) / 10;
}

function to_reset_at(value: unknown): number | null {
    if (typeof value !== "string" || !value) return null;
    const ts = Date.parse(value);
    return Number.isFinite(ts) ? ts : null;
}

function extract_email(name: string): string {
    const base = (name.split("/").pop() ?? name).replace(/\.json$/, "");
    const normalized = base.replace(/^auth-/, "").replace(/^[0-9a-f]{8,10}-/, "");
    const match = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(normalized);
    if (match?.[0]) return match[0].replace(/-(?:plus|pro|team[0-9a-f]*|free)$/, "");
    const parts = base.split("-", 2);
    if (parts.length < 2) return base;
    return (parts[1] ?? "")
        .replace(/^[0-9a-f]{8,10}-/, "")
        .replace(/-(?:plus|pro|team[0-9a-f]*|free)$/, "");
}

function account_from_auth_file(af: AuthFile): CpaAccount {
    const extracted = extract_email(af.name);
    return {
        account_id: af.auth_index,
        account_label:
            af.email ??
            af.remark ??
            af.masked_identifier ??
            (extracted.includes("@") ? extracted : `Account ${af.auth_index}`),
    };
}

// ─── CPA Manager HTTP ──────────────────────────────────

async function cpa_api_call(
    mgmt_key: string,
    method: string,
    url: string,
    auth_index: string,
    headers: Record<string, string>,
    body?: unknown,
): Promise<ApiCallResult> {
    const payload: Record<string, unknown> = { method, url, auth_index, header: headers };
    if (body !== undefined) payload["data"] = JSON.stringify(body);
    return (await ctx.http.post_json("default", "/v0/management/api-call", payload, {
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${mgmt_key}` },
    })) as ApiCallResult;
}

function parse_api_body(result: ApiCallResult): Record<string, unknown> {
    if (result.status_code < 200 || result.status_code >= 300) return {};
    const body = result.body;
    if (typeof body === "string") {
        try {
            return JSON.parse(body) as Record<string, unknown>;
        } catch {
            return {};
        }
    }
    return is_record(body) ? body : {};
}

// ─── Claude ────────────────────────────────────────────

function parse_claude(
    body: Record<string, unknown>,
    account: CpaAccount,
    now: number,
): ScriptObservation[] {
    const periods: [string, string, string, "second" | "day", number][] = [
        ["five_hour", "five_hour", "5小时", "second", 5 * 3_600_000],
        ["seven_day", "seven_day", "一周", "day", 7 * 24 * 3_600_000],
    ];
    return periods.map(([key, raw_label, normalized_label, window, cycleDurationMs]) => {
        const period = body[key];
        // utilization is fraction used (0.34 = 34% used).
        const pct = is_record(period) ? to_pct(period["utilization"]) : 0;
        const reset_at = is_record(period) ? to_reset_at(period["resets_at"]) : null;
        return {
            provider: "claude",
            account_id: account.account_id,
            account_label: account.account_label,
            metric_id: `claude:${account.account_id}:${key}`,
            raw_label,
            normalized_label,
            window,
            cycleDurationMs,
            used: pct,
            limit: 100,
            display_style: "percent",
            reset_at,
            status: ctx.status.for_pct(pct),
            observed_at: now,
            source: "gateway",
            stale: false,
            last_error: null,
        } satisfies ScriptObservation;
    });
}

// ─── Codex ─────────────────────────────────────────────

interface CodexWindowDescriptor {
    readonly normalized_label: string;
    readonly window: "second" | "day" | "month";
    readonly cycleDurationMs: number | null;
}

function resolve_codex_window(
    duration_seconds: unknown,
    fallback_label: string,
): CodexWindowDescriptor {
    // t361 AC-003: string 型 duration 先 Number() 归一，统一识别数值语义。
    const secs =
        typeof duration_seconds === "number"
            ? duration_seconds
            : Number.isFinite(Number(duration_seconds))
              ? Number(duration_seconds)
              : NaN;
    if (secs === 18_000) {
        return { normalized_label: "5小时", window: "second", cycleDurationMs: 18_000_000 };
    }
    if (secs === 604_800) {
        return { normalized_label: "一周", window: "day", cycleDurationMs: 604_800_000 };
    }
    if (secs === 2_628_000) {
        return { normalized_label: "一月", window: "month", cycleDurationMs: 2_628_000_000 };
    }
    if (Number.isFinite(secs) && secs > 0) {
        return {
            normalized_label: `窗口 ${String(secs)} 秒`,
            window: "second",
            cycleDurationMs: secs * 1000,
        };
    }
    return { normalized_label: fallback_label, window: "second", cycleDurationMs: null };
}

function parse_codex(
    body: Record<string, unknown>,
    account: CpaAccount,
    now: number,
): ScriptObservation[] {
    const rl = body["rate_limit"] ?? body["rateLimit"];
    if (!is_record(rl)) return [];
    // used_percent is integer percent USED (100 = fully consumed, 18 = 18%).
    const windows: [string, string][] = [
        ["primary_window", "主限额"],
        ["secondary_window", "次限额"],
    ];
    const observations: ScriptObservation[] = [];
    for (const [key, fallback_label] of windows) {
        const camel_key = key === "primary_window" ? "primaryWindow" : "secondaryWindow";
        const w = rl[key] ?? rl[camel_key];
        if (!is_record(w)) continue;
        const { normalized_label, window, cycleDurationMs } = resolve_codex_window(
            w["limit_window_seconds"] ?? w["limitWindowSeconds"],
            fallback_label,
        );
        const pct = Math.min(to_number(w["used_percent"] ?? w["usedPercent"]), 100);
        const raw_reset = w["reset_at"] ?? w["resetAt"];
        let reset_at: number | null = null;
        if (raw_reset != null) {
            let ts = Number(raw_reset);
            if (ts < 1e12) ts *= 1000;
            if (Number.isFinite(ts)) reset_at = ts;
        } else {
            const reset_after_seconds = w["reset_after_seconds"] ?? w["resetAfterSeconds"];
            if (reset_after_seconds != null) {
                reset_at = Date.now() + Number(reset_after_seconds) * 1000;
            }
        }
        observations.push({
            provider: "codex",
            account_id: account.account_id,
            account_label: account.account_label,
            metric_id: `codex:${account.account_id}:${key}`,
            raw_label: key,
            normalized_label,
            window,
            cycleDurationMs,
            used: pct,
            limit: 100,
            display_style: "percent",
            reset_at,
            status: ctx.status.for_pct(pct),
            observed_at: now,
            source: "gateway",
            stale: false,
            last_error: null,
        });
    }
    return observations;
}

// ─── Antigravity ───────────────────────────────────────
// t462: 主路径为 retrieveUserQuotaSummary（groups/buckets，5h + weekly），
// 无可用数据时回退 fetchAvailableModels（models 共享组）。上游已不再提供 GPT。

const ANTIGRAVITY_QUOTA_SUMMARY_URLS = [
    "https://daily-cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary",
    "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:retrieveUserQuotaSummary",
    "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary",
];

const ANTIGRAVITY_AVAILABLE_MODELS_URLS = [
    "https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels",
    "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:fetchAvailableModels",
    "https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels",
];

// 对齐 CPA-Manager-Plus 的 antigravity/cli UA（公开常量，非 secret）。
const ANTIGRAVITY_USER_AGENT = "antigravity/cli/1.0.13 (aidev_client; os_type=darwin; arch=arm64)";

interface AntigravityQuotaGroup {
    readonly id: string;
    readonly label: string;
    readonly provider_values: readonly string[];
}

const ANTIGRAVITY_QUOTA_GROUPS: readonly AntigravityQuotaGroup[] = [
    {
        id: "gemini",
        label: "Gemini",
        provider_values: ["API_PROVIDER_GOOGLE_GEMINI"],
    },
    {
        id: "claude",
        label: "Claude",
        provider_values: ["API_PROVIDER_ANTHROPIC_VERTEX", "MODEL_PROVIDER_ANTHROPIC"],
    },
];

function matches_antigravity_group(
    model_info: Record<string, unknown>,
    group: AntigravityQuotaGroup,
): boolean {
    const api_provider =
        typeof model_info["apiProvider"] === "string" ? model_info["apiProvider"] : "";
    const model_provider =
        typeof model_info["modelProvider"] === "string" ? model_info["modelProvider"] : "";
    return (
        group.provider_values.includes(api_provider) ||
        group.provider_values.includes(model_provider)
    );
}

// remainingFraction 缺失与 0 必须区分：缺失（非有限数）返回 null 由调用方跳过，
// 显式 0 保留（按耗尽处理）。对齐 CPA-Manager-Plus 的 normalizeQuotaFraction。
function extract_remaining_fraction(record: Record<string, unknown>): number | null {
    const direct = record["remainingFraction"] ?? record["remaining_fraction"];
    if (typeof direct === "number" && Number.isFinite(direct)) return direct;
    if (typeof direct === "string" && direct.trim() !== "" && Number.isFinite(Number(direct))) {
        return Number(direct);
    }
    const quota = record["quotaInfo"] ?? record["quota_info"];
    if (!is_record(quota)) return null;
    const nested = quota["remainingFraction"] ?? quota["remaining_fraction"] ?? quota["remaining"];
    if (typeof nested === "number" && Number.isFinite(nested)) return nested;
    if (typeof nested === "string" && nested.trim() !== "" && Number.isFinite(Number(nested))) {
        return Number(nested);
    }
    return null;
}

function remaining_to_used(remaining: number): number {
    const pct = remaining <= 1 ? remaining * 100 : remaining;
    return Math.round(Math.min(Math.max(0, 100 - pct), 100) * 10) / 10;
}

// summary 分组归属：按组 displayName 文本识别 gemini / claude；GPT 与未知分组返回 null 跳过。
function classify_antigravity_family(group: Record<string, unknown>): "gemini" | "claude" | null {
    const label = group["displayName"] ?? group["display_name"];
    if (typeof label !== "string") return null;
    const text = label.toLowerCase();
    if (text.includes("gemini")) return "gemini";
    if (text.includes("claude") || text.includes("anthropic")) return "claude";
    return null;
}

interface AntigravityWindowDescriptor {
    readonly key: "five_hour" | "weekly";
    readonly window: "second" | "day";
    readonly cycleDurationMs: number;
    readonly label: string;
}

function classify_antigravity_window(window: unknown): AntigravityWindowDescriptor | null {
    const text = typeof window === "string" ? window.trim().toLowerCase() : "";
    if (text === "5h" || text === "5-hour" || text === "five-hour" || text === "five_hour") {
        return { key: "five_hour", window: "second", cycleDurationMs: 18_000_000, label: "5小时" };
    }
    if (text === "weekly" || text === "week" || text === "7d") {
        return { key: "weekly", window: "day", cycleDurationMs: 604_800_000, label: "一周" };
    }
    return null;
}

function to_stable_id(value: string, fallback: string): string {
    const normalized = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
    return normalized || fallback;
}

function make_antigravity_observation(
    account: CpaAccount,
    now: number,
    metric_key: string,
    normalized_label: string,
    window: "second" | "day",
    cycleDurationMs: number | null,
    used: number,
    reset_at: number | null,
): ScriptObservation {
    return {
        provider: "antigravity",
        account_id: account.account_id,
        account_label: account.account_label,
        metric_id: `antigravity:${account.account_id}:${metric_key}`,
        raw_label: metric_key,
        normalized_label,
        window,
        cycleDurationMs,
        used,
        limit: 100,
        display_style: "percent",
        reset_at,
        status: ctx.status.for_pct(used),
        observed_at: now,
        source: "gateway",
        stale: false,
        last_error: null,
    } satisfies ScriptObservation;
}

function parse_antigravity_summary(
    body: Record<string, unknown>,
    account: CpaAccount,
    now: number,
): ScriptObservation[] {
    const groups = body["groups"];
    if (!Array.isArray(groups)) return [];
    const observations: ScriptObservation[] = [];
    for (const group of groups) {
        if (!is_record(group)) continue;
        const family = classify_antigravity_family(group);
        if (family === null) continue;
        const family_label = family === "gemini" ? "Gemini" : "Claude";
        const buckets = group["buckets"];
        if (!Array.isArray(buckets)) continue;
        buckets.forEach((bucket, bucket_index) => {
            if (!is_record(bucket)) return;
            const remaining = extract_remaining_fraction(bucket);
            if (remaining === null) return;
            const used = remaining_to_used(remaining);
            const reset_at = to_reset_at(bucket["resetTime"] ?? bucket["reset_time"]);
            const descriptor = classify_antigravity_window(bucket["window"]);
            if (descriptor === null) {
                // 未知窗口不丢数据：无周期观测（upcoming-reset 跳过 cycle null）。
                const raw_id =
                    bucket["bucketId"] ??
                    bucket["bucket_id"] ??
                    bucket["displayName"] ??
                    bucket["display_name"];
                const bucket_label =
                    bucket["displayName"] ??
                    bucket["display_name"] ??
                    `bucket-${String(bucket_index + 1)}`;
                const key = `${family}_${to_stable_id(typeof raw_id === "string" ? raw_id : "", `bucket_${String(bucket_index + 1)}`)}`;
                observations.push(
                    make_antigravity_observation(
                        account,
                        now,
                        key,
                        `${family_label} ${typeof bucket_label === "string" ? bucket_label : `bucket-${String(bucket_index + 1)}`}`,
                        "second",
                        null,
                        used,
                        reset_at,
                    ),
                );
                return;
            }
            const key = `${family}_${descriptor.key}`;
            observations.push(
                make_antigravity_observation(
                    account,
                    now,
                    key,
                    `${family_label} ${descriptor.label}`,
                    descriptor.window,
                    descriptor.cycleDurationMs,
                    used,
                    reset_at,
                ),
            );
        });
    }
    return observations;
}

function parse_antigravity_models(
    body: Record<string, unknown>,
    account: CpaAccount,
    now: number,
): ScriptObservation[] {
    const models = body["models"];
    if (!is_record(models)) return [];
    const observations: ScriptObservation[] = [];

    for (const group of ANTIGRAVITY_QUOTA_GROUPS) {
        let min_remaining = 100;
        let reset_at: number | null = null;
        let found = false;

        for (const model_info of Object.values(models)) {
            if (!is_record(model_info)) continue;
            if (!matches_antigravity_group(model_info, group)) continue;

            const quota = model_info["quotaInfo"] ?? model_info["quota_info"];
            const quota_record = is_record(quota) ? quota : null;
            const model_reset = quota_record
                ? to_reset_at(quota_record["resetTime"] ?? quota_record["reset_time"])
                : null;
            const remaining = extract_remaining_fraction(model_info);
            if (remaining === null) {
                // 缺字段且有 resetTime 视为耗尽（对齐 CPA-Manager-Plus）；两者皆无则跳过，
                // 不按 0 参与聚合，避免误报整组 100% 用尽。
                if (model_reset === null) continue;
                if (!found || 0 < min_remaining) {
                    min_remaining = 0;
                    reset_at = model_reset;
                }
                found = true;
                continue;
            }
            let pct = remaining;
            if (pct <= 1) pct *= 100;
            if (!found || pct < min_remaining) {
                min_remaining = pct;
                reset_at = model_reset;
            }
            found = true;
        }

        if (!found) continue;
        const used = Math.round(Math.min(Math.max(0, 100 - min_remaining), 100) * 10) / 10;
        observations.push(
            make_antigravity_observation(
                account,
                now,
                `${group.id}_shared`,
                group.label,
                "second",
                null,
                used,
                reset_at,
            ),
        );
    }
    return observations;
}

function parse_antigravity(
    body: Record<string, unknown>,
    account: CpaAccount,
    now: number,
): ScriptObservation[] {
    if (Array.isArray(body["groups"])) return parse_antigravity_summary(body, account, now);
    return parse_antigravity_models(body, account, now);
}

function summary_has_usable_buckets(body: Record<string, unknown>): boolean {
    const groups = body["groups"];
    if (!Array.isArray(groups)) return false;
    for (const group of groups) {
        if (!is_record(group)) continue;
        if (classify_antigravity_family(group) === null) continue;
        const buckets = group["buckets"];
        if (!Array.isArray(buckets)) continue;
        for (const bucket of buckets) {
            if (!is_record(bucket)) continue;
            if (extract_remaining_fraction(bucket) !== null) return true;
        }
    }
    return false;
}

// ─── Kimi ──────────────────────────────────────────────

function parse_kimi(
    body: Record<string, unknown>,
    account: CpaAccount,
    now: number,
): ScriptObservation[] {
    const limits = body["limits"];
    if (!Array.isArray(limits)) return [];
    const observations: ScriptObservation[] = [];
    for (const entry of limits) {
        if (!is_record(entry)) continue;
        const total = to_number(entry["limit"]);
        if (total <= 0) continue;
        const used = to_number(entry["used"]);
        const pct = Math.round((used / total) * 1000) / 10;
        const name_field = typeof entry["name"] === "string" ? entry["name"] : "";
        const title_field = typeof entry["title"] === "string" ? entry["title"] : "";
        const duration = typeof entry["duration"] === "string" ? entry["duration"] : "";
        const time_unit = typeof entry["timeUnit"] === "string" ? entry["timeUnit"] : "";
        const period_label =
            duration && time_unit ? `${duration} ${time_unit}` : title_field || name_field;
        const reset_at = to_reset_at(entry["reset_at"] ?? entry["resetAt"]);
        observations.push({
            provider: "kimi",
            account_id: account.account_id,
            account_label: account.account_label,
            metric_id: `kimi:${account.account_id}:${period_label}`,
            raw_label: name_field || period_label,
            normalized_label: period_label,
            window: "day",
            cycleDurationMs: null,
            used: pct,
            limit: 100,
            display_style: "percent",
            reset_at,
            status: ctx.status.for_pct(pct),
            observed_at: now,
            source: "gateway",
            stale: false,
            last_error: null,
        });
    }
    return observations;
}

// ─── Load Code Assist (Antigravity helper) ──────

async function load_code_assist_project(mgmt_key: string, auth_index: string): Promise<string> {
    try {
        const result = await cpa_api_call(
            mgmt_key,
            "POST",
            "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist",
            auth_index,
            { Authorization: "Bearer $TOKEN$", "Content-Type": "application/json" },
            {},
        );
        const body = parse_api_body(result);
        return typeof body["cloudaicompanionProject"] === "string"
            ? body["cloudaicompanionProject"]
            : "";
    } catch {
        return "";
    }
}

// ─── Provider dispatch ─────────────────────────────────

async function fetch_provider(
    provider: string,
    mgmt_key: string,
    auth_index: string,
): Promise<Record<string, unknown>> {
    if (provider === "claude") {
        const result = await cpa_api_call(
            mgmt_key,
            "GET",
            "https://api.anthropic.com/api/oauth/usage",
            auth_index,
            {
                Authorization: "Bearer $TOKEN$",
                "Content-Type": "application/json",
                "anthropic-beta": "oauth-2025-04-20",
            },
        );
        return parse_api_body(result);
    }
    if (provider === "codex") {
        const result = await cpa_api_call(
            mgmt_key,
            "GET",
            "https://chatgpt.com/backend-api/wham/usage",
            auth_index,
            {
                Authorization: "Bearer $TOKEN$",
                "Content-Type": "application/json",
                "User-Agent": "codex_cli_rs/0.76.0 (Debian 13.0.0; x86_64) WindowsTerminal",
            },
        );
        return parse_api_body(result);
    }
    if (provider === "antigravity") {
        const project = await load_code_assist_project(mgmt_key, auth_index);
        const body: Record<string, unknown> = {};
        if (project) body["project"] = project;
        let last_error: Error | null = null;
        const urls = [...ANTIGRAVITY_QUOTA_SUMMARY_URLS, ...ANTIGRAVITY_AVAILABLE_MODELS_URLS];
        for (const url of urls) {
            try {
                const result = await cpa_api_call(
                    mgmt_key,
                    "POST",
                    url,
                    auth_index,
                    {
                        Authorization: "Bearer $TOKEN$",
                        "Content-Type": "application/json",
                        "User-Agent": ANTIGRAVITY_USER_AGENT,
                    },
                    body,
                );
                const parsed = parse_api_body(result);
                if (Object.keys(parsed).length === 0) continue;
                // summary 形态但无可用 bucket（显式空库存 / GPT 专属 / 字段缺失）时继续走
                // 剩余 URL，最终落到模型列表回退；对齐 CPA-Manager-Plus 的空 groups 继续逻辑。
                if (Array.isArray(parsed["groups"]) && !summary_has_usable_buckets(parsed)) {
                    continue;
                }
                return parsed;
            } catch (err) {
                last_error = err instanceof Error ? err : new Error(String(err));
            }
        }
        throw last_error ?? new Error("All Antigravity URLs failed");
    }
    if (provider === "kimi") {
        const result = await cpa_api_call(
            mgmt_key,
            "GET",
            "https://api.kimi.com/coding/v1/usages",
            auth_index,
            {
                Authorization: "Bearer $TOKEN$",
            },
        );
        return parse_api_body(result);
    }
    return {};
}

function parse_provider(
    provider: string,
    body: Record<string, unknown>,
    account: CpaAccount,
    now: number,
): ScriptObservation[] {
    if (provider === "claude") return parse_claude(body, account, now);
    if (provider === "codex") return parse_codex(body, account, now);
    if (provider === "antigravity") return parse_antigravity(body, account, now);
    if (provider === "kimi") return parse_kimi(body, account, now);
    return [];
}

// ─── Main ──────────────────────────────────────────────

async function main(): Promise<ScriptObservation[]> {
    const mgmt_key = (ctx.params["cpa_mgmt_key"] ?? "").trim();
    if (!mgmt_key) return [];

    const auth_files_response = (await ctx.http.get_json("default", "/v0/management/auth-files", {
        headers: { Authorization: `Bearer ${mgmt_key}` },
    })) as AuthFilesResponse;
    const files = auth_files_response.files ?? [];
    ctx.log.debug(`CPA fetching ${String(files.length)} auth files`);
    const now = Date.now();
    const observations: ScriptObservation[] = [];

    for (const auth_file of files) {
        if (auth_file.disabled) continue;

        const monitor_key = `monitor_${auth_file.provider}`;
        if ((ctx.params[monitor_key] ?? "true").toLowerCase() !== "true") continue;

        const account = account_from_auth_file(auth_file);
        try {
            const body = await fetch_provider(auth_file.provider, mgmt_key, auth_file.auth_index);
            const keys = Object.keys(body);
            if (keys.length === 0) {
                ctx.report_failed_account(
                    auth_file.provider,
                    account.account_id,
                    account.account_label,
                    `CPA ${auth_file.provider} 上游返回空响应`,
                );
                continue;
            }
            ctx.log.debug(`CPA ${auth_file.provider} response: ${JSON.stringify(body)}`);
            observations.push(...parse_provider(auth_file.provider, body, account, now));
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            ctx.log.warn(`CPA ${auth_file.provider} (${account.account_label}) failed: ${msg}`);
            ctx.report_failed_account(
                auth_file.provider,
                account.account_id,
                account.account_label,
                msg,
            );
            continue;
        }
    }

    return observations;
}

void main;
