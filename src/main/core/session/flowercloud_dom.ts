/**
 * 花云（FlowerCloud）网页会话 DOM 抓取。
 *
 * 花云的用量只渲染在登录后的页面里，Cloudflare 质询也不允许纯 HTTP 重放，因此：
 * - 登录流程靠轮询页面 DOM 拿到用量快照（本模块被 session-manager 复用）；
 * - 定时刷新由宿主开一次会话窗口重抓，再把 HTML 写回 vault 供 connector 解析。
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
/** 质询页持续这么久仍无用量，才把窗口亮出来让人点。自动能过的 5 秒盾不闪屏。 */
const FLOWER_REVEAL_AFTER_MS = 8_000;
const FLOWER_REVEAL_BUDGET_MS = 120_000;
/** 亮窗后继续采集的上限：用户可能要在质询/登录页上停留很久。 */
const FLOWER_HANDOVER_WAIT_MS = 30 * 60 * 1000;
export const FLOWER_USAGE_RE = /(?:流量使用|\d+(?:\.\d+)?GB\s*\/)/i;

export type FlowerPageKind =
    | "usage"
    | "overview"
    | "cloudflare"
    | "login"
    | "blocked"
    | "empty"
    | "other"
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

export function flower_product_details_id(html: string): string | null {
    const match =
        /clientarea\.php\?action=productdetails&amp;id=(\d+)/i.exec(html) ??
        /clientarea\.php\?action=productdetails&id=(\d+)/i.exec(html);
    return match?.[1] ?? null;
}

