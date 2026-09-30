import type { ConnectorContext } from "../../src/main/core/connector/host-io";
import type { ScriptObservation } from "../../src/shared/types/observation";

declare const ctx: ConnectorContext;

const USER_AGENT =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";

const CYCLE_30D_MS = 30 * 24 * 60 * 60 * 1000;
/**
 * vault 快照超过这个年龄只能当过期数据（宿主每轮刷新会重抓页面）。
 * 必须与 src/shared/constants.ts 的 FLOWERCLOUD_SNAPSHOT_FRESH_MS 保持一致
 * ——connector 是独立脚本，不能 import 宿主常量。
 */
const SNAPSHOT_FRESH_MS = 5 * 60 * 1000;

function required_cookie(): {
    cookie: string;
    session_html?: string | undefined;
    captured_at?: number | undefined;
} {
    const raw = (ctx.params["SESSION_COOKIE"] ?? "").trim();
    if (!raw) throw new Error("Missing required secret: SESSION_COOKIE");

    let cookie = raw;
    let session_html: string | undefined;
    let captured_at: number | undefined;

    if (raw.startsWith("{")) {
        try {
            const parsed = JSON.parse(raw) as {
                cookie?: unknown;
                html?: unknown;
                captured_at?: unknown;
            };
            if (typeof parsed.cookie === "string" && parsed.cookie) cookie = parsed.cookie;
            // 真实浏览器会话捕获的 DOM HTML
            if (typeof parsed.html === "string" && parsed.html) {
                session_html = parsed.html;
            }
            if (typeof parsed.captured_at === "number" && Number.isFinite(parsed.captured_at)) {
                captured_at = parsed.captured_at;
            }
        } catch {
            // raw cookie string
        }
    }

    if (!cookie) throw new Error("Missing required secret: SESSION_COOKIE");
    if (/[\r\n]/.test(cookie) || cookie.length > 32768) {
        throw new Error("Invalid cookie: CRLF characters or length > 32KB detected");
    }
    return { cookie, session_html, captured_at };
}

function parse_to_gb(value: number, unit: string): number {
    const u = unit.toUpperCase();
    if (u.includes("TB") || u.includes("TIB")) return Math.round(value * 1024 * 100) / 100;
    if (u.includes("GB") || u.includes("GIB")) return Math.round(value * 100) / 100;
    if (u.includes("MB") || u.includes("MIB")) return Math.round((value / 1024) * 100) / 100;
    if (u.includes("KB") || u.includes("KIB"))
        return Math.round((value / (1024 * 1024)) * 100) / 100;
    return value;
}

interface ParsedUsage {
    used_gb: number | null;
    limit_gb: number | null;
    reset_at: number | null;
    product_name: string;
}

