import type { ConnectorContext } from "../../src/main/core/connector/host-io";
import type { Observation } from "../../src/shared/types/observation";

declare const ctx: ConnectorContext;

interface ClaudeCredentials {
    readonly claudeAiOauth?: {
        readonly accessToken?: string;
    };
}

interface UsagePeriod {
    readonly utilization?: number;
    readonly resets_at?: string;
}

interface OAuthUsageResponse {
    readonly five_hour?: UsagePeriod;
    readonly seven_day?: UsagePeriod;
}

function is_record(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function get_token(credentials: unknown): string {
    if (!is_record(credentials)) return "";
    const oauth = credentials["claudeAiOauth"];
    if (!is_record(oauth)) return "";
    const token = oauth["accessToken"];
    return typeof token === "string" ? token : "";
}

function to_reset_at(value: string | undefined): number | null {
    if (!value) return null;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : null;
}

function pct(value: number | undefined): number {
    const number = value ?? 0;
    return Math.round(Math.min(number, 100) * 10) / 10;
}

async function main(): Promise<Observation[]> {
    let credentials: ClaudeCredentials;
    try {
        credentials = JSON.parse(
            await ctx.files.read("~/.claude/.credentials.json"),
        ) as ClaudeCredentials;
    } catch {
        return [];
    }

    const token = get_token(credentials);
    if (!token) return [];

    const data = (await ctx.http.get_json("anthropic", "/api/oauth/usage", {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            "anthropic-beta": "oauth-2025-04-20",
        },
    })) as OAuthUsageResponse;

    if (!data.five_hour && !data.seven_day) {
        throw new Error("Claude API 返回格式异常: 缺少 five_hour 和 seven_day");
    }

    const now = Date.now();
    return [
        {
            provider: "claude",
            source_instance_id: "claude",
            account_id: "claude",
            account_label: "Claude",
            metric_id: "claude:five_hour",
            raw_label: "five_hour",
            normalized_label: "5-hour usage",
            window: "second",
            used: pct(data.five_hour?.utilization),
            limit: 100,
            display_style: "percent",
            reset_at: to_reset_at(data.five_hour?.resets_at),
            status: "normal",
            observed_at: now,
            source: "local",
            stale: false,
            last_error: null,
        },
        {
            provider: "claude",
            source_instance_id: "claude",
            account_id: "claude",
            account_label: "Claude",
            metric_id: "claude:seven_day",
            raw_label: "seven_day",
            normalized_label: "Weekly usage",
            window: "day",
            used: pct(data.seven_day?.utilization),
            limit: 100,
            display_style: "percent",
            reset_at: to_reset_at(data.seven_day?.resets_at),
            status: "normal",
            observed_at: now,
            source: "local",
            stale: false,
            last_error: null,
        },
    ];
}

void main;
