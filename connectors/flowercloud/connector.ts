import type { ConnectorContext } from "../../src/main/core/connector/host-io";
import type { ScriptObservation } from "../../src/shared/types/observation";

declare const ctx: ConnectorContext;

const USER_AGENT =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";

const CYCLE_30D_MS = 30 * 24 * 60 * 60 * 1000;

function required_cookie(): { cookie: string; cached_html: string } {
    const raw = (ctx.params["SESSION_COOKIE"] ?? "").trim();
    if (!raw) throw new Error("Missing required secret: SESSION_COOKIE");

    let cookie = raw;
    let cached_html = "";

    if (raw.startsWith("{")) {
        try {
            const parsed = JSON.parse(raw) as { cookie?: unknown; html?: unknown };
            if (typeof parsed.cookie === "string" && parsed.cookie) cookie = parsed.cookie;
            if (typeof parsed.html === "string" && parsed.html) cached_html = parsed.html;
        } catch {
            // raw cookie string
        }
    }

    if (!cookie) throw new Error("Missing required secret: SESSION_COOKIE");
    if (/[\r\n]/.test(cookie) || cookie.length > 32768) {
        throw new Error("Invalid cookie: CRLF characters or length > 32KB detected");
    }
    return { cookie, cached_html };
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
    const { cookie, cached_html } = required_cookie();
    const now = Date.now();
    const reset_day_param = ctx.params["RESET_DAY"]?.trim();

    const headers: Record<string, string> = {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        Cookie: cookie,
    };

    let html = cached_html;

    try {
        const res = await ctx.http.get_raw("default", "/clientarea.php", { headers });
        const lower = res.body.toLowerCase();
        const has_cf_challenge =
            lower.includes("cf-turnstile") ||
            lower.includes("just a moment...") ||
            lower.includes("challenge-running");

        if (res.status === 200 && !has_cf_challenge) {
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
                if (
                    details_res.status === 200 &&
                    !details_res.body.toLowerCase().includes("just a moment")
                ) {
                    html = details_res.body;
                }
            }
        } else if (!cached_html) {
            check_auth_or_challenge(res);
        } else {
            ctx.log.info(`FlowerCloud: Network challenged, using cached session HTML`);
        }
    } catch (err) {
        if (!cached_html) {
            throw err;
        }
        ctx.log.info(
            `FlowerCloud: Network error (${String(err)}), falling back to cached session HTML`,
        );
    }

    if (!html) {
        throw new Error("FlowerCloud 遇到 Cloudflare 质询拦截，请点击网页登录完成人机验证");
    }

    const { used_gb, limit_gb, reset_at, product_name } = extract_from_html(
        html,
        now,
        reset_day_param,
    );

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
        stale: false,
        last_error: null,
    };

    return [obs];
}

void main;
