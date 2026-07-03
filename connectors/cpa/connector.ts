import type { ConnectorContext } from "../../src/main/core/connector/host-io";
import type { Observation } from "../../src/shared/types/observation";

// NOTE: All 5 provider parsers live in one file because the connector runtime
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
    return Math.round(Math.min(pct, 100) * 10) / 10;
}

function to_reset_at(value: unknown): number | null {
    if (typeof value !== "string" || !value) return null;
    const ts = Date.parse(value);
    return Number.isFinite(ts) ? ts : null;
}

function status_for_pct(pct: number): Observation["status"] {
    if (pct >= 90) return "critical";
    if (pct >= 75) return "warning";
    return "normal";
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
): Observation[] {
    const periods: [string, string, string, "second" | "day"][] = [
        ["five_hour", "five_hour", "5小时", "second"],
        ["seven_day", "seven_day", "一周", "day"],
    ];
    return periods.map(([key, raw_label, normalized_label, window]) => {
        const period = body[key];
        // utilization is fraction used (0.34 = 34% used).
        const pct = is_record(period) ? to_pct(period["utilization"]) : 0;
        const reset_at = is_record(period) ? to_reset_at(period["resets_at"]) : null;
        return {
            provider: "claude",
            source_instance_id: "cpa",
            account_id: account.account_id,
            account_label: account.account_label,
            metric_id: `claude:${account.account_id}:${key}`,
            raw_label,
            normalized_label,
            window,
            used: pct,
            limit: 100,
            display_style: "percent",
            reset_at,
            status: status_for_pct(pct),
            observed_at: now,
            source: "gateway",
            stale: false,
            last_error: null,
        } satisfies Observation;
    });
}

// ─── Codex ─────────────────────────────────────────────

function parse_codex(
    body: Record<string, unknown>,
    account: CpaAccount,
    now: number,
): Observation[] {
    const rl = body["rate_limit"];
    if (!is_record(rl)) return [];
    // used_percent is integer percent USED (100 = fully consumed, 18 = 18%).
    const windows: [string, string, string, "second" | "day"][] = [
        ["primary_window", "primary_window", "5小时", "second"],
        ["secondary_window", "secondary_window", "一周", "day"],
    ];
    const observations: Observation[] = [];
    for (const [key, raw_label, normalized_label, window] of windows) {
        const w = rl[key] ?? rl[key.replace(/_/g, "")];
        if (!is_record(w)) continue;
        const pct = Math.min(to_number(w["used_percent"] ?? w["usedPercent"]), 100);
        const raw_reset = w["reset_at"] ?? w["resetAt"];
        let reset_at: number | null = null;
        if (raw_reset != null) {
            let ts = Number(raw_reset);
            if (ts < 1e12) ts *= 1000;
            if (Number.isFinite(ts)) reset_at = ts;
        } else if (w["reset_after_seconds"] != null) {
            reset_at = Date.now() + Number(w["reset_after_seconds"]) * 1000;
        }
        observations.push({
            provider: "codex",
            source_instance_id: "cpa",
            account_id: account.account_id,
            account_label: account.account_label,
            metric_id: `codex:${account.account_id}:${key}`,
            raw_label,
            normalized_label,
            window,
            used: pct,
            limit: 100,
            display_style: "percent",
            reset_at,
            status: status_for_pct(pct),
            observed_at: now,
            source: "gateway",
            stale: false,
            last_error: null,
        });
    }
    return observations;
}

// ─── Antigravity ───────────────────────────────────────

const ANTIGRAVITY_URLS = [
    "https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels",
    "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:fetchAvailableModels",
    "https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels",
];

interface AntigravityQuotaGroup {
    readonly id: string;
    readonly label: string;
    readonly provider_values: readonly string[];
}