export function flower_details_url(login_url: string, service_id: string): string {
    const origin = new URL(login_url).origin;
    return `${origin}/clientarea.php?action=productdetails&id=${service_id}`;
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

export function flower_needs_user(kind: FlowerPageKind): boolean {
    return kind === "cloudflare" || kind === "login" || kind === "blocked";
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

export async function flower_snapshot_url(
    vault: VaultBackend,
    instance_id: string,
    login_url: string,
): Promise<string> {
    try {
        const stored = parse_flowercloud_secret(
            await vault.get(keyFor(instance_id, SESSION_COOKIE_KEY)),
        );
        if (!stored.html) return login_url;
        const service_id = flower_product_details_id(stored.html);
        return service_id ? flower_details_url(login_url, service_id) : login_url;
    } catch {
        return login_url;
    }
}

export async function write_flowercloud_html(
    vault: VaultBackend,
    instance_id: string,
    html: string,
    cookie_override?: string | null,
    options?: { is_cancelled?: () => boolean },
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
    // 落盘前最后一次校验：读数期间可能被用户关窗/交互登录抢占（cancelled），
    // 也可能有更新的快照或新登录凭据写进 vault——两种情况都不能用本轮旧数据覆盖。
    if (options?.is_cancelled?.() === true) return false;
    const current = await vault.get(key);
    if (current !== raw) {
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
    /** 已经为需要人交互的页面亮过窗（超时后不应再直接关窗）。 */
    readonly revealed: boolean;
}

export async function poll_flower_usage_html(
    window: SessionWindow,
    login_url: string,
    options: {
        timeout_ms: number;
        poll_ms: number;
        settle_ms: number;
        reveal_after_ms: number;
        reveal_budget_ms: number;
        handover_wait_ms: number;
        is_cancelled(): boolean;
        reveal?(): void;
        on_reveal?(kind: FlowerPageKind): void;
    },
): Promise<FlowerPollResult> {
    if (!window.read_html) return { html: null, kind: "empty", revealed: false };
    let deadline = Date.now() + options.timeout_ms;
    let navigated = false;
    let first_usage_at = 0;
    let latest: string | null = null;
    let blocked_since = 0;
    let revealed = false;
    let last_kind: FlowerPageKind = "empty";

    while (!options.is_cancelled() && Date.now() < deadline && !window.isDestroyed()) {
        let html: string | null = null;
        try {
            html = await window.read_html();
        } catch {
            html = null;
        }
        const kind = flower_page_kind(html);
        last_kind = kind;
        if (flower_needs_user(kind)) {
            if (blocked_since === 0) blocked_since = Date.now();
            if (!revealed && Date.now() - blocked_since >= options.reveal_after_ms) {
                revealed = true;
                options.reveal?.();
                // 亮窗后继续采集到 handover_wait 上限：用户过质询/重新登录期间仍然
                // 轮询，拿到用量就正常写回；窗口关闭或被抢占则走取消路径。
                const extended = Date.now() + options.reveal_budget_ms + options.handover_wait_ms;
                if (extended > deadline) deadline = extended;
                options.on_reveal?.(kind);
            }
        } else if (kind !== "empty") {
            blocked_since = 0;
        }
        if (html && !navigated && kind === "overview") {
            const service_id = flower_product_details_id(html);
            if (service_id) {
                navigated = true;
                first_usage_at = 0;
                latest = null;
                log.info(`FlowerCloud: DOM refresh navigating to productdetails id=${service_id}`);
                await window.loadURL(flower_details_url(login_url, service_id));
                await delay(options.poll_ms);
                continue;
            }
        }
        if (kind === "usage" && html) {
            latest = html;
            if (first_usage_at === 0) first_usage_at = Date.now();
            if (Date.now() - first_usage_at >= options.settle_ms) {
                return { html, kind: "usage", revealed };
            }
        }
        await delay(options.poll_ms);
    }
    if (options.is_cancelled()) return { html: null, kind: "cancelled", revealed };
    return { html: latest, kind: latest ? "usage" : last_kind, revealed };
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
    /**
     * 已到亮窗后的等待上限、页面仍需要人操作：窗口交给用户，调用方不要关窗。
     * 等待期内（默认 30 分钟）会持续轮询，完成即写回，因此这是兜底路径。
     */
    readonly handed_over: boolean;
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

/** 开一次会话窗口，等用量渲染出来后写回 vault。任何失败都不改 vault。 */
export async function run_flowercloud_snapshot(
    input: FlowercloudSnapshotInput,
): Promise<FlowercloudSnapshotOutcome> {
    const { window, session, vault, instance_id, login_url, is_cancelled } = input;
    const options = input.options ?? {};
    try {
        if (options.skip_if_fresh === true) {
            const stored = parse_flowercloud_secret(
                await vault.get(keyFor(instance_id, SESSION_COOKIE_KEY)),
            );
            if (
                stored.html &&
                stored.captured_at !== undefined &&
                Date.now() - stored.captured_at <= FLOWERCLOUD_SNAPSHOT_FRESH_MS
            ) {
                log.info(
                    `FlowerCloud DOM refresh skipped for ${instance_id}: stored snapshot is fresh`,
                );
                return { written: true, handed_over: false, kind: "usage" };
            }
        }

        log.info(`FlowerCloud DOM refresh start for ${instance_id}`);
        const jar = await session.get_cookies(login_url);
        await seed_partition_cookies(session, vault, instance_id, login_url, {
            skip_names: new Set(jar.map((cookie) => cookie.name)),
        });
        const start_url = await flower_snapshot_url(vault, instance_id, login_url);
        window.present_for_capture?.();
        await window.loadURL(start_url);
        const result = await poll_flower_usage_html(window, login_url, {
            timeout_ms: options.timeout_ms ?? FLOWER_SNAPSHOT_TIMEOUT_MS,
            poll_ms: options.poll_ms ?? FLOWER_SNAPSHOT_POLL_MS,
            settle_ms: options.settle_ms ?? FLOWER_SNAPSHOT_SETTLE_MS,
            reveal_after_ms: options.reveal_after_ms ?? FLOWER_REVEAL_AFTER_MS,
            reveal_budget_ms: options.reveal_budget_ms ?? FLOWER_REVEAL_BUDGET_MS,
            handover_wait_ms: options.handover_wait_ms ?? FLOWER_HANDOVER_WAIT_MS,
            is_cancelled,
            reveal() {
                window.reveal?.();
            },
            on_reveal(kind) {
                log.info(`FlowerCloud DOM refresh showing window for ${instance_id}: ${kind}`);
            },
        });

        if (!result.html || is_cancelled()) {
            if (is_cancelled()) {
                return { written: false, handed_over: false, kind: "cancelled" };
            }
            const where = await read_page_hint(window);
            // 等待上限已到且页面仍要人操作：窗口留给用户继续（登记随之释放），
            // 别在他输入时关掉；本轮不写 vault。
            const handed_over = result.revealed && flower_needs_user(result.kind);
            log.warn(
                `FlowerCloud DOM refresh found no usage for ${instance_id}: ${result.kind}${
                    where ? ` ${where}` : ""
                }${handed_over ? " (handover wait exhausted, window left to the user)" : ""}`,
            );
            return { written: false, handed_over, kind: result.kind };
        }

        // 读 cookie 与写 vault 都是异步的：这期间窗口可能被用户关掉或被交互登录抢占，
        // 因此取消校验要做在写入点（write_flowercloud_html 内部还有落盘前复核）。
        const fresh = flower_auth_cookie_header(await session.get_cookies(login_url));
        if (is_cancelled()) {
            log.info(`FlowerCloud DOM refresh cancelled before writing ${instance_id}`);
            return { written: false, handed_over: false, kind: "cancelled" };
        }
        const written = await write_flowercloud_html(vault, instance_id, result.html, fresh, {
            is_cancelled,
        });
        return { written, handed_over: false, kind: "usage" };
    } catch (error: unknown) {
        log.warn(
            `FlowerCloud DOM refresh failed for ${instance_id}: ${
                error instanceof Error ? error.message : String(error)
            }`,
        );
        return { written: false, handed_over: false, kind: "other" };
    }
}
