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

const DISCOVERY_KEY = "muse_subscription_action";
const DEFAULT_ROUTER_STATE_TREE =
    "%5B%22%22%2C%7B%22children%22%3A%5B%22(authenticated)%22%2C%7B%22children%22%3A%5B%22(shell)%22%2C%7B%22children%22%3A%5B%5B%22path%22%2C%22%22%2C%22oc%22%2Cnull%5D%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%2Cnull%2Cnull%2C4096%5D%7D%2Cnull%2Cnull%2C4096%5D%7D%2Cnull%2Cnull%2C4096%5D%7D%2Cnull%2Cnull%2C4096%5D%7D%2Cnull%2Cnull%2C4112%5D";

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

async function resolve_dynamic_action_ids(headers: Record<string, string>): Promise<{
    action_id: string;
    deployment_id: string;
}> {
    const param_action = (ctx.params["ACTION_ID"] ?? "").trim();
    const param_dpl = (ctx.params["DEPLOYMENT_ID"] ?? "").trim();

    // 手动逃生模式（AC-008）：显式参数覆盖
    if (param_action && param_dpl) {
        return { action_id: param_action, deployment_id: param_dpl };
    }

    let html = "";
    try {
        const res = await ctx.http.get_raw("default", "/", { headers });
        if (res.status === 401 || res.status === 403) {
            throw new Error(
                `SESSION_EXPIRED: Muse 会话已失效，请重新登录 (HTTP ${String(res.status)})`,
            );
        }
        if (
            res.status >= 300 &&
            res.status < 400 &&
            typeof res.headers["location"] === "string" &&
            res.headers["location"].includes("auth.muse.ai")
        ) {
            throw new Error("SESSION_EXPIRED: Muse 会话已失效，请重新登录: Redirected to auth");
        }
        html = res.body;
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/401|403|Authentication required|会话已失效/i.test(msg)) {
            throw new Error(`SESSION_EXPIRED: Muse 会话已失效，请重新登录: ${msg}`);
        }
        ctx.log.warn(`Failed to fetch Muse home page: ${msg}`);
        throw err;
    }

    // 匹配 x-deployment-id
    const dpl_match =
        /data-dpl-id=["'](dpl_[A-Za-z0-9_]+)["']/.exec(html) ??
        /dpl=(dpl_[A-Za-z0-9_]+)/.exec(html) ??
        /"(dpl_[A-Za-z0-9_]+)"/.exec(html) ??
        /deploymentId[:=]\s*["']([^"']+)["']/.exec(html);

    const deployment_id = param_dpl !== "" ? param_dpl : (dpl_match?.[1] ?? "muse_default");

    // 1. 若首页 HTML 中已有 actionId，直接使用
    let action_id = param_action;
    if (!action_id) {
        const action_match =
            /actionId[:=]\s*["']([a-f0-9]{32,64})["']/i.exec(html) ??
            /["'](?:next-action|actionId|action)["']\s*[:=]\s*["']([a-f0-9]{32,64})["']/i.exec(
                html,
            ) ??
            /createServerReference\)\(["']([a-f0-9]{32,64})["'][^)]*?fetchSubscriptionAction/i.exec(
                html,
            );
        if (action_match?.[1]) {
            action_id = action_match[1];
        }
    }

    // 提取首页脚本清单
    const direct_scripts = [
        ...html.matchAll(/<script[^>]+src=["'](\/_next\/static\/chunks\/[^"']+)["']/g),
    ]
        .map((m) => m[1])
        .filter((s): s is string => typeof s === "string");
    const rsc_scripts = [...html.matchAll(/\\"script-\d+\\",\{\\"src\\":\\"([^\\"]+)\\"/g)]
        .map((m) => m[1])
        .filter((s): s is string => typeof s === "string");
    const all_scripts = [...new Set([...direct_scripts, ...rsc_scripts])];
    all_scripts.sort();

    const signature = `${deployment_id}:${String(all_scripts.length)}:${all_scripts.slice(0, 3).join(",")}`;

    // 2. 检查 ctx.discovery 缓存（AC-003 / AC-004）
    if (!action_id) {
        const cached = await ctx.discovery.get(DISCOVERY_KEY);
        if (cached?.signature === signature && cached.action_id) {
            ctx.log.info(
                `[muse] Reuse cached action ID: ${cached.action_id} for deployment ${deployment_id}`,
            );
            return { action_id: cached.action_id, deployment_id };
        }
    }

    // 3. 有界并发与命中即停扫描（AC-001 / AC-002 / AC-006）
    if (!action_id && all_scripts.length > 0) {
        const start_time = Date.now();
        let scanned_chunks = 0;
        let settings_module_id: string | null = null;
        const downloaded_chunks = new Map<string, string>();

        for await (const chunk of ctx.pool.map(
            all_scripts,
            async (s) => {
                const path = s.startsWith("/") ? s : `/${s}`;
                try {
                    const res = await ctx.http.get_raw("default", path);
                    return { path, text: res.body };
                } catch {
                    return { path, text: "" };
                }
            },
            { concurrency: 4 },
        )) {
            scanned_chunks++;
            if (!chunk.text) continue;
            downloaded_chunks.set(chunk.path, chunk.text);

            const match =
                /createServerReference\)\(["']([a-f0-9]{32,64})["'][^)]*?fetchSubscriptionAction/.exec(
                    chunk.text,
                );
            if (match?.[1]) {
                action_id = match[1];
                ctx.log.info(
                    `[muse] Directly resolved action ID ${action_id} after ${String(scanned_chunks)} chunks (${String(Date.now() - start_time)}ms)`,
                );
                break; // 靠前分包命中即停（AC-001）
            }

            if (!settings_module_id) {
                const sm =
                    /\.A\((\d+)\)\.then\((?:(?!\.A\()[\s\S])*?HatchSettingsDialogContent/.exec(
                        chunk.text,
                    );
                if (sm?.[1]) {
                    settings_module_id = sm[1];
                }
            }
        }

        // 若未直接命中，通过设置组件模块定位异步清单分包
        if (!action_id && settings_module_id) {
            const reg = new RegExp(
                `(?:^|\\D)${settings_module_id}\\s*,\\s*(?:function\\s*\\([^)]*\\)|\\(?\\w+\\)?\\s*=>)(?:(?!Promise\\.all)[\\s\\S])*?Promise\\.all\\(\\[([^\\]]+)\\]`,
            );
            let target_chunks: string[] = [];
            for (const text of downloaded_chunks.values()) {
                const sm_match = reg.exec(text);
                if (sm_match?.[1]) {
                    target_chunks = [...sm_match[1].matchAll(/"(static\/chunks\/[^"]+\.js)"/g)]
                        .map((m) => m[1])
                        .filter((c): c is string => typeof c === "string" && c.length > 0);
                    break;
                }
            }

            if (target_chunks.length > 0) {
                for await (const chunk of ctx.pool.map(
                    target_chunks,
                    async (c) => {
                        try {
                            const cres = await ctx.http.get_raw("default", `/_next/${c}`);
                            return { path: c, text: cres.body };
                        } catch {
                            return { path: c, text: "" };
                        }
                    },
                    { concurrency: 4 },
                )) {
                    scanned_chunks++;
                    if (!chunk.text) continue;
                    const match =
                        /createServerReference\)\(["']([a-f0-9]{32,64})["'][^)]*?fetchSubscriptionAction/.exec(
                            chunk.text,
                        );
                    if (match?.[1]) {
                        action_id = match[1];
                        ctx.log.info(
                            `[muse] Semantically resolved action ID ${action_id} in settings chunk (${String(Date.now() - start_time)}ms)`,
                        );
                        break;
                    }
                }
            }
        }
    }

    if (!action_id) {
        throw new Error("DISCOVERY_EMPTY: 未能从 Muse 页面分包中解析到有效的 Server Action ID");
    }

    // 发现成功后写入 discovery 缓存（AC-001 / AC-004）
    await ctx.discovery.set(DISCOVERY_KEY, {
        signature,
        action_id,
        deployment_id,
        discovered_at: Date.now(),
    });

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
        "next-router-state-tree": DEFAULT_ROUTER_STATE_TREE,
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
        if (/401|403|Authentication required|会话已失效/i.test(msg)) {
            throw new Error(`SESSION_EXPIRED: Muse 会话已失效，请重新登录: ${msg}`);
        }
        throw new Error(`Muse 用量网络请求失败: ${msg}`);
    }

    const { status, body } = raw_res;

    if (status === 401 || status === 403 || /Authentication required/i.test(body)) {
        throw new Error("SESSION_EXPIRED: Muse 会话已失效，请重新登录");
    }

    if (status === 404 || /Invalid Server Action|Failed to find Server Action/i.test(body)) {
        await ctx.discovery.delete(DISCOVERY_KEY);
        throw new Error(
            `ACTION_STALE: Muse 服务端拒绝当前 Action ID，线上版本可能已更新 (HTTP ${String(status)})`,
        );
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