const ANTIGRAVITY_QUOTA_GROUPS: readonly AntigravityQuotaGroup[] = [
    {
        id: "gemini-models",
        label: "Gemini Models",
        provider_values: ["API_PROVIDER_GOOGLE_GEMINI"],
    },
    {
        id: "claude-gpt",
        label: "Claude/GPT",
        provider_values: [
            "API_PROVIDER_ANTHROPIC_VERTEX",
            "MODEL_PROVIDER_ANTHROPIC",
            "API_PROVIDER_OPENAI_VERTEX",
            "MODEL_PROVIDER_OPENAI",
        ],
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

function parse_antigravity(
    body: Record<string, unknown>,
    account: CpaAccount,
    now: number,
): Observation[] {
    const models = body["models"];
    if (!is_record(models)) return [];
    const observations: Observation[] = [];

    for (const group of ANTIGRAVITY_QUOTA_GROUPS) {
        let min_remaining = 100;
        let reset_at: number | null = null;
        let found = false;

        for (const model_info of Object.values(models)) {
            if (!is_record(model_info)) continue;
            if (!matches_antigravity_group(model_info, group)) continue;

            const quota = model_info["quotaInfo"] ?? model_info["quota_info"];
            if (!is_record(quota)) continue;
            let remaining = to_number(quota["remainingFraction"]);
            if (remaining <= 1) remaining *= 100;
            const model_reset = to_reset_at(quota["resetTime"] ?? quota["reset_time"]);
            if (!found || remaining < min_remaining) {
                min_remaining = remaining;
                reset_at = model_reset;
            }
            found = true;
        }

        if (!found) continue;
        const used = Math.round(Math.min(Math.max(0, 100 - min_remaining), 100) * 10) / 10;
        observations.push({
            provider: "antigravity",
            source_instance_id: "cpa",
            account_id: account.account_id,
            account_label: account.account_label,
            metric_id: `antigravity:${account.account_id}:${group.id}`,
            raw_label: group.id,
            normalized_label: group.label,
            window: "second",
            used,
            limit: 100,
            display_style: "percent",
            reset_at,
            status: status_for_pct(used),
            observed_at: now,
            source: "gateway",
            stale: false,
            last_error: null,
        });
    }
    return observations;
}

// ─── Kimi ──────────────────────────────────────────────

function parse_kimi(
    body: Record<string, unknown>,
    account: CpaAccount,
    now: number,
): Observation[] {
    const limits = body["limits"];
    if (!Array.isArray(limits)) return [];
    const observations: Observation[] = [];
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
            source_instance_id: "cpa",
            account_id: account.account_id,
            account_label: account.account_label,
            metric_id: `kimi:${account.account_id}:${period_label}`,
            raw_label: name_field || period_label,
            normalized_label: period_label,
            window: "day",
            used: pct,
            limit: 100,
            display_style: "percent",
            reset_at,
            status: status_for_pct(pct),
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
        for (const url of ANTIGRAVITY_URLS) {
            try {
                const result = await cpa_api_call(
                    mgmt_key,
                    "POST",
                    url,
                    auth_index,
                    {
                        Authorization: "Bearer $TOKEN$",
                        "Content-Type": "application/json",
                        "User-Agent": "antigravity/1.11.5 windows/amd64",
                    },
                    body,
                );
                return parse_api_body(result);
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
): Observation[] {
    if (provider === "claude") return parse_claude(body, account, now);
    if (provider === "codex") return parse_codex(body, account, now);
    if (provider === "antigravity") return parse_antigravity(body, account, now);
    if (provider === "kimi") return parse_kimi(body, account, now);
    return [];
}

// ─── Main ──────────────────────────────────────────────

async function main(): Promise<Observation[]> {
    const mgmt_key = (ctx.params["cpa_mgmt_key"] ?? "").trim();
    if (!mgmt_key) return [];

    const auth_files_response = (await ctx.http.get_json("default", "/v0/management/auth-files", {
        headers: { Authorization: `Bearer ${mgmt_key}` },
    })) as AuthFilesResponse;
    const files = auth_files_response.files ?? [];
    ctx.log.debug(`CPA fetching ${String(files.length)} auth files`);
    const now = Date.now();
    const observations: Observation[] = [];

    for (const auth_file of files) {
        if (auth_file.disabled) continue;

        const monitor_key = `monitor_${auth_file.provider}`;
        if ((ctx.params[monitor_key] ?? "true").toLowerCase() !== "true") continue;

        const account = account_from_auth_file(auth_file);
        try {
            const body = await fetch_provider(auth_file.provider, mgmt_key, auth_file.auth_index);
            const keys = Object.keys(body);
            if (keys.length > 0) {
                ctx.log.debug(`CPA ${auth_file.provider} response: ${JSON.stringify(body)}`);
            }
            observations.push(...parse_provider(auth_file.provider, body, account, now));
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            ctx.log.warn(`CPA ${auth_file.provider} (${account.account_label}) failed: ${msg}`);
            continue;
        }
    }

    return observations;
}

void main;
