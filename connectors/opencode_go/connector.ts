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

const USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";

function required_cookie(): string {
    const cookie = (ctx.params["SESSION_COOKIE"] ?? "").trim();
    if (!cookie) throw new Error("Missing required secret: SESSION_COOKIE");
    if (/[\r\n]/.test(cookie) || cookie.length > 8192) {
        throw new Error("Invalid cookie: CRLF characters or length > 8KB detected");
    }
    return cookie;
}

// A55: 非法值安全返回 null 并由调用方决定处理，不无脑归 0
function to_number_or_null(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function micro_cents_to_usd(value: unknown): number | null {
    const micro_cents = to_number_or_null(value);
    if (micro_cents === null) return null;
    return Math.round((micro_cents / 100_000_000) * 100) / 100;
}

// A56: 缺 limit 或 limit <= 0 返回 null 跳过该 metric，防假 0% 并记录 warn 日志
function meter_to_pct(metric_name: string, meter?: MeterWindow): number | null {
    if (!meter) return null;
    const used = to_number_or_null(meter.usedMicroCents);
    const limit = to_number_or_null(meter.limitMicroCents);
    if (used === null || limit === null || limit <= 0) {
        ctx.log.warn(
            `OpenCode Go ${metric_name} metric invalid or missing limit: used=${String(meter.usedMicroCents)}, limit=${String(meter.limitMicroCents)}`,
        );
        return null;
    }
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
    raw_label: "rolling" | "weekly" | "monthly",
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

async function fetch_orgs(headers: Record<string, string>): Promise<OrgItem[]> {
    try {
        const raw = await ctx.http.get_json("default", "/console/api/orgs", { headers });
        return Array.isArray(raw) ? (raw as OrgItem[]) : [];
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        // A8: 401/403 明确抛出错误，激活自动重登
        if (msg.includes("401") || msg.includes("403") || /unauthorized/i.test(msg)) {
            throw new Error(`OpenCode 会话已失效，请重新登录: ${msg}`);
        }
        throw new Error(`OpenCode orgs request failed: ${msg}`);
    }
}

// A115 & AC-004: 组织查询 memo 缓存（1 小时 TTL），减少多轮重复串行 RTT
interface OrgCacheEntry {
    readonly cookie: string;
    readonly orgs: OrgItem[];
    readonly fetched_at: number;
}

const ORG_CACHE_TTL_MS = 60 * 60 * 1000;

function get_org_cache_holder(): { __opencode_org_cache?: OrgCacheEntry } | null {
    try {
        // ctx 由宿主进程传入，其原型链指向宿主进程共享的 Object 原型空间
        const proto = Object.getPrototypeOf(ctx) as { __opencode_org_cache?: OrgCacheEntry } | null;
        return proto ?? null;
    } catch {
        return null;
    }
}

function get_cached_orgs(): OrgCacheEntry | null {
    const holder = get_org_cache_holder();
    return holder?.__opencode_org_cache ?? null;
}

function set_cached_orgs(entry: OrgCacheEntry): void {
    const holder = get_org_cache_holder();
    if (holder) {
        holder.__opencode_org_cache = entry;
    }
}

async function fetch_orgs_memo(
    cookie: string,
    headers: Record<string, string>,
): Promise<OrgItem[]> {
    const cached = get_cached_orgs();
    const now = Date.now();
    if (cached?.cookie === cookie && now - cached.fetched_at < ORG_CACHE_TTL_MS) {
        ctx.log.debug(`OpenCode orgs: cache hit (${String(cached.orgs.length)} orgs)`);
        return cached.orgs;
    }

    const orgs = await fetch_orgs(headers);
    if (orgs.length > 0) {
        set_cached_orgs({ cookie, orgs, fetched_at: now });
    }
    return orgs;
}

// A8: 401/403 明确抛出错误，不静默吞为 null
async function fetch_go_status(headers: Record<string, string>): Promise<GoStatusResponse | null> {
    try {
        const v = await ctx.http.get_json("default", "/console/api/go/status", { headers });
        return v as GoStatusResponse | null;
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("401") || msg.includes("403") || /unauthorized/i.test(msg)) {
            throw new Error(`OpenCode 会话已失效，请重新登录: ${msg}`);
        }
        ctx.log.warn(`OpenCode go/status failed: ${msg}`);
        return null;
    }
}

async function fetch_usage_summary(headers: Record<string, string>): Promise<UsageSummary | null> {
    try {
        const v = await ctx.http.get_json("default", "/console/api/usage/summary?range=30d", {
            headers,
        });
        return v as UsageSummary | null;
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("401") || msg.includes("403") || /unauthorized/i.test(msg)) {
            throw new Error(`OpenCode 会话已失效，请重新登录: ${msg}`);
        }
        ctx.log.warn(`OpenCode usage/summary failed: ${msg}`);
        return null;
    }
}