function extract_from_html(html: string): ParsedUsage {
    let used_gb: number | null = null;
    let limit_gb: number | null = null;
    let reset_at: number | null = null;
    let product_name = "FlowerCloud";

    // 1. 提取产品套餐名称
    const product_match =
        /(?:Global Acceleration\s+(?:Lite|Plus|Max|Air|Enterprise[A-Za-z\s]*))/i.exec(html) ??
        /(?:产品|服务|套餐|Product\/Service)[^:]*[:：]\s*<[^>]*>([^<]+)<\/[^>]*>/i.exec(html) ??
        /(?:产品|服务|套餐|Product\/Service)[^:]*[:：]\s*([^\r\n<]+)/i.exec(html);
    if (product_match?.[1]) {
        product_name = product_match[1].trim();
    } else if (product_match?.[0]) {
        product_name = product_match[0].trim();
    }

    // 2. 匹配已用流量与总流量组合比率（如 23.45 GB / 150 GB 或 已用 12.5 GB (共 200 GB)）
    const combined_ratio =
        /(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB|GiB|MiB)\s*(?:\/|of|共|，共)\s*(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB|GiB|MiB)/i.exec(
            html,
        );
    if (combined_ratio?.[1] && combined_ratio[2] && combined_ratio[3] && combined_ratio[4]) {
        used_gb = parse_to_gb(parseFloat(combined_ratio[1]), combined_ratio[2]);
        limit_gb = parse_to_gb(parseFloat(combined_ratio[3]), combined_ratio[4]);
    } else {
        // 单独匹配总流量 / 带宽
        const limit_match =
            /(?:带宽|总流量|总额度|Bandwidth|transfer_enable)[^<>{}:：]*[:：]?\s*(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB|GiB|MiB)/i.exec(
                html,
            );
        if (limit_match?.[1] && limit_match[2]) {
            limit_gb = parse_to_gb(parseFloat(limit_match[1]), limit_match[2]);
        }

        // 单独匹配已用流量
        const used_match =
            /(?:已用|已使用|Used)[^<>{}:：(（]*[:：(（]?\s*(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB|GiB|MiB)/i.exec(
                html,
            );
        if (used_match?.[1] && used_match[2]) {
            used_gb = parse_to_gb(parseFloat(used_match[1]), used_match[2]);
        }
    }
    // 3. 匹配下次到期重置日期：只认专属元素 `plan-next-reset` 内的日期
    // （2026-09-30 真实快照实测：详情页
    // `<p class="plan-expires plan-next-reset">下次重置日: 2026/10/07</p>`）。
    // 没有该元素就是没有——reset_at 保持 null（UI 隐藏重置列），禁止编造：
    // 关键词邻接、无锚裸日期、RESET_DAY 手工值一律不再作为来源。
    const anchored_zone = /plan-next-reset[^<>]*>([^<>]{0,300})/i.exec(html)?.[1] ?? "";
    const raw_date = /(\d{4}[-/年]\d{1,2}[-/月]\d{1,2})/.exec(anchored_zone)?.[1] ?? null;

    if (raw_date) {
        const normalized_date = raw_date.replace(/[年月/]/g, "-").replace(/日/g, "");
        const parsed = Date.parse(`${normalized_date}T00:00:00+08:00`);
        if (Number.isFinite(parsed)) {
            reset_at = parsed;
        }
    }

    return { used_gb, limit_gb, reset_at, product_name };
}
function check_auth_or_challenge(res: {
    status: number;
    body: string;
    headers: Record<string, string | string[]>;
}): void {
    if (res.status === 401 || res.status === 403) {
        const lower = res.body.toLowerCase();
        if (
            lower.includes("cf-turnstile") ||
            lower.includes("just a moment...") ||
            lower.includes("challenge-running") ||
            lower.includes("security check")
        ) {
            throw new Error("FlowerCloud 遇到 Cloudflare 质询拦截，请点击网页登录完成人机验证");
        }
        throw new Error(`FlowerCloud 会话已失效 (HTTP ${String(res.status)})，请重新登录`);
    }

    // 检查是否重定向或返回了登录表单
    const lower = res.body.toLowerCase();
    const is_login_page =
        (lower.includes("dologin.php") ||
            lower.includes('action="login"') ||
            lower.includes('type="password"')) &&
        (lower.includes("clientarea") || lower.includes("登录") || lower.includes("login")) &&
        !lower.includes("clientarea.php?action=productdetails") &&
        !lower.includes("已用") &&
        !lower.includes("bandwidth");

    if (is_login_page) {
        throw new Error("FlowerCloud 登录会话已失效，请重新登录");
    }
}

function service_ids(html: string): string[] {
    const ids: string[] = [];
    const seen = new Set<string>();
    const re = /clientarea\.php\?action=productdetails(?:&amp;|&)id=(\d+)/gi;
    for (const match of html.matchAll(re)) {
        const id = match[1];
        if (id !== undefined && !seen.has(id)) {
            seen.add(id);
            ids.push(id);
        }
    }
    return ids;
}

/**
 * t537 s041：多服务快照分段（宿主 compose_flower_sections 的沙箱内复刻解析）。
 * 无分段标记时返回 []，走单页/卡窗路径。
 */
interface SnapshotSection {
    readonly id: string;
    readonly html?: string;
    readonly error?: string;
}

function parse_snapshot_sections(html: string): SnapshotSection[] {
    const sections: SnapshotSection[] = [];
    const re = /<!--omni-flower id=(\d+)(?: error="([^"]*)")?-->([\s\S]*?)<!--\/omni-flower-->/g;
    for (const match of html.matchAll(re)) {
        const id = match[1];
        if (id === undefined) continue;
        const error = match[2];
        const body = match[3] ?? "";
        sections.push({
            id,
            ...(error ? { error } : {}),
            ...(body ? { html: body } : {}),
        });
    }
    return sections;
}

/** 卡窗切片（s041）：第 k 个详情链接之前的窗口承载第 k 个服务的卡片字段。 */
function card_windows(html: string, ids: readonly string[]): string[] {
    const positions: { id: string; end: number }[] = [];
    const re = /clientarea\.php\?action=productdetails(?:&amp;|&)id=(\d+)/gi;
    for (const match of html.matchAll(re)) {
        const id = match[1];
        if (id !== undefined && ids.includes(id) && !positions.some((p) => p.id === id)) {
            positions.push({ id, end: match.index + match[0].length });
        }
    }
    return positions.map((entry, index) => {
        const from = index === 0 ? 0 : (positions[index - 1]?.end ?? 0);
        return html.slice(from, entry.end);
    });
}

function is_complete_usage(usage: ParsedUsage): boolean {
    return usage.used_gb !== null && usage.limit_gb !== null;
}

function detail_headers(cookie: string): Record<string, string> {
    return {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        Cookie: cookie,
    };
}

async function fetch_details_html(cookie: string, service_id: string): Promise<string> {
    const res = await ctx.http.get_raw(
        "default",
        `/clientarea.php?action=productdetails&id=${service_id}`,
        { headers: detail_headers(cookie) },
    );
    check_auth_or_challenge(res);
    return res.body;
}

interface ServiceEntry {
    readonly id: string | null;
    readonly usage?: ParsedUsage;
    readonly error?: string;
    readonly fetched?: boolean;
}

async function main(): Promise<ScriptObservation[]> {
    const { cookie, session_html, captured_at } = required_cookie();
    const now = Date.now();
    // 没有 captured_at 的旧载荷无法判断新鲜度，按过期处理：宁可让 UI 标注不新鲜，
    // 也不能把未知年龄的页面当成实时数据。
    const snapshot_age_ms = captured_at === undefined ? null : now - captured_at;
    // A6：负年龄（时钟回拨 / 迁移旧载荷）视为过期，避免永久不标 stale。
    const snapshot_stale =
        session_html !== undefined &&
        (snapshot_age_ms === null || snapshot_age_ms > SNAPSHOT_FRESH_MS || snapshot_age_ms < 0);

    let html: string;

    if (session_html) {
        // 快照为准：数据新鲜度由宿主的 DOM 快照刷新负责（stale 标记如实反映快照年龄）。
        // t537：只有快照缺某个服务的用量时才按服务 HTTP 补数（Cloudflare 可能拦截，
        // 失败逐服务 report_failed_account，绝不静默）；快照含完整数据则零网络请求。
        ctx.log.info(
            snapshot_age_ms === null
                ? "FlowerCloud: stored DOM has no capture time, treating it as stale"
                : snapshot_age_ms > SNAPSHOT_FRESH_MS
                  ? `FlowerCloud: stored DOM is ${String(Math.round(snapshot_age_ms / 60000))}min old`
                  : snapshot_age_ms < 0
                    ? "FlowerCloud: stored DOM capture time is in the future, treating it as stale"
                    : "FlowerCloud: Using browser session DOM",
        );
        html = session_html;
    } else {
        const res = await ctx.http.get_raw("default", "/clientarea.php", {
            headers: detail_headers(cookie),
        });
        check_auth_or_challenge(res);
        html = res.body;
    }

    // ---- 服务条目解析：快照分段 / 卡窗（多服务） / 整页（单服务）三形态 ----
    let entries: ServiceEntry[];
    const composite = parse_snapshot_sections(html);
    if (composite.length > 0) {
        entries = composite.map((section) => {
            if (section.error !== undefined) return { id: section.id, error: section.error };
            const usage = extract_from_html(section.html ?? "");
            // 分段由宿主在用量结算后写入；仍解析不出完整用量 → 该服务走 HTTP 补数。
            return is_complete_usage(usage) ? { id: section.id, usage } : { id: section.id };
        });
    } else {
        const ids = service_ids(html);
        if (ids.length <= 1) {
            // 单服务（或纯详情页 / 无链接页）：整页语义与历史行为一致。
            const usage = extract_from_html(html);
            const id = ids[0] ?? null;
            entries = id === null || is_complete_usage(usage) ? [{ id, usage }] : [{ id }]; // 有 id 但整页缺用量 → 详情页补数
        } else {
            const windows = card_windows(html, ids);
            const window_usages = windows.map((window_html) => extract_from_html(window_html));
            // s041 结论：错配表现为「命中」而非缺失，任一窗口不完整就必须整体丢弃
            // 窗口结果，逐服务 HTTP 详情页补数。
            entries = window_usages.every(is_complete_usage)
                ? ids.flatMap((id, index) => {
                      const usage = window_usages[index];
                      return usage ? [{ id, usage }] : [];
                  })
                : ids.map((id) => ({ id }));
        }
    }

    // ---- 缺用量的条目逐服务 HTTP 详情页补数（失败隔离，AC-002） ----
    const resolved: ServiceEntry[] = [];
    for (const entry of entries) {
        if (entry.usage !== undefined || entry.error !== undefined || entry.id === null) {
            resolved.push(entry);
            continue;
        }
        const service_id = entry.id;
        try {
            const detail_html = await fetch_details_html(cookie, service_id);
            const usage = extract_from_html(detail_html);
            resolved.push(
                is_complete_usage(usage)
                    ? { id: service_id, usage, fetched: true }
                    : { id: service_id, error: "服务详情页未解析出用量", fetched: true },
            );
        } catch (error) {
            resolved.push({
                id: service_id,
                error: error instanceof Error ? error.message : String(error),
                fetched: true,
            });
        }
    }

    // ---- 输出：多服务按服务区分 account_id/标签，失败逐服务登记 ----
    const with_id = resolved.filter((entry) => entry.id !== null);
    const multi = with_id.length > 1;
    const observations: ScriptObservation[] = [];

    for (const entry of resolved) {
        const account_id =
            entry.id !== null && multi ? `flowercloud_service_${entry.id}` : "flowercloud_default";
        let account_label =
            entry.usage?.product_name ?? (entry.id !== null ? `服务 ${entry.id}` : "FlowerCloud");
        if (entry.id !== null && multi && account_label === "FlowerCloud") {
            account_label = `服务 ${entry.id}`;
        }

        if (entry.error !== undefined) {
            ctx.report_failed_account("flowercloud", account_id, account_label, entry.error);
            continue;
        }

        const usage = entry.usage;
        const used_gb = usage?.used_gb ?? null;
        const limit_gb = usage?.limit_gb ?? null;
        if (used_gb === null && limit_gb === null) {
            ctx.log.warn("FlowerCloud: 无法从控制台页面匹配到用量或配额数据");
        }

        const status =
            used_gb !== null && limit_gb !== null && limit_gb > 0
                ? ctx.status.for_ratio(used_gb, limit_gb)
                : "unknown";

        observations.push({
            provider: "flowercloud",
            account_id,
            account_label,
            metric_id: "flowercloud:traffic",
            raw_label: "monthly_traffic",
            normalized_label: "月流量",
            window: "month",
            cycleDurationMs: CYCLE_30D_MS,
            used: used_gb,
            limit: limit_gb,
            display_style: "ratio",
            reset_at: usage?.reset_at ?? null,
            status,
            observed_at: now,
            source: "session",
            // 快照解析的数据按快照年龄标 stale；HTTP 当场取到的是新鲜数据。
            stale: entry.fetched === true ? false : snapshot_stale,
            last_error: null,
        });
    }

    return observations;
}

void main;
