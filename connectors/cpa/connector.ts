import type { ConnectorContext } from "../../src/main/core/connector/host-io";
import type { Observation } from "../../src/shared/types/observation";

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

interface ClaudePeriod {
    readonly utilization?: number;
    readonly resets_at?: string;
}

interface ClaudeUsageBody {
    readonly five_hour?: ClaudePeriod;
    readonly seven_day?: ClaudePeriod;
}

function extract_email(name: string): string {
    const base = (name.split("/").pop() ?? name).replace(/\.json$/, "");
    const normalized = base.replace(/^auth-/, "").replace(/^[0-9a-f]{8,10}-/, "");
    const email_match = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(normalized);
    if (email_match?.[0]) return email_match[0].replace(/-(?:plus|pro|team[0-9a-f]*|free)$/, "");
    const parts = base.split("-", 2);
    if (parts.length < 2) return base;
    return (parts[1] ?? "")
        .replace(/^[0-9a-f]{8,10}-/, "")
        .replace(/-(?:plus|pro|team[0-9a-f]*|free)$/, "");
}

function account_from_auth_file(auth_file: AuthFile): CpaAccount {
    const extracted_email = extract_email(auth_file.name);
    return {
        account_id: auth_file.auth_index,
        account_label:
            auth_file.email ??
            auth_file.remark ??
            auth_file.masked_identifier ??
            (extracted_email.includes("@") ? extracted_email : `Account ${auth_file.auth_index}`),
    };
}

function to_pct(value: number | undefined): number {
    const raw = value ?? 0;
    const pct = raw <= 1 ? raw * 100 : raw;
    return Math.round(Math.min(pct, 100) * 10) / 10;
}

function to_reset_at(value: string | undefined): number | null {
    if (!value) return null;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : null;
}

function parse_claude(body: ClaudeUsageBody, account: CpaAccount, now: number): Observation[] {
    const periods: [keyof ClaudeUsageBody, string, "second" | "day"][] = [
        ["five_hour", "5小时", "second"],
        ["seven_day", "每周", "day"],
    ];
    return periods.map(([key, label, window]) => {
        const period = body[key];
        return {
            provider: "claude",
            source_instance_id: "cpa",
            account_id: account.account_id,
            account_label: account.account_label,
            metric_id: `claude:${account.account_id}:${key}`,
            name: `Claude (${account.account_label}) · ${label}`,
            window,
            used: to_pct(period?.utilization),
            limit: 100,
            display_style: "percent",
            reset_at: to_reset_at(period?.resets_at),
            status: "normal",
            observed_at: now,
            source: "gateway",
            stale: false,
            last_error: null,
        } satisfies Observation;
    });
}

async function cpa_api_call(mgmt_key: string, auth_index: string): Promise<ApiCallResult> {
    return (await ctx.http.post_json(
        "default",
        "/v0/management/api-call",
        {
            method: "GET",
            url: "https://api.anthropic.com/api/oauth/usage",
            auth_index,
            header: {
                Authorization: "Bearer $TOKEN$",
                "Content-Type": "application/json",
                "anthropic-beta": "oauth-2025-04-20",
            },
        },
        { headers: { Authorization: `Bearer ${mgmt_key}` } },
    )) as ApiCallResult;
}

async function main(): Promise<Observation[]> {
    const mgmt_key = (ctx.params["cpa_mgmt_key"] ?? "").trim();
    if (!mgmt_key) return [];

    const auth_files_response = (await ctx.http.get_json("default", "/v0/management/auth-files", {
        headers: { Authorization: `Bearer ${mgmt_key}` },
    })) as AuthFilesResponse;
    const now = Date.now();
    const observations: Observation[] = [];

    for (const auth_file of auth_files_response.files ?? []) {
        if (auth_file.disabled) continue;

        const monitor_key = `monitor_${auth_file.provider}`;
        if ((ctx.params[monitor_key] ?? "true").toLowerCase() !== "true") continue;

        if (auth_file.provider === "claude") {
            const result = await cpa_api_call(mgmt_key, auth_file.auth_index);
            if (result.status_code < 200 || result.status_code >= 300) continue;
            const body = (
                typeof result.body === "string" ? JSON.parse(result.body) : result.body
            ) as ClaudeUsageBody;
            observations.push(...parse_claude(body, account_from_auth_file(auth_file), now));
        }
    }

    return observations;
}

void main;
