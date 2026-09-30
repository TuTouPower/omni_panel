/**
 * 花云（FlowerCloud）网页会话 DOM 抓取。
 *
 * 花云的用量只渲染在登录后的页面里，Cloudflare 质询也不允许纯 HTTP 重放，因此：
 * - 登录流程靠轮询页面 DOM 拿到用量快照（本模块被 session-manager 复用）；
 * - 定时刷新由宿主开一次隐藏会话窗口重抓，再把 HTML 写回 vault 供 connector 解析。
 *
 * s040 结论（`docs/findings/d063`）：`show:false` 的窗口里 `document.hidden` 已是 false，
 * Cloudflare 脚本照常执行，抓取**不需要把窗口显示出来**；而 `show()` + 聚焦（reveal）会把
 * 托管式自动挑战（「正在验证…」）升级成必须人工点击的交互挑战（「请验证您是真人」）并抢焦点。
 * 因此本模块只使用隐藏窗，失败即有界返回原因，不再前台化、不把窗口交给用户。
 *
 * 会话/窗口契约见 ./session-types，避免与 session-manager 形成 import 环。
 */

import { FLOWERCLOUD_SNAPSHOT_FRESH_MS } from "../../../shared/constants";
import { is_safe_cookie_string } from "../../../shared/lib/cookie";
import { createLogger } from "../../../shared/lib/logger";
import { keyFor } from "../config/secrets-store";
import type { VaultBackend } from "../vault/vault-backend";
import type {
    FlowercloudSnapshotOptions,
    SessionController,
    SessionCookie,
    SessionWindow,
} from "./session-types";

const log = createLogger("flowercloud-dom");

const SESSION_COOKIE_KEY = "SESSION_COOKIE";
export const FLOWER_SNAPSHOT_TIMEOUT_MS = 45_000;
const FLOWER_SNAPSHOT_POLL_MS = 400;
const FLOWER_SNAPSHOT_SETTLE_MS = 2_500;
export const FLOWER_USAGE_RE = /(?:流量使用|\d+(?:\.\d+)?GB\s*\/)/i;

export type FlowerPageKind =
    | "usage"
    | "overview"
    | "cloudflare"
    | "login"
    | "blocked"
    | "empty"
    | "other"
    | "network"
    | "cancelled";

/** vault 中 SESSION_COOKIE 的载荷结构（与 connectors/flowercloud/connector.ts 约定一致）。 */
export interface FlowercloudSecretPayload {
    readonly cookie?: string;
    readonly html?: string;
    readonly captured_at?: number;
}

export function parse_flowercloud_secret(raw: string | null | undefined): FlowercloudSecretPayload {
    if (!raw) return {};
    if (!raw.startsWith("{")) return { cookie: raw };
    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const cookie = parsed["cookie"];
        const html = parsed["html"];
        const captured_at = parsed["captured_at"];
        return {
            ...(typeof cookie === "string" && cookie ? { cookie } : {}),
            ...(typeof html === "string" && html ? { html } : {}),
            ...(typeof captured_at === "number" && Number.isFinite(captured_at)
                ? { captured_at }
                : {}),
        };
    } catch {
        return { cookie: raw };
    }
}

export function build_flowercloud_secret(cookie: string, html: string | null): string {
    return JSON.stringify({ cookie, html, captured_at: Date.now() });
}

/**
 * 快照是否仍在新鲜期内。负年龄（时钟回拨 / 迁移机器后的旧载荷）视为过期，
 * 否则定时刷新会永久判定"新鲜"而跳过、UI 静默显示旧数据（A6）。
 */
export function is_flowercloud_snapshot_fresh(
    stored: FlowercloudSecretPayload,
    now: number = Date.now(),
): boolean {
    if (!stored.html || stored.captured_at === undefined) return false;
    const age = now - stored.captured_at;
    return age >= 0 && age <= FLOWERCLOUD_SNAPSHOT_FRESH_MS;
}

export function flower_product_details_id(html: string): string | null {
    return flower_service_ids(html)[0] ?? null;
}

