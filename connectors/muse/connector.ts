import type { ConnectorContext } from "../../src/main/core/connector/host-io";
import type { ScriptObservation } from "../../src/shared/types/observation";

declare const ctx: ConnectorContext;

interface SubscriptionTier {
    readonly tierId?: string;
    readonly name?: string;
    readonly tierCode?: string;
    readonly isPaid?: boolean;
}

interface SubscriptionUsage {
    readonly state?: string;
    readonly percentUsed?: number;
    readonly resetsAt?: number;
    readonly quotaStatus?: string;
}

interface SubscriptionData {
    readonly tier?: SubscriptionTier;
    readonly usage?: SubscriptionUsage;
    readonly statusSubtitle?: string;
    readonly usageRowLabel?: string;
    readonly usageRowValueLabel?: string;
    readonly topupBalance?: number;
    readonly topupTotal?: number;
    readonly topupRowLabel?: string;
    readonly topupRowValueLabel?: string;
}

interface SubscriptionResponse {
    readonly success?: boolean;
    readonly subscription?: SubscriptionData;
}

const USER_AGENT =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36";

// A48: 校验 Cookie 防换行注入与超长
function required_cookie(): string {
    const raw = (ctx.params["SESSION_COOKIE"] ?? "").trim();
    if (!raw) throw new Error("Missing required secret: SESSION_COOKIE");
    if (/[\r\n]/.test(raw) || raw.length > 8192) {
        throw new Error("Invalid cookie: CRLF characters or length > 8KB detected");
    }
    return raw.includes("=") ? raw : `hatch_sess=${raw}`;
}

