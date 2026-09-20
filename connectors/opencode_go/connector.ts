import type { ConnectorContext } from "../../src/main/core/connector/host-io";
import type { ScriptObservation } from "../../src/shared/types/observation";

declare const ctx: ConnectorContext;

interface OrgItem {
    readonly id: string;
    readonly name?: string;
}

interface MeterWindow {
    readonly startsAt?: string;
    readonly resetsAt?: string;
    readonly limitMicroCents?: string | number;
    readonly usedMicroCents?: string | number;
}

interface GoStatusResponse {
    readonly subscriberUserId?: string;
    readonly access?: {
        readonly startsAt?: string;
        readonly endsAt?: string;
        readonly cancelAtPeriodEnd?: boolean;
        readonly meters?: {
            readonly fiveHour?: MeterWindow;
            readonly week?: MeterWindow;
            readonly month?: MeterWindow;
        };
    };
}

interface UsageSummary {
    readonly totalRequests?: string | number;
    readonly totalInputTokens?: string | number;
    readonly totalOutputTokens?: string | number;
    readonly totalCostMicroCents?: string | number;
}

interface BillingStatus {
    readonly billingMode?: string;
    readonly mode?: string;
    readonly balanceMicroCents?: string | number;
    readonly availableMicroCents?: string | number;
}

const USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";

function required_cookie(): string {
    const cookie = (ctx.params["SESSION_COOKIE"] ?? "").trim();
    if (!cookie) throw new Error("Missing required secret: SESSION_COOKIE");
    return cookie;
}

function to_number(value: unknown): number {
    const parsed = typeof value === "number" ? value : Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

function micro_cents_to_usd(value: unknown): number {
    const micro_cents = to_number(value);
    return Math.round((micro_cents / 100_000_000) * 100) / 100;
}

function meter_to_pct(meter?: MeterWindow): number | null {
    if (!meter) return null;
    const used = to_number(meter.usedMicroCents);
    const limit = to_number(meter.limitMicroCents);
    if (limit <= 0) return 0;
    return Math.max(0, Math.round((used / limit) * 100));
}

function parse_ts(value: string | undefined): number | null {
    if (!value) return null;
    const ts = Date.parse(value);
    return Number.isFinite(ts) ? ts : null;
}

function observation(
    account_id: string,
    account_label: string,
    raw_label: "rolling" | "weekly" | "monthly" | "balance",
    normalized_label: string,
    window: ScriptObservation["window"],
    cycleDurationMs: number | null,
    used: number,
    limit: number,
    display_style: "percent" | "ratio",
    reset_at: number | null,
    now: number,
    status: ScriptObservation["status"],
): ScriptObservation {
    return {
        provider: "opencode_go",
        account_id,
        account_label,
        metric_id: `opencode_go:${raw_label}`,
        raw_label,
        normalized_label,
        window,
        cycleDurationMs,
        used,
        limit,
        display_style,
        reset_at,
        status,
        observed_at: now,
        source: "session",
        stale: false,
        last_error: null,
    };
}

async function main(): Promise<ScriptObservation[]> {
    const cookie = required_cookie();
    const headers: Record<string, string> = {
        Cookie: cookie,
        "User-Agent": USER_AGENT,
        Accept: "application/json, text/plain, */*",
        Referer: "https://opencode.ai/console/",
    };

    // 1. 获取用户所属组织 / Workspace
    let orgs: OrgItem[];
    try {
        const raw = await ctx.http.get_json("default", "/console/api/orgs", { headers });
        orgs = Array.isArray(raw) ? (raw as OrgItem[]) : [];
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("401") || msg.includes("403") || /unauthorized/i.test(msg)) {
            throw new Error(`OpenCode 会话已失效，请重新登录: ${msg}`);
        }
        throw new Error(`OpenCode orgs request failed: ${msg}`);
    }

    if (!orgs.length || !orgs[0]?.id) {
        throw new Error("OpenCode 未找到可用组织或工作区");
    }

    const org = orgs[0];
    const org_id = org.id;
    const account_label = org.name?.trim() ? org.name.trim() : org_id;
    const org_headers = { ...headers, "x-org-id": org_id };
    const now = Date.now();

    // 2. 并发拉取 Go 套餐状态与账单状态
    const [go_status, billing] = await Promise.all([
        ctx.http
            .get_json("default", "/console/api/go/status", { headers: org_headers })
            .then((v) => v as GoStatusResponse | null)
            .catch(() => null),
        ctx.http
            .get_json("default", "/console/api/billing/status", { headers: org_headers })
            .then((v) => v as BillingStatus | null)
            .catch(() => null),
    ]);

    const results: ScriptObservation[] = [];
    const meters = go_status?.access?.meters;

    if (meters) {
        // Go 订阅会员：输出精确的百分比用量与重置倒计时
        if (meters.fiveHour) {
            const pct = meter_to_pct(meters.fiveHour) ?? 0;
            results.push(
                observation(
                    org_id,
                    account_label,
                    "rolling",
                    "滚动",
                    "second",
                    null,
                    pct,
                    100,
                    "percent",
                    parse_ts(meters.fiveHour.resetsAt),
                    now,
                    ctx.status.for_pct(pct),
                ),
            );
        }

        if (meters.week) {
            const pct = meter_to_pct(meters.week) ?? 0;
            results.push(
                observation(
                    org_id,
                    account_label,
                    "weekly",
                    "一周",
                    "day",
                    7 * 24 * 60 * 60 * 1000,
                    pct,
                    100,
                    "percent",
                    parse_ts(meters.week.resetsAt),
                    now,
                    ctx.status.for_pct(pct),
                ),
            );
        }

        if (meters.month) {
            const pct = meter_to_pct(meters.month) ?? 0;
            results.push(
                observation(
                    org_id,
                    account_label,
                    "monthly",
                    "一月",
                    "month",
                    30 * 24 * 60 * 60 * 1000,
                    pct,
                    100,
                    "percent",
                    parse_ts(go_status.access.endsAt),
                    now,
                    ctx.status.for_pct(pct),
                ),
            );
        }
    } else {
        // 回退到 30d usage summary 费用
        const summary = await ctx.http
            .get_json("default", "/console/api/usage/summary?range=30d", { headers: org_headers })
            .then((v) => v as UsageSummary | null)
            .catch(() => null);

        if (summary) {
            const used = micro_cents_to_usd(summary.totalCostMicroCents);
            results.push(
                observation(
                    org_id,
                    account_label,
                    "monthly",
                    "一月",
                    "month",
                    30 * 24 * 60 * 60 * 1000,
                    used,
                    0,
                    "ratio",
                    null,
                    now,
                    "normal",
                ),
            );
        }
    }

    // 余额
    if (billing && (billing.balanceMicroCents != null || billing.availableMicroCents != null)) {
        const balance = micro_cents_to_usd(
            billing.availableMicroCents ?? billing.balanceMicroCents,
        );
        results.push(
            observation(
                org_id,
                account_label,
                "balance",
                "余额",
                "month",
                null,
                balance,
                0,
                "ratio",
                null,
                now,
                ctx.status.for_balance(balance, 0),
            ),
        );
    }

    if (results.length === 0) {
        throw new Error("OpenCode usage response invalid");
    }

    return results;
}

void main;
