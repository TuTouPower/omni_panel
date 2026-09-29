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

function compute_next_reset_from_day(day_num: number, now: number): number {
    const current = new Date(now);
    const year = current.getFullYear();
    const month = current.getMonth();
    const current_day = current.getDate();

    let target_year = year;
    let target_month = month;

    if (current_day >= day_num) {
        target_month += 1;
        if (target_month > 11) {
            target_month = 0;
            target_year += 1;
        }
    }

    // 处理月末天数边界（如 2 月无 31 日）
    const max_day_in_target = new Date(target_year, target_month + 1, 0).getDate();
    const valid_day = Math.min(day_num, max_day_in_target);

    return new Date(target_year, target_month, valid_day, 0, 0, 0, 0).getTime();
}

interface ParsedUsage {
    used_gb: number | null;
    limit_gb: number | null;
    reset_at: number | null;
    product_name: string;
}

function extract_from_html(html: string, now: number, reset_day_param?: string): ParsedUsage {
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

    // 3. 匹配下次到期重置日期 (nextduedate)
    const date_match =
        /(?:下次重置日|下次付款日期|下次到期日|Next Due Date|nextduedate|重置日|到期日)[^<>{}:：]*[:：]\s*<[^>]*>(\d{4}[-/年]\d{1,2}[-/月]\d{1,2})<\/[^>]*>/i.exec(
            html,
        ) ??
        /(?:下次重置日|下次付款日期|下次到期日|Next Due Date|nextduedate|重置日|到期日)[^<>{}:：]*[:：]\s*(\d{4}[-/年]\d{1,2}[-/月]\d{1,2})/i.exec(
            html,
        ) ??
        /\b(\d{4}[-/]\d{2}[-/]\d{2})\b/.exec(html);

    if (date_match?.[1]) {
        const normalized_date = date_match[1].replace(/[年月/]/g, "-").replace(/日/g, "");
        const parsed = Date.parse(`${normalized_date}T00:00:00+08:00`);
        if (Number.isFinite(parsed)) {
            reset_at = parsed;
        }
    }

    // 4. 用户指定 RESET_DAY 兜底逻辑
    if (!reset_at && reset_day_param) {
        const day_num = parseInt(reset_day_param.trim(), 10);
        if (Number.isFinite(day_num) && day_num >= 1 && day_num <= 31) {
            reset_at = compute_next_reset_from_day(day_num, now);
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

async function main(): Promise<ScriptObservation[]> {
    const { cookie, session_html, captured_at } = required_cookie();
    const now = Date.now();
    const reset_day_param = ctx.params["RESET_DAY"]?.trim();
    // 没有 captured_at 的旧载荷无法判断新鲜度，按过期处理：宁可让 UI 标注不新鲜，
    // 也不能把未知年龄的页面当成实时数据。
    const snapshot_age_ms = captured_at === undefined ? null : now - captured_at;
    const snapshot_stale =
        session_html !== undefined &&
        (snapshot_age_ms === null || snapshot_age_ms > SNAPSHOT_FRESH_MS);

    let html: string;

    if (session_html) {
        // 有快照就不再发网络请求：Cloudflare 会拦住纯 HTTP 重放，重试只会换来挑战页。
        // 数据新鲜度由宿主的 DOM 快照刷新负责（stale 标记如实反映快照年龄）。
        ctx.log.info(
            snapshot_age_ms === null
                ? "FlowerCloud: stored DOM has no capture time, treating it as stale"
                : snapshot_age_ms > SNAPSHOT_FRESH_MS
                  ? `FlowerCloud: stored DOM is ${String(Math.round(snapshot_age_ms / 60000))}min old`
                  : "FlowerCloud: Using browser session DOM",
        );
        html = session_html;
    } else {
        const headers: Record<string, string> = {
            "User-Agent": USER_AGENT,
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            Cookie: cookie,
        };

        const res = await ctx.http.get_raw("default", "/clientarea.php", { headers });
        check_auth_or_challenge(res);
        html = res.body;

        // 若客户区主页未直接展示用量卡片，检测是否有服务详情链接并跟进
        const product_details_match =
            /clientarea\.php\?action=productdetails&amp;id=(\d+)/i.exec(html) ??
            /clientarea\.php\?action=productdetails&id=(\d+)/i.exec(html);

        if (product_details_match?.[1] && !/(?:已用|Used|\d+GB\s*\/)/i.test(html)) {
            const service_id = product_details_match[1];
            ctx.log.info(`FlowerCloud: Navigating to service details: id=${service_id}`);
            const details_res = await ctx.http.get_raw(
                "default",
                `/clientarea.php?action=productdetails&id=${service_id}`,
                { headers },
            );
            check_auth_or_challenge(details_res);
            html = details_res.body;
        }
    }

    const { used_gb, limit_gb, reset_at, product_name } = extract_from_html(
        html,
        now,
        reset_day_param,
    );

    // p267: 一个账号可挂多个服务，而本连接器只取首个用量。出现多个服务时明确记一条，
    // 免得用户把面板数字当成全部服务的合计。
    const service_ids = new Set(
        [...html.matchAll(/clientarea\.php\?action=productdetails(?:&amp;|&)id=(\d+)/gi)]
            .map((match) => match[1])
            .filter((id): id is string => typeof id === "string"),
    );
    if (service_ids.size > 1) {
        ctx.log.warn(
            `FlowerCloud: 页面含 ${String(service_ids.size)} 个服务，当前只统计首个（见 p267）`,
        );
    }

    if (used_gb === null && limit_gb === null) {
        ctx.log.warn("FlowerCloud: 无法从控制台页面匹配到用量或配额数据");
    }

    const account_id = "flowercloud_default";
    const status =
        used_gb !== null && limit_gb !== null && limit_gb > 0
            ? ctx.status.for_ratio(used_gb, limit_gb)
            : "unknown";

    const obs: ScriptObservation = {
        provider: "flowercloud",
        account_id,
        account_label: product_name,
        metric_id: "flowercloud:traffic",
        raw_label: "monthly_traffic",
        normalized_label: "月流量",
        window: "month",
        cycleDurationMs: CYCLE_30D_MS,
        used: used_gb,
        limit: limit_gb,
        display_style: "ratio",
        reset_at,
        status,
        observed_at: now,
        source: "session",
        stale: snapshot_stale,
        last_error: null,
    };

    return [obs];
}

void main;
