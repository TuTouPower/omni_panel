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

const ACTION_ID = "407c800bb93d1539e5152b02e7f8ed6a82a7729a86";
const DEPLOYMENT_ID = "dpl_8qUvxpGTkFRhdjPKF4KXaVBdQCk3";
const USER_AGENT =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36";

function required_cookie(): string {
    const raw = (ctx.params["SESSION_COOKIE"] ?? "").trim();
    if (!raw) throw new Error("Missing required secret: SESSION_COOKIE");
    return raw.includes("=") ? raw : `hatch_sess=${raw}`;
}

function parse_rsc_subscription(raw_text: string): SubscriptionData {
    const lines = raw_text.split("\n");
    for (const line of lines) {
        const colon_idx = line.indexOf(":");
        if (colon_idx <= 0) continue;
        const candidate = line.slice(colon_idx + 1).trim();
        if (!candidate.includes('"subscription"')) continue;
        try {
            const parsed = JSON.parse(candidate) as SubscriptionResponse;
            if (parsed.subscription) return parsed.subscription;
        } catch {
            // 继续扫描后续行
        }
    }
    throw new Error("Muse 用量响应结构不符合预期，未能找到 subscription 节点");
}

async function main(): Promise<ScriptObservation[]> {
    const cookie = required_cookie();
    const headers: Record<string, string> = {
        Accept: "text/x-component",
        "Content-Type": "text/plain;charset=UTF-8",
        Origin: "https://muse.ai",
        Referer: "https://muse.ai/",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Dest": "empty",
        "next-action": ACTION_ID,
        "x-deployment-id": DEPLOYMENT_ID,
        Cookie: cookie,
        "User-Agent": USER_AGENT,
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
        const used_pct = typeof sub.usage.percentUsed === "number" ? sub.usage.percentUsed : 0;
        const reset_at = sub.usage.resetsAt ? sub.usage.resetsAt * 1000 : null;
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