// A146 (原 D9): 动态拉取页面提取 Server Action ID 与 Deployment ID，无硬编码回退
async function resolve_dynamic_action_ids(headers: Record<string, string>): Promise<{
    action_id: string;
    deployment_id: string;
}> {
    let html = "";
    try {
        const res = await ctx.http.get_raw("default", "/", { headers });
        if (res.status === 401 || res.status === 403 || /Authentication required/i.test(res.body)) {
            throw new Error(`Muse 会话已失效，请重新登录 (HTTP ${String(res.status)})`);
        }
        html = res.body;
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/401|403|Authentication required|会话已失效/i.test(msg)) {
            throw new Error(`Muse 会话已失效，请重新登录: ${msg}`);
        }
        ctx.log.warn(`Failed to fetch Muse home page for dynamic IDs: ${msg}`);
        throw new Error(`Muse 主页拉取失败: ${msg}`);
    }

    // 匹配 x-deployment-id (如 dpl_8qUvxpGTkFRhdjPKF4KXaVBdQCk3)
    const dpl_match =
        /"(dpl_[A-Za-z0-9]+)"/.exec(html) ?? /deploymentId[:=]\s*["']([^"']+)["']/.exec(html);

    // 匹配 next-action ID (32~64位十六进制哈希，需严格带有 action 属性或键名前缀上下文防误命)
    const action_match =
        /actionId[:=]\s*["']([a-f0-9]{32,64})["']/i.exec(html) ??
        /["'](?:next-action|actionId|action)["']\s*[:=]\s*["']([a-f0-9]{32,64})["']/i.exec(html);

    const deployment_id = dpl_match?.[1];
    const action_id = action_match?.[1];

    if (!deployment_id || !action_id) {
        // 如果页面未内嵌则抛出明确错误码，驱动上层排查或重新登录
        throw new Error(
            "MUSE_ACTION_STALE: 无法从 Muse 页面动态提取最新的 Server Action ID 或 Deployment ID",
        );
    }

    return { action_id, deployment_id };
}

// A47 & A124: 流式扫描行与 2MB 预检防护
function parse_rsc_subscription(raw_text: string): SubscriptionData {
    if (raw_text.length > 2 * 1024 * 1024) {
        ctx.log.warn(
            `parse_rsc_subscription: response size exceeds 2MB (${String(raw_text.length)} bytes)`,
        );
    }
    const lines = raw_text.split("\n");
    let failed_parse_count = 0;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const colon_idx = line.indexOf(":");
        if (colon_idx <= 0) continue;
        const candidate = line.slice(colon_idx + 1).trim();
        if (!candidate.includes('"subscription"')) continue;
        try {
            const parsed = JSON.parse(candidate) as SubscriptionResponse;
            if (parsed.subscription) return parsed.subscription;
        } catch (err: unknown) {
            failed_parse_count++;
            ctx.log.debug(
                `Line ${String(i + 1)} JSON parse skipped: ${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }
    throw new Error(
        `Muse 用量响应结构不符合预期，未能找到 subscription 节点 (跳过异常行: ${String(failed_parse_count)})`,
    );
}

async function main(): Promise<ScriptObservation[]> {
    const cookie = required_cookie();
    const base_headers: Record<string, string> = {
        Cookie: cookie,
        "User-Agent": USER_AGENT,
    };

    // A146: 动态拉取当前最新的 Action ID 与 Deployment ID
    const { action_id, deployment_id } = await resolve_dynamic_action_ids(base_headers);

    const headers: Record<string, string> = {
        ...base_headers,
        Accept: "text/x-component",
        "Content-Type": "text/plain;charset=UTF-8",
        Origin: "https://muse.ai",
        Referer: "https://muse.ai/",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Dest": "empty",
        "next-action": action_id,
        "x-deployment-id": deployment_id,
    };

    let raw_res;
    try {
        if (!ctx.http.post_raw) {
            throw new Error("Host HTTP client does not support post_raw");
        }
        raw_res = await ctx.http.post_raw(
            "default",
            "/",
            JSON.stringify([{ includeAgreement: true }]),
            { headers },
        );
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/401|403|Authentication required/i.test(msg)) {
            throw new Error(`Muse 会话已失效，请重新登录: ${msg}`);
        }
        throw new Error(`Muse 用量网络请求失败: ${msg}`);
    }

    const { status, body } = raw_res;

    if (status === 401 || status === 403 || /Authentication required/i.test(body)) {
        throw new Error("Muse 会话已失效，请重新登录: Authentication required");
    }

    if (status !== 200) {
        throw new Error(`Muse 用量请求失败 (HTTP ${String(status)})`);
    }

    const sub = parse_rsc_subscription(body);
    const now = Date.now();
    const account_id = "default";
    const account_label = sub.tier?.name ?? "Muse 免费版";

    const observations: ScriptObservation[] = [];

    // 1. 周限额度
    if (sub.usage) {
        const raw_pct = sub.usage.percentUsed;
        // A46: percentUsed 缺失或非有限值不兜底 0 画绿
        if (typeof raw_pct !== "number" || !Number.isFinite(raw_pct)) {
            ctx.report_failed_account(
                "muse",
                account_id,
                account_label,
                "Muse 未返回有效的 percentUsed 字段",
            );
        } else {
            const used_pct = Math.max(0, Math.min(100, raw_pct));
            const reset_at =
                typeof sub.usage.resetsAt === "number" && Number.isFinite(sub.usage.resetsAt)
                    ? sub.usage.resetsAt * 1000
                    : null;
            observations.push({
                provider: "muse",
                account_id,
                account_label,
                metric_id: "muse:weekly",
                raw_label: "weekly",
                normalized_label: "每周限额",
                window: "week",
                cycleDurationMs: 7 * 24 * 60 * 60 * 1000,
                used: used_pct,
                limit: 100,
                display_style: "percent",
                reset_at,
                status: ctx.status.for_pct(used_pct),
                observed_at: now,
                source: "session",
                stale: false,
                last_error: null,
            });
        }
    }

    // 2. 额外额度 (从不过期词元)
    if (sub.topupBalance !== undefined || sub.topupTotal !== undefined) {
        const total = sub.topupTotal ?? 0;
        const balance = sub.topupBalance ?? 0;
        let used_pct = 0;
        if (total > 0 && balance <= total) {
            used_pct = Math.round(((total - balance) / total) * 100);
        }
        observations.push({
            provider: "muse",
            account_id,
            account_label,
            metric_id: "muse:extra",
            raw_label: "extra",
            normalized_label: "额外额度",
            window: "total",
            cycleDurationMs: null,
            used: used_pct,
            limit: 100,
            display_style: "percent",
            reset_at: null,
            status: ctx.status.for_pct(used_pct),
            observed_at: now,
            source: "session",
            stale: false,
            last_error: null,
        });
    }

    return observations;
}

void main;
