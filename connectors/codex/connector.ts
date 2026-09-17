import type { ConnectorContext } from "../../src/main/core/connector/host-io";
import type { ScriptObservation } from "../../src/shared/types/observation";

declare const ctx: ConnectorContext;

const DEFAULT_AUTH_FILE = "~/.codex/auth.json";
const SESSION_DIRS = ["~/.codex/sessions", "~/.codex/archived_sessions"];
/** t364: 单文件内容长度上限（字符数，与 parse 成本正比），超大文件跳过解析避免拖慢采集。 */
const MAX_FILE_CHARS = 5 * 1024 * 1024;

function is_record(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function to_number(value: unknown): number {
    const parsed = typeof value === "number" ? value : Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

function parse_timestamp(value: unknown): number | null {
    if (typeof value !== "string") return null;
    const ts = Date.parse(value);
    return Number.isFinite(ts) ? ts : null;
}

function day_key(ts_ms: number): string {
    const d = new Date(ts_ms);
    const month = (d.getUTCMonth() + 1).toString().padStart(2, "0");
    const day = d.getUTCDate().toString().padStart(2, "0");
    return `${d.getUTCFullYear().toString()}-${month}-${day}`;
}

function base64_decode(input: string): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    let str = input.replace(/-/g, "+").replace(/_/g, "/");
    while (str.length % 4) {
        str += "=";
    }
    let output = "";
    let bc = 0;
    let bs = 0;
    for (let idx = 0; idx < str.length; idx++) {
        const char = str.charAt(idx);
        const char_index = chars.indexOf(char);
        if (char_index >= 0 && char !== "=") {
            bs = bc % 4 ? bs * 64 + char_index : char_index;
            if (bc++ % 4) {
                output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
            }
        }
    }
    return output;
}

function extract_email_from_jwt(token: string): string | null {
    try {
        const parts = token.split(".");
        if (parts.length < 2 || !parts[1]) return null;
        const decoded = base64_decode(parts[1]);
        const payload: unknown = JSON.parse(decoded);
        if (is_record(payload) && typeof payload["email"] === "string") {
            return payload["email"];
        }
        return null;
    } catch {
        return null;
    }
}

function extract_model(event: Record<string, unknown>): string | null {
    const payload = event["payload"];
    if (!is_record(payload)) return null;
    const model = payload["model"];
    return typeof model === "string" ? model : null;
}

function extract_token_total(event: Record<string, unknown>): number | null {
    const payload = event["payload"];
    if (!is_record(payload)) return null;
    if (payload["type"] !== "token_count") return null;
    const info = payload["info"];
    if (!is_record(info)) return null;
    const usage = info["total_token_usage"];
    if (!is_record(usage)) return null;
    const total = to_number(usage["total_tokens"]);
    return Number.isFinite(total) ? total : null;
}

interface WindowData {
    used_percent: number;
    limit_window_seconds: number;
    reset_at?: number;
}

interface UsageResponse {
    rate_limit?: {
        primary_window?: WindowData;
        secondary_window?: WindowData;
    };
}

async function collect_quota(now: number, observations: ScriptObservation[]): Promise<void> {
    const auth_path =
        (typeof ctx.params["auth_file"] === "string" && ctx.params["auth_file"]) ||
        DEFAULT_AUTH_FILE;

    let auth_content: string;
    try {
        auth_content = await ctx.files.read(auth_path);
    } catch {
        // 无 auth 文件时略过配额请求
        return;
    }

    let auth_data: Record<string, unknown>;
    try {
        const parsed: unknown = JSON.parse(auth_content);
        if (!is_record(parsed)) return;
        auth_data = parsed;
    } catch {
        return;
    }

    const tokens = is_record(auth_data["tokens"]) ? auth_data["tokens"] : undefined;
    const access_token =
        (typeof tokens?.["access_token"] === "string" ? tokens["access_token"] : undefined) ??
        (typeof auth_data["access_token"] === "string" ? auth_data["access_token"] : undefined);

    if (!access_token) return;

    const account_id =
        (typeof tokens?.["account_id"] === "string" ? tokens["account_id"] : undefined) ??
        (typeof auth_data["account_id"] === "string" ? auth_data["account_id"] : undefined);

    let email = typeof auth_data["email"] === "string" ? auth_data["email"] : undefined;
    const id_token = typeof tokens?.["id_token"] === "string" ? tokens["id_token"] : undefined;
    if (id_token && !email) {
        const extracted = extract_email_from_jwt(id_token);
        if (extracted) email = extracted;
    }

    const headers: Record<string, string> = {
        Authorization: `Bearer ${access_token}`,
        "User-Agent": "codex-cli",
        Accept: "application/json",
    };
    if (account_id) {
        headers["ChatGPT-Account-Id"] = account_id;
    }

    try {
        const res = (await ctx.http.get_json("chatgpt", "/backend-api/wham/usage", {
            headers,
        })) as UsageResponse;

        const rate_limit = res.rate_limit;
        const acct_label = email ?? "Codex";
        const primary = rate_limit?.primary_window;
        const secondary = rate_limit?.secondary_window;

        if (primary && typeof primary.used_percent === "number") {
            const cycle_ms = primary.limit_window_seconds * 1000;
            const reset_ms = primary.reset_at ? primary.reset_at * 1000 : null;
            observations.push({
                provider: "codex",
                account_id: account_id ?? "codex",
                account_label: acct_label,
                metric_id: `codex:${account_id ?? "default"}:primary`,
                raw_label: "5h_limit",
                normalized_label: "5小时",
                window: "second",
                cycleDurationMs: cycle_ms,
                used: primary.used_percent,
                limit: 100,
                display_style: "percent",
                reset_at: reset_ms,
                status: ctx.status.for_pct(primary.used_percent),
                observed_at: now,
                source: "local",
                stale: false,
                last_error: null,
            });
        }

        if (secondary && typeof secondary.used_percent === "number") {
            const cycle_ms = secondary.limit_window_seconds * 1000;
            const reset_ms = secondary.reset_at ? secondary.reset_at * 1000 : null;
            observations.push({
                provider: "codex",
                account_id: account_id ?? "codex",
                account_label: acct_label,
                metric_id: `codex:${account_id ?? "default"}:secondary`,
                raw_label: "weekly_limit",
                normalized_label: "一周",
                window: "day",
                cycleDurationMs: cycle_ms,
                used: secondary.used_percent,
                limit: 100,
                display_style: "percent",
                reset_at: reset_ms,
                status: ctx.status.for_pct(secondary.used_percent),
                observed_at: now,
                source: "local",
                stale: false,
                last_error: null,
            });
        }
    } catch (err: unknown) {
        ctx.log.warn("Failed to fetch official Codex quota", { error: String(err) });
        const is_unauthorized =
            err instanceof Error &&
            (err.message.includes("401") ||
                err.message.includes("Unauthorized") ||
                err.message.includes("token"));
        if (is_unauthorized) {
            observations.push({
                provider: "codex",
                account_id: account_id ?? "codex",
                account_label: email ?? "Codex",
                metric_id: `codex:${account_id ?? "default"}:auth_error`,
                raw_label: "auth_error",
                normalized_label: "认证失效",
                window: "day",
                cycleDurationMs: null,
                used: 0,
                limit: 100,
                display_style: "percent",
                reset_at: null,
                status: "critical",
                observed_at: now,
                source: "local",
                stale: true,
                last_error: "本地凭证已失效，请在终端重新运行 codex 登录",
            });
        }
    }
}

async function collect_sessions(now: number, observations: ScriptObservation[]): Promise<void> {
    const all_files: string[] = [];
    for (const dir of SESSION_DIRS) {
        try {
            const files = await ctx.files.list(dir);
            for (const f of files) {
                // t364 AC-002: 只处理目标扩展名（.jsonl 会话记录），非目标文件不读。
                if (!f.endsWith(".jsonl")) continue;
                all_files.push(f);
            }
        } catch {
            continue;
        }
    }

    const aggregates = new Map<string, number>();

    for (const file_path of all_files) {
        let content: string;
        try {
            content = await ctx.files.read(file_path);
        } catch {
            continue;
        }
        // t364 AC-001: 超大文件（> MAX_FILE_CHARS）跳过解析，避免全量读/parse 拖慢采集。
        if (content.length > MAX_FILE_CHARS) continue;

        let current_model = "unknown";
        let prev_total: number | null = null;

        for (const line of content.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            let parsed: unknown;
            try {
                parsed = JSON.parse(trimmed);
            } catch {
                continue;
            }
            if (!is_record(parsed)) continue;

            if (parsed["type"] === "turn_context") {
                const model = extract_model(parsed);
                if (model) current_model = model;
                continue;
            }

            if (parsed["type"] !== "response.completed") continue;
            const total = extract_token_total(parsed);
            if (total === null) continue;

            const delta = prev_total === null ? total : Math.max(total - prev_total, 0);
            prev_total = total;

            const ts = parse_timestamp(parsed["timestamp"]);
            if (ts === null) continue;

            const key = `${current_model}|${day_key(ts)}`;
            aggregates.set(key, (aggregates.get(key) ?? 0) + delta);
        }
    }

    for (const [key, used] of aggregates) {
        const model = key.split("|", 1)[0] ?? "unknown";
        // t393 AC-004: 观测携带所属分桶日（day 派生字段）——测试可对
        // 月偏位/去零填充做精确断言，无需复制 day_key 实现。
        const day = key.split("|")[1] ?? "unknown";
        observations.push({
            provider: "codex",
            account_id: "codex",
            account_label: "Codex",
            metric_id: `codex:${model}`,
            raw_label: model,
            normalized_label: model,
            window: "day",
            cycleDurationMs: null,
            used,
            limit: null,
            display_style: "ratio",
            reset_at: null,
            status: "unknown",
            observed_at: now,
            source: "local",
            stale: false,
            last_error: null,
            day,
        });
    }
}

async function main(): Promise<ScriptObservation[]> {
    const now = Date.now();
    const observations: ScriptObservation[] = [];

    await collect_quota(now, observations);
    await collect_sessions(now, observations);

    return observations;
}

void main;