async function main(): Promise<ScriptObservation[]> {
    const cookie = required_cookie();
    const headers: Record<string, string> = {
        Cookie: cookie,
        "User-Agent": USER_AGENT,
        Accept: "application/json, text/plain, */*",
        Referer: "https://opencode.ai/console/",
    };

    // 1. 获取用户所属组织 / Workspace (经 memo 缓存)
    const orgs = await fetch_orgs_memo(cookie, headers);
    if (!orgs.length || !orgs[0]?.id) {
        throw new Error("OpenCode 未找到可用组织或工作区");
    }

    const now = Date.now();
    const results: ScriptObservation[] = [];

    // A148 (原 D11): 全 org 循环采集并进行组织隔离
    for (const org of orgs) {
        if (!org.id) continue;
        const org_id = org.id;
        const account_label = org.name?.trim() ? org.name.trim() : org_id;
        const org_headers = { ...headers, "x-org-id": org_id };

        try {
            // 2. 拉取 Go 套餐状态
            const go_status = await fetch_go_status(org_headers);
            const meters = go_status?.access?.meters;

            if (meters) {
                // Go 订阅会员：输出精确的百分比用量与重置倒计时
                const five_pct = meter_to_pct("5h", meters.fiveHour);
                if (five_pct !== null) {
                    results.push(
                        observation(
                            org_id,
                            account_label,
                            "rolling",
                            "5h",
                            "second",
                            null,
                            five_pct,
                            100,
                            "percent",
                            parse_ts(meters.fiveHour?.resetsAt),
                            now,
                            ctx.status.for_pct(five_pct),
                        ),
                    );
                }

                const week_pct = meter_to_pct("weekly", meters.week);
                if (week_pct !== null) {
                    results.push(
                        observation(
                            org_id,
                            account_label,
                            "weekly",
                            "一周",
                            "day",
                            7 * 24 * 60 * 60 * 1000,
                            week_pct,
                            100,
                            "percent",
                            parse_ts(meters.week?.resetsAt),
                            now,
                            ctx.status.for_pct(week_pct),
                        ),
                    );
                }

                const month_pct = meter_to_pct("monthly", meters.month);
                if (month_pct !== null) {
                    // A57: monthly 重置时间优先取 meters.month.resetsAt
                    const month_reset =
                        parse_ts(meters.month?.resetsAt) ?? parse_ts(go_status.access.endsAt);
                    results.push(
                        observation(
                            org_id,
                            account_label,
                            "monthly",
                            "一月",
                            "month",
                            30 * 24 * 60 * 60 * 1000,
                            month_pct,
                            100,
                            "percent",
                            month_reset,
                            now,
                            ctx.status.for_pct(month_pct),
                        ),
                    );
                }
            } else {
                // 回退到 30d usage summary 费用
                const summary = await fetch_usage_summary(org_headers);
                if (summary) {
                    const used = micro_cents_to_usd(summary.totalCostMicroCents);
                    if (used !== null) {
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
            }
        } catch (org_err: unknown) {
            // 若为认证失效直接向上抛出
            const msg = org_err instanceof Error ? org_err.message : String(org_err);
            if (msg.includes("会话已失效") || msg.includes("401") || msg.includes("403")) {
                throw org_err;
            }
            ctx.log.warn(`OpenCode org ${org_id} collect failed: ${msg}`);
            ctx.report_failed_account("opencode_go", org_id, account_label, msg);
        }
    }

    if (results.length === 0) {
        throw new Error("OpenCode usage response invalid");
    }

    return results;
}

void main;
