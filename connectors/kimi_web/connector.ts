import type { ConnectorContext } from "../../src/main/core/connector/host-io";
import type { ScriptObservation } from "../../src/shared/types/observation";

declare const ctx: ConnectorContext;

interface WindowPayload {
    readonly ratio?: number;
    readonly enabled?: boolean;
    readonly resetTime?: string;
}
interface StatsPayload {
    readonly ratelimitCode5h?: WindowPayload;
    readonly ratelimitCode7d?: WindowPayload;
    readonly subscriptionBalance?: {
        readonly amountUsedRatio?: number;
        readonly expireTime?: string;
    };
}

const PATH = "/apiv2/kimi.gateway.membership.v2.MembershipService/GetSubscriptionStats";
const HEADERS = {
    "connect-protocol-version": "1",
    Accept: "application/json",
    Origin: "https://www.kimi.com",
    Referer: "https://www.kimi.com/settings/subscription?tab=quota",
};

function number_or_null(value: unknown): number | null {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : null;
}

function reset_at(value: string | undefined): number | null {
    if (!value) return null;
    const n = Date.parse(value);
    return Number.isFinite(n) ? n : null;
}

function observation(
    account_id: string,
    raw_label: string,
    normalized_label: string,
    window: "second" | "week" | "month",
    used: number | null,
    reset: number | null,
    cycle: number | null,
    now: number,
): ScriptObservation {
    return {
        provider: "kimi_web",
        account_id,
        account_label: account_id,
        metric_id: `kimi_web:${raw_label}`,
        raw_label,
        normalized_label,
        window,
        cycleDurationMs: cycle,
        used,
        limit: used === null ? null : 1,
        display_style: "ratio",
        reset_at: reset,
        status: used === null ? "unknown" : ctx.status.for_pct(used * 100),
        observed_at: now,
        source: "session",
        stale: false,
        last_error: null,
    };
}

async function main(): Promise<ScriptObservation[]> {
    const secret = (ctx.params["SESSION_COOKIE"] ?? "").trim();
    if (!secret) throw new Error("Missing required secret: SESSION_COOKIE");
    let cookie = secret;
    let authorization = (ctx.params["AUTHORIZATION"] ?? "").trim();
    let session_id = "";
    let device_id = "";
    try {
        const captured = JSON.parse(secret) as {
            cookie?: string;
            authorization?: string;
            session_id?: string;
            device_id?: string;
        };
        if (captured.cookie) cookie = captured.cookie;
        authorization = captured.authorization ?? authorization;
        session_id = captured.session_id ?? "";
        device_id = captured.device_id ?? "";
    } catch {
        // Manual cookie input remains supported; it will fail clearly without Bearer.
    }
    if (!authorization)
        throw new Error("Kimi 网页会话缺少 Bearer 令牌，请重新打开网页登录窗口后重试");
    const payload = (await ctx.http.post_json(
        "default",
        PATH,
        {},
        {
            headers: {
                ...HEADERS,
                Cookie: cookie,
                Authorization: authorization,
                ...(session_id ? { "x-msh-session-id": session_id } : {}),
                ...(device_id ? { "x-msh-device-id": device_id } : {}),
            },
        },
    )) as StatsPayload;
    const now = Date.now();
    const results: ScriptObservation[] = [];
    const five = payload.ratelimitCode5h;
    const week = payload.ratelimitCode7d;
    const balance = payload.subscriptionBalance;
    if (five?.enabled !== false && five)
        results.push(
            observation(
                "kimi-web",
                "five_hour",
                "5小时",
                "second",
                number_or_null(five.ratio),
                reset_at(five.resetTime),
                5 * 60 * 60 * 1000,
                now,
            ),
        );
    if (week?.enabled !== false && week)
        results.push(
            observation(
                "kimi-web",
                "seven_day",
                "一周",
                "week",
                number_or_null(week.ratio),
                reset_at(week.resetTime),
                7 * 24 * 60 * 60 * 1000,
                now,
            ),
        );
    if (balance)
        results.push(
            observation(
                "kimi-web",
                "monthly",
                "一月",
                "month",
                number_or_null(balance.amountUsedRatio),
                reset_at(balance.expireTime),
                30 * 24 * 60 * 60 * 1000,
                now,
            ),
        );
    if (!results.length) throw new Error("Kimi quota response invalid or session expired");
    return results;
}

void main;