/** t537 AC-001：页面里全部服务详情 id（出现顺序、按 id 去重）。 */
export function flower_service_ids(html: string): string[] {
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

export function flower_details_url(login_url: string, service_id: string): string {
    const origin = new URL(login_url).origin;
    return `${origin}/clientarea.php?action=productdetails&id=${service_id}`;
}

/**
 * t537：多服务快照分段。单服务保持裸 HTML（退化形态，存量载荷兼容）；
 * 多服务按段拼接，失败服务保留 error 标注而非静默省略（AC-003）。
 * 解析方为独立 connector 脚本，同格式在其内部复刻（沙箱边界不共享 import）。
 */
export interface FlowerSnapshotSection {
    readonly id: string;
    readonly html?: string;
    readonly error?: string;
}

export function compose_flower_sections(sections: readonly FlowerSnapshotSection[]): string {
    return sections
        .map((section) => {
            // error 文案来自 flower_failure_reason / 固定超时文案，理论上无引号；
            // 仍清洗以保证标注不破坏分段标记：引号/换行破坏属性，`--` 破坏 HTML 注释语法。
            // 体部 html 原样嵌入（若含字面 `<!--/omni-flower-->` 会提前闭合——项目自造标记，
            // 概率极低；体部冲突由宿主→连接器往返契约测试锁定，见 A2）。
            const error = section.error
                ? ` error="${section.error.replace(/["\r\n]/g, " ").replace(/--/g, " ")}"`
                : "";
            return `<!--omni-flower id=${section.id}${error}-->${section.html ?? ""}<!--/omni-flower-->`;
        })
        .join("\n");
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

/**
 * 把 vault 里的会话 cookie 灌进会话分区。
 * 分区里已有的 cookie（如浏览器刚刷新的 cf_clearance）通过 skip_names 保留。
 */
export async function seed_partition_cookies(
    session: SessionController,
    vault: VaultBackend,
    instance_id: string,
    login_url: string,
    options?: { skip_names?: ReadonlySet<string> },
): Promise<void> {
    if (!session.set_cookie) return;
    const raw = await vault.get(keyFor(instance_id, SESSION_COOKIE_KEY));
    if (!raw) return;
    const parsed = parse_flowercloud_secret(raw);
    const cookie_str = parsed.cookie ?? "";
    // 载荷以 "{" 开头却解析不出 cookie：结构损坏，宁可什么都不灌也不能拿 JSON 文本当 cookie。
    if (!cookie_str || (raw.startsWith("{") && !parsed.cookie)) return;
    const parts = cookie_str.split(";").map((part) => part.trim());
    for (const part of parts) {
        const eq = part.indexOf("=");
        if (eq <= 0) continue;
        const name = part.slice(0, eq).trim();
        const value = part.slice(eq + 1).trim();
        if (!name || !value || options?.skip_names?.has(name)) continue;
        // A1：回灌与写路径同基线——vault 内容先过安全校验再进分区，CRLF/超长直接跳过该条。
        if (!is_safe_cookie_string(`${name}=${value}`)) continue;
        await session.set_cookie(login_url, name, value);
    }
}

export function flower_page_kind(html: string | null): FlowerPageKind {
    if (!html) return "empty";
    if (FLOWER_USAGE_RE.test(html)) return "usage";
    if (flower_product_details_id(html)) return "overview";
    const lower = html.toLowerCase();
    if (
        lower.includes("cf-challenge") ||
        lower.includes("cf-browser-verification") ||
        lower.includes("challenges.cloudflare.com") ||
        lower.includes("just a moment") ||
        lower.includes("turnstile")
    ) {
        return "cloudflare";
    }
    if (
        lower.includes("dologin.php") ||
        lower.includes('type="password"') ||
        lower.includes("type='password'")
    ) {
        return "login";
    }
    if (
        lower.includes("恶意流量") ||
        lower.includes("attention required") ||
        lower.includes("error 1020") ||
        lower.includes("access denied")
    ) {
        return "blocked";
    }
    return "other";
}

/**
 * 把抓取失败分类翻译成用户可读原因（供调度层写入 runtime 失败状态）。
 * 成功路径（usage / overview）不应调用本函数。
 */
export function flower_failure_reason(kind: FlowerPageKind): string {
    switch (kind) {
        case "cloudflare":
            return "花云要求完成人机验证（Cloudflare 质询），本轮未取到新数据";
        case "login":
            return "花云登录会话已失效，请重新登录";
        case "blocked":
            return "花云访问被拦截，当前网络出口可能受限";
        case "empty":
            return "花云页面未渲染出内容";
        case "cancelled":
            return "花云抓取被取消";
        case "other":
            return "花云页面未出现用量数据";
        case "network":
            // 同一 try 里除页面加载外还有 vault / session 读写，故不主张具体原因。
            return "花云页面抓取失败（加载、网络或会话读取异常）";
        case "usage":
        case "overview":
            // 可达：run_flowercloud_snapshot 拿到用量页但 write_flowercloud_html 未写入
            //（无会话 / CAS 跳过 / 取消）时 kind 仍为 usage，调用方用本条文案（R9）。
            return "花云页面已出现用量，但本轮未写入快照";
    }
}

/** 只保留登录态 cookie。分区里的客服 cookie 名很长，整包写回会超过安全长度。 */
export function flower_auth_cookie_header(cookies: readonly SessionCookie[]): string | null {
    const kept = cookies.filter(
        (cookie) => cookie.name === "cf_clearance" || cookie.name.toUpperCase().startsWith("WHMCS"),
    );
    if (!kept.some((cookie) => cookie.name.toUpperCase().startsWith("WHMCS"))) return null;
    const header = kept.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
    return is_safe_cookie_string(header) ? header : null;
}

/**
 * 用 fresh 中的同名值更新 existing，保留 existing 里的其它 cookie。
 * 直接整体替换会丢掉 vault 里已有的非 WHMCS cookie（如 D0S_Header），
 * 网络回退路径就会少带凭据。
 */
export function merge_cookie_header(existing: string, fresh: string): string {
    const values = new Map<string, string>();
    const order: string[] = [];
    const put = (part: string): void => {
        const eq = part.indexOf("=");
        if (eq <= 0) return;
        const name = part.slice(0, eq).trim();
        const value = part.slice(eq + 1).trim();
        if (!name || !value) return;
        if (!values.has(name)) order.push(name);
        values.set(name, value);
    };
    for (const part of existing.split(";")) put(part);
    for (const part of fresh.split(";")) put(part);
    return order.map((name) => `${name}=${values.get(name) ?? ""}`).join("; ");
}

export async function write_flowercloud_html(
    vault: VaultBackend,
    instance_id: string,
    html: string,
    cookie_override?: string | null,
    options?: { is_cancelled?: () => boolean; expected_vault_value?: string | null },
): Promise<boolean> {
    if (options?.is_cancelled?.() === true) return false;
    const key = keyFor(instance_id, SESSION_COOKIE_KEY);
    const raw = await vault.get(key);
    if (!raw) {
        log.warn(`FlowerCloud DOM refresh found no stored session for ${instance_id}`);
        return false;
    }
    let cookie = parse_flowercloud_secret(raw).cookie ?? raw;
    if (
        cookie_override &&
        is_safe_cookie_string(cookie_override) &&
        /(?:^|;\s*)WHMCS/i.test(cookie_override)
    ) {
        cookie = merge_cookie_header(cookie, cookie_override);
    }
    if (!is_safe_cookie_string(cookie)) {
        log.warn(`FlowerCloud DOM refresh refused an unsafe cookie for ${instance_id}`);
        return false;
    }
    // 落盘前最后一次校验：读数期间可能被抢占（cancelled），也可能有更新的快照或新登录
    // 凭据写进 vault——两种情况都不能用本轮旧数据覆盖。
    // A4：基线取自捕获起点（调用方经 expected_vault_value 传入），而非本函数入口——
    // poll 数十秒窗口内被外部更新的凭据不会再被旧 HTML 覆盖；未传基线时退化为入口值。
    // 校验与写入间仍非原子（本地 vault 窗口极小），调用方不得依赖强 CAS。
    if (options?.is_cancelled?.() === true) return false;
    const current = await vault.get(key);
    const baseline = options?.expected_vault_value ?? raw;
    if (current !== baseline) {
        log.warn(
            `FlowerCloud DOM refresh skipped stale write for ${instance_id}: stored session changed while capturing`,
        );
        return false;
    }
    await vault.set(key, build_flowercloud_secret(cookie, html));
    log.info(`FlowerCloud DOM snapshot updated for ${instance_id}`);
    return true;
}

export interface FlowerPollResult {
    readonly html: string | null;
    readonly kind: FlowerPageKind;
}

/**
 * 在隐藏窗里轮询页面 DOM，直到出现稳定用量或超时。
 * 不做任何前台化：需要人操作的页面只是被分类记录，作为失败原因返回。
 *
 * t537 多服务：发现服务 id 后逐服务详情页抓取；单服务/无服务列表的单页形态
 * 保持原结算语义。收尾时——单服务返回裸 HTML（退化形态），多服务返回分段
 * composite（含失败服务的 error 标注）；一个服务都没抓到则不产出快照
 * （沿用 t535「失败保留旧值」语义）。
 */
export async function poll_flower_usage_html(
    window: SessionWindow,
    login_url: string,
    options: {
        timeout_ms: number;
        poll_ms: number;
        settle_ms: number;
        is_cancelled(): boolean;
    },
): Promise<FlowerPollResult> {
    if (!window.read_html) return { html: null, kind: "empty" };
    const deadline = Date.now() + options.timeout_ms;
    let latest: string | null = null;
    let last_kind: FlowerPageKind = "empty";
    let single_usage_html: string | null = null;
    let single_first_usage_at = 0;
    // 多服务抓取状态
    const pending: string[] = [];
    const seen: string[] = [];
    const seen_set = new Set<string>();
    const captured = new Map<string, string>();
    const failed = new Map<string, string>();
    let current_id: string | null = null;
    let current_first_usage_at = 0;

    function enqueue(html: string): void {
        for (const id of flower_service_ids(html)) {
            if (!seen_set.has(id)) {
                seen_set.add(id);
                seen.push(id);
                pending.push(id);
            }
        }
    }

    function partial_result(): FlowerPollResult {
        if (current_id !== null) {
            const reason =
                last_kind === "cloudflare" || last_kind === "login" || last_kind === "blocked"
                    ? flower_failure_reason(last_kind)
                    : "本轮等待超时，该服务未取到用量";
            failed.set(current_id, reason);
        }
        for (const id of seen) {
            if (!captured.has(id) && !failed.has(id)) {
                failed.set(id, "本轮等待超时，该服务未取到用量");
            }
        }
        if (captured.size === 0) {
            // 一个服务都没抓到：不产出多服务快照，沿用单页语义（有用量页则返回，
            // 否则由调用方按 kind 走失败路径，vault 旧值保留 —— t535 失败语义）。
            return {
                html: single_usage_html,
                kind: single_usage_html !== null ? "usage" : last_kind,
            };
        }
        if (seen.length <= 1) {
            return { html: [...captured.values()][0] ?? latest, kind: "usage" };
        }
        const entries = seen.map((id) => {
            const html = captured.get(id);
            return html !== undefined
                ? { id, html }
                : { id, error: failed.get(id) ?? "本轮等待超时，该服务未取到用量" };
        });
        return { html: compose_flower_sections(entries), kind: "usage" };
    }

    while (!options.is_cancelled() && Date.now() < deadline && !window.isDestroyed()) {
        let html: string | null = null;
        try {
            html = await window.read_html();
        } catch {
            html = null;
        }
        last_kind = flower_page_kind(html);
        if (html) {
            latest = html;
            enqueue(html);
        }

        // 发现服务后逐个进详情页（t537：多服务全覆盖；单服务与原「首页→详情」导航一致）。
        if (current_id === null && pending.length > 0) {
            current_id = pending.shift() ?? null;
            if (current_id !== null) {
                current_first_usage_at = 0;
                const target_id = current_id;
                try {
                    await window.loadURL(flower_details_url(login_url, target_id));
                } catch {
                    failed.set(target_id, "服务详情页加载失败");
                    current_id = null;
                    continue;
                }
                // t537 gen_f003：导航后核对落点确实属于该服务（宿主窗口提供
                // read_page_hint 时）。A19：首次读取可能撞上页面未就绪（前端重定向
                // 中），不匹配仅记未就绪、保持 current_id 继续轮询，不立即判死；
                // 用量稳定后的二次核对（下 L419）与超时收口仍是失败 backstop。
                // 绝不把别的页面的用量错配进分段。测试窗口未实现 hint 时跳过核对。
                const hint = await read_service_hint(window);
                if (hint !== null && !hint_belongs_to_service(hint, target_id)) {
                    current_first_usage_at = 0;
                    continue;
                }
                continue;
            }
        }

        if (html && FLOWER_USAGE_RE.test(html)) {
            if (current_id !== null) {
                if (current_first_usage_at === 0) current_first_usage_at = Date.now();
                if (Date.now() - current_first_usage_at >= options.settle_ms) {
                    // t537 gen_f004：落盘前复核落点仍属于当前服务——导航后的客户端
                    // 重定向会让用量页换主，substring 前缀命中（id=8848 vs 88480）也在此被
                    // 精确 id 比对排除。
                    const capture_hint = await read_service_hint(window);
                    if (
                        capture_hint !== null &&
                        !hint_belongs_to_service(capture_hint, current_id)
                    ) {
                        failed.set(current_id, "导航未到达该服务的详情页");
                        current_id = null;
                        current_first_usage_at = 0;
                        continue;
                    }
                    captured.set(current_id, html);
                    current_id = null;
                    current_first_usage_at = 0;
                    if (pending.length === 0 && captured.size + failed.size >= seen.length) {
                        return partial_result();
                    }
                    continue;
                }
            } else if (seen.length === 0) {
                // 起始页自身含用量且无服务列表：单页形态，保持既有结算语义。
                single_usage_html = html;
                if (single_first_usage_at === 0) single_first_usage_at = Date.now();
                if (Date.now() - single_first_usage_at >= options.settle_ms) {
                    return { html, kind: "usage" };
                }
            }
            // 列表页含用量但仍有服务未抓：不在此断言，继续导航取逐服务详情。
        }

        if (
            current_id === null &&
            pending.length === 0 &&
            seen.length > 0 &&
            captured.size + failed.size >= seen.length
        ) {
            return partial_result();
        }
        await delay(options.poll_ms);
    }
    if (options.is_cancelled()) return { html: null, kind: "cancelled" };
    if (seen.length > 0 || current_id !== null) return partial_result();
    // 单页形态：与旧行为一致——结算未完成也返回最后见到的用量页。
    return {
        html: single_usage_html,
        kind: single_usage_html !== null ? "usage" : last_kind,
    };
}

export interface FlowercloudSnapshotInput {
    readonly window: SessionWindow;
    readonly session: SessionController;
    readonly vault: VaultBackend;
    readonly instance_id: string;
    readonly login_url: string;
    readonly is_cancelled: () => boolean;
    readonly options?: FlowercloudSnapshotOptions;
}

export interface FlowercloudSnapshotOutcome {
    /** 磁盘上的快照当前可用（刚写入，或仍在新鲜期内被跳过）。 */
    readonly written: boolean;
    /** 成功时为 usage；失败时为分类结果，调用方可据此给出可读原因。 */
    readonly kind: FlowerPageKind;
}

async function read_page_hint(window: SessionWindow): Promise<string> {
    try {
        const hint = await window.read_page_hint?.();
        if (!hint) return "";
        return `${hint.url} ${hint.title}`.trim();
    } catch {
        return "";
    }
}

/**
 * 落点 URL 是否属于该服务：解析查询参数做精确 `id` 比对——`includes("id=8848")`
 * 会被 `id=88480` / `redirect_id=8848` 误命中（t537 gen_f004）；解析失败按不匹配
 * 处理，宁可判该服务失败也不静默错配。
 */
function hint_belongs_to_service(url: string, service_id: string): boolean {
    try {
        return new URL(url).searchParams.get("id") === service_id;
    } catch {
        return false;
    }
}

/** 导航落点核对用 URL；窗口未实现 hint、读取失败或空串时返回 null（不拦）。 */
async function read_service_hint(window: SessionWindow): Promise<string | null> {
    try {
        const hint = await window.read_page_hint?.();
        const url = hint?.url;
        // 空串视同无提示：new URL("") 必抛，判"不匹配"不如"不拦"稳健（A11）。
        return url !== undefined && url !== "" ? url : null;
    } catch {
        return null;
    }
}

/** 开一次隐藏会话窗口抓取用量，成功才写回 vault。任何失败都不改 vault。 */
export async function run_flowercloud_snapshot(
    input: FlowercloudSnapshotInput,
): Promise<FlowercloudSnapshotOutcome> {
    const { window, session, vault, instance_id, login_url, is_cancelled } = input;
    const options = input.options ?? {};
    try {
        // A4：捕获起点读一次 vault 载荷，既作 skip 判定输入，也作写回 CAS 基线。
        const snapshot_baseline = await vault.get(keyFor(instance_id, SESSION_COOKIE_KEY));
        if (options.skip_if_fresh === true) {
            const stored = parse_flowercloud_secret(snapshot_baseline);
            if (is_flowercloud_snapshot_fresh(stored)) {
                log.info(
                    `FlowerCloud DOM refresh skipped for ${instance_id}: stored snapshot is fresh`,
                );
                return { written: true, kind: "usage" };
            }
        }

        log.info(`FlowerCloud DOM refresh start for ${instance_id}`);
        const jar = await session.get_cookies(login_url);
        await seed_partition_cookies(session, vault, instance_id, login_url, {
            skip_names: new Set(jar.map((cookie) => cookie.name)),
        });
        // t537：统一从列表页（客户区）开始——多服务必须先发现全部服务 id；
        // 单服务由列表页导航进详情页，与原「首页→详情」路径一致。
        // （原 flower_snapshot_url 直跳首个详情页会让其它服务永远无法被发现。）
        // 隐藏窗即可执行质询脚本（s040）：不调用任何前台化方法。
        await window.loadURL(login_url);
        const result = await poll_flower_usage_html(window, login_url, {
            timeout_ms: options.timeout_ms ?? FLOWER_SNAPSHOT_TIMEOUT_MS,
            poll_ms: options.poll_ms ?? FLOWER_SNAPSHOT_POLL_MS,
            settle_ms: options.settle_ms ?? FLOWER_SNAPSHOT_SETTLE_MS,
            is_cancelled,
        });

        if (!result.html || is_cancelled()) {
            if (is_cancelled()) {
                return { written: false, kind: "cancelled" };
            }
            const where = await read_page_hint(window);
            log.warn(
                `FlowerCloud DOM refresh found no usage for ${instance_id}: ${result.kind}${
                    where ? ` ${where}` : ""
                }`,
            );
            return { written: false, kind: result.kind };
        }

        // 读 cookie 与写 vault 都是异步的：这期间窗口可能被关掉或被交互登录抢占，
        // 因此取消校验要做在写入点（write_flowercloud_html 内部还有落盘前复核）。
        const fresh = flower_auth_cookie_header(await session.get_cookies(login_url));
        if (is_cancelled()) {
            log.info(`FlowerCloud DOM refresh cancelled before writing ${instance_id}`);
            return { written: false, kind: "cancelled" };
        }
        const written = await write_flowercloud_html(vault, instance_id, result.html, fresh, {
            is_cancelled,
            expected_vault_value: snapshot_baseline,
        });
        return { written, kind: "usage" };
    } catch (error: unknown) {
        log.warn(
            `FlowerCloud DOM refresh failed for ${instance_id}: ${
                error instanceof Error ? error.message : String(error)
            }`,
        );
        // 抢占/关窗会在 await 期间让 read_html / executeJavaScript 抛错，这类不是
        // 「网络失败」而是本轮被取消（AC-003 的分类要与原因一致）。
        if (is_cancelled()) return { written: false, kind: "cancelled" };
        // 其余异常（页面加载、网络、vault / session 读写）统一按抓取失败归类，
        // 文案不主张具体原因，真实错误仍在上面的 warn 里。
        return { written: false, kind: "network" };
    }
}
