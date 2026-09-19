import { randomUUID } from "node:crypto";
import { createLogger } from "../../../shared/lib/logger";
import { keyFor } from "../config/secrets-store";
import type { VaultBackend } from "../vault/vault-backend";

const log = createLogger("session-manager");

const SESSION_COOKIE_KEY = "SESSION_COOKIE";
const ALL_COOKIES = "*";
/** Session login timeout — longer than connector timeout because user interaction is required. */
const SESSION_LOGIN_TIMEOUT_MS = 120_000;

export interface SessionCookie {
    readonly name: string;
    readonly value: string;
}

export interface SessionWindow {
    loadURL(url: string): Promise<void>;
    close(): void;
    isDestroyed(): boolean;
    on(event: "closed", listener: () => void): this;
    /**
     * t492: 读取登录窗页面的 localStorage。kimi_web 用它取 refresh token
     * （SPA 把 refresh_token 写在 localStorage，见 d060）。缺省表示宿主不支持。
     */
    read_local_storage?(key: string): Promise<string | null>;
}

export interface SessionController {
    on_before_send_headers(
        handler: (details: {
            url: string;
            requestHeaders: Record<string, string>;
            resource_type: string;
        }) => void,
    ): void;
    get_cookies(url: string): Promise<SessionCookie[]>;
}

export interface SessionManagerDeps {
    readonly vault: VaultBackend;
    /** Linux 无 DISPLAY/WAYLAND_DISPLAY 时阻止 Electron 在 app ready 前崩溃。 */
    readonly has_display?: () => boolean;
    /**
     * t337: 捕获 cookie 后的有效性探测。web_login provider 捕获点早于认证 cookie
     * 生效（on_before_send_headers），返回 false 时判定登录无效、不落库。缺省跳过。
     */
    readonly verify_cookie?: (cookie: string, login_url: string) => Promise<boolean>;
    /**
     * p240: `hidden` 用于**自动**重登——不弹屏也能让页面继续发请求（宿主需关闭
     * 后台节流），从而不再周期性闪窗；手动登录仍显示窗口。
     */
    create_window(partition: string, options?: { hidden?: boolean }): SessionWindow;
    create_session(partition: string): SessionController;
}

export interface LoginRequest {
    readonly instance_id?: string;
    readonly provider: string;
    readonly login_url: string;
    readonly cookie_names: readonly string[];
    readonly auto_close_ms?: number;
    /**
     * p239/t504: 捕获到的新凭据（Bearer 或 Cookie）与已存凭据不同且通过校验时立即关窗。
     * 供**自动**重登使用：无人值守下不能等用户关窗（超时会丢弃已捕获凭据），
     * 但也不能按固定时延关——会话已失效时页面若未自愈，过早关窗会存下旧凭据。
     * 手动登录不传此标志（t464：登录窗留给用户手动关闭或走固定 auto_close_ms）。
     */
    readonly close_when_credential_refreshed?: boolean;
    /**
     * p240: 不显示登录窗（自动重登用）。页面照常加载并发请求，捕获逻辑不变。
     */
    readonly hidden?: boolean;
    /** 覆盖默认 120s 超时（自动重登通常设为更短的 30s）。 */
    readonly timeout_ms?: number;
}

export interface LoginResult {
    readonly saved: boolean;
    readonly cookie?: string;
    /** t337: saved=false 时区分原因（验证失败 vs 未捕获到 cookie）。 */
    readonly reason?: "invalid_cookie" | "no_cookie";
}

export interface SessionManager {
    start_login(request: LoginRequest): Promise<LoginResult>;
    is_login_in_progress?(instance_id: string, options?: { only_interactive?: boolean }): boolean;
}

interface ActiveLoginSession {
    readonly hidden: boolean;
    readonly window: SessionWindow;
    cancel(error?: Error): void;
}

export function create_session_manager(
    deps: SessionManagerDeps,
    options?: { timeout_ms?: number },
): SessionManager {
    const timeout_ms = options?.timeout_ms ?? SESSION_LOGIN_TIMEOUT_MS;
    const in_progress = new Map<string, ActiveLoginSession>();

    return {
        start_login(request: LoginRequest): Promise<LoginResult> {
            const instance_id = request.instance_id;
            const login_id = instance_id ?? `anonymous:${randomUUID()}`;
            let login_origin: string;
            try {
                login_origin = new URL(request.login_url).origin;
            } catch {
                return Promise.reject(new Error("Invalid login URL"));
            }
            if (deps.has_display && !deps.has_display()) {
                return Promise.reject(
                    new Error(
                        "Interactive login requires a graphical display; set DISPLAY/WAYLAND_DISPLAY or paste the cookie manually.",
                    ),
                );
            }
            log.info(`start_login: ${login_id}`);
            const existing = in_progress.get(login_id);
            if (existing) {
                if (existing.hidden && !request.hidden) {
                    // t505: 前台可见登录具有最高优先级，抢占并终止正在运行的后台隐藏重登会话
                    log.info(
                        `Preempting background auto-login for ${login_id} with interactive login`,
                    );
                    existing.cancel(
                        new Error(`Login preempted by interactive user login for ${login_id}`),
                    );
                } else {
                    log.warn(`Concurrent login rejected for ${login_id}`);
                    return Promise.reject(
                        new Error(`Login already in progress for instance: ${login_id}`),
                    );
                }
            }

            const partition = instance_id
                ? get_session_login_partition(instance_id)
                : `session-login:${login_id}`;
            const window = deps.create_window(partition, {
                ...(request.hidden === true ? { hidden: true } : {}),
            });
            const session = deps.create_session(partition);
            const is_wildcard_login = request.cookie_names.includes(ALL_COOKIES);
            let wildcard_left_login_origin = false;
            let wildcard_returned_to_login_origin = false;
            let captured_cookie: string | null = null;
            let captured_authorization: string | null = null;
            let captured_session_id: string | null = null;
            let captured_device_id: string | null = null;
            let captured_refresh_token: string | null = null;
            let refresh_token_read: Promise<void> | null = null;
            let timeout: ReturnType<typeof setTimeout> | null = null;
            let auto_close_timer: ReturnType<typeof setTimeout> | null = null;
            let completed = false;

            return new Promise<LoginResult>((resolve, reject) => {
                function clear_timers(): void {
                    if (timeout) {
                        clearTimeout(timeout);
                        timeout = null;
                    }
                    if (auto_close_timer) {
                        clearTimeout(auto_close_timer);
                        auto_close_timer = null;
                    }
                }

                function release_lock(): void {
                    if (in_progress.get(login_id)?.window === window) {
                        in_progress.delete(login_id);
                    }
                }

                const active: ActiveLoginSession = {
                    hidden: request.hidden === true,
                    window,
                    cancel(error?: Error) {
                        finish_with_error(error ?? new Error(`Login cancelled for ${login_id}`));
                    },
                };
                in_progress.set(login_id, active);

                /**
                 * t492: kimi_web 的续期材料（refresh token）只在页面 localStorage。
                 * 窗口关掉后 `executeJavaScript` 必然失败，因此只能在页面活跃时读取；
                 * 已有值或读取在途时跳过，读到空值则允许下次请求再试。
                 */
                function capture_refresh_token(): void {
                    if (
                        !window.read_local_storage ||
                        captured_refresh_token ||
                        refresh_token_read
                    ) {
                        return;
                    }
                    refresh_token_read = (async () => {
                        try {
                            const value = await window.read_local_storage?.("refresh_token");
                            if (typeof value === "string" && value.trim()) {
                                captured_refresh_token = value.trim();
                            }
                        } catch (error) {
                            // 窗口可能在读取途中被销毁：不阻塞登录（缺 refresh token
                            // 的凭据仍可用到 Bearer 过期，由静默刷新兜底）。
                            log.warn(
                                `Kimi refresh token unavailable for ${login_id}: ${
                                    error instanceof Error ? error.message : String(error)
                                }`,
                            );
                        } finally {
                            refresh_token_read = null;
                        }
                    })();
                }

                /**
                 * p239/t504: 自动重登时，只有页面确实换到了**不同且有效**的凭据（Bearer 或 Cookie）才关窗——
                 * 说明 SPA/服务端用持久化 Cookie 自愈了，随后的保存/重试立刻可用。若新捕获凭据
                 * 与已存凭据相同（会话已彻底失效，页面在等待扫码/交互），保持窗口打开直到超时。
                 */
                let credential_compare: Promise<void> | null = null;

                function stored_secret(): Promise<string | null> {
                    if (!instance_id) return Promise.resolve(null);
                    return deps.vault.get(keyFor(instance_id, SESSION_COOKIE_KEY));
                }

                function close_when_credential_refreshed(params: {
                    authorization?: string | undefined;
                    cookie?: string | undefined;
                }): void {
                    if (credential_compare) return;
                    credential_compare = stored_secret()
                        .then(async (stored_raw) => {
                            if (completed || window.isDestroyed()) return;
                            // 无 cookie 时关窗会让保存走 no_cookie 分支，白丢一次捕获。
                            if (!captured_cookie) return;

                            let changed = false;
                            if (stored_raw === null) {
                                changed = true;
                            } else {
                                try {
                                    const parsed = JSON.parse(stored_raw) as {
                                        authorization?: unknown;
                                        cookie?: unknown;
                                    };
                                    if (
                                        params.authorization &&
                                        typeof parsed.authorization === "string"
                                    ) {
                                        changed = params.authorization !== parsed.authorization;
                                    } else if (params.cookie && typeof parsed.cookie === "string") {
                                        changed = params.cookie !== parsed.cookie;
                                    } else if (params.cookie) {
                                        changed = params.cookie !== stored_raw;
                                    }
                                } catch {
                                    if (params.cookie) {
                                        changed = params.cookie !== stored_raw;
                                    }
                                }
                            }

                            if (!changed) return;

                            // 若配有验证器（如 opencode_go 的 verify_cookie），须探测有效才关窗
                            if (
                                deps.verify_cookie &&
                                params.cookie &&
                                request.provider !== "kimi_web"
                            ) {
                                const valid = await deps.verify_cookie(
                                    params.cookie,
                                    request.login_url,
                                );
                                if (!valid) return;
                            }

                            log.info(
                                `New credential captured for ${login_id}, closing login window`,
                            );
                            window.close();
                        })
                        .catch((error: unknown) => {
                            log.warn(
                                `Stored credential unreadable for ${login_id}: ${
                                    error instanceof Error ? error.message : String(error)
                                }`,
                            );
                        })
                        .finally(() => {
                            credential_compare = null;
                        });
                }

                function finish_with_error(error: Error): void {
                    if (completed) return;
                    completed = true;
                    clear_timers();
                    captured_cookie = null;
                    release_lock();
                    // Ensure the login window is torn down on every error path, not just
                    // timeout — otherwise loadURL failure leaves a stale window on screen
                    // with the in-progress lock already released (re-trigger opens a 2nd).
                    if (!window.isDestroyed()) window.close();
                    reject(error);
                }

                async function save_cookie_on_close(): Promise<void> {
                    if (completed) return;
                    completed = true;
                    clear_timers();
                    try {
                        // 不从 cookie jar 回退：仅信任 webRequest 捕获的请求头 Cookie。
                        if (!captured_cookie) {
                            log.warn(`No matching cookies captured for ${login_id}`);
                            resolve({ saved: false, reason: "no_cookie" });
                            return;
                        }

                        // t337: 捕获后有效性探测。web_login 捕获点早于认证 cookie 生效，
                        // 匿名/旧 cookie 被判有效会存库导致 connector /auth 判定失效；
                        // 探测失败按「无效」处理不落库，返回可读提示。
                        if (deps.verify_cookie && request.provider !== "kimi_web") {
                            const valid = await deps.verify_cookie(
                                captured_cookie,
                                request.login_url,
                            );
                            if (!valid) {
                                log.warn(
                                    `Captured cookie failed validation for ${login_id}, not saving`,
                                );
                                resolve({ saved: false, reason: "invalid_cookie" });
                                return;
                            }
                        }

                        // t492: refresh token 只在页面 localStorage，而窗口 close 后
                        // executeJavaScript 已不可用——读取必须在页面仍存活时发起
                        // （见 on_before_send_headers 的 capture_refresh_token）；
                        // 这里只等待在途读取落定。
                        if (refresh_token_read) {
                            await refresh_token_read.catch(() => undefined);
                        }

                        const saved_secret =
                            request.provider === "kimi_web"
                                ? JSON.stringify({
                                      cookie: captured_cookie,
                                      authorization: captured_authorization,
                                      session_id: captured_session_id,
                                      device_id: captured_device_id,
                                      refresh_token: captured_refresh_token,
                                  })
                                : captured_cookie;
                        if (!instance_id) {
                            log.info("Anonymous session cookie captured");
                            resolve({ saved: true, cookie: saved_secret });
                            return;
                        }

                        try {
                            await deps.vault.set(
                                keyFor(instance_id, SESSION_COOKIE_KEY),
                                saved_secret,
                            );
                        } catch (save_err) {
                            // t367 AC-003: cookie 已捕获但保存失败——包装可读错误，
                            // 用户可区分「未捕获」与「保存失败」。
                            throw new Error(
                                `登录成功但保存失败，请重试：${
                                    save_err instanceof Error ? save_err.message : String(save_err)
                                }`,
                            );
                        }
                        log.info(`Session cookie saved for ${instance_id}`);
                        resolve({ saved: true });
                    } catch (error) {
                        reject(to_error(error));
                    } finally {
                        captured_cookie = null;
                        captured_authorization = null;
                        captured_session_id = null;
                        captured_device_id = null;
                        captured_refresh_token = null;
                        release_lock();
                    }
                }

                session.on_before_send_headers((details) => {
                    const request_origin = get_origin(details.url);
                    if (!request_origin) return;

                    if (is_wildcard_login && details.resource_type === "mainFrame") {
                        if (request_origin !== login_origin) {
                            wildcard_left_login_origin = true;
                        } else if (wildcard_left_login_origin) {
                            wildcard_returned_to_login_origin = true;
                        }
                    }

                    if (request_origin !== login_origin) return;
                    if (
                        !instance_id &&
                        !request.close_when_credential_refreshed &&
                        is_wildcard_login &&
                        !wildcard_returned_to_login_origin &&
                        request.provider !== "kimi_web"
                    )
                        return;

                    const cookie = extract_cookie_header(details.requestHeaders);
                    const selected_cookie = cookie
                        ? select_cookie_header_values(cookie, request.cookie_names)
                        : null;
                    if (request.provider === "kimi_web") {
                        const authorization =
                            details.requestHeaders["authorization"] ??
                            details.requestHeaders["Authorization"];
                        if (authorization) {
                            captured_authorization = authorization;
                            // 带 Bearer 的请求意味着 SPA 已把令牌写进 localStorage（它先
                            // 存后用），此时窗口仍存活，是唯一可靠的读取时机。
                            capture_refresh_token();
                            if (request.close_when_credential_refreshed) {
                                close_when_credential_refreshed({
                                    authorization,
                                    cookie: selected_cookie ?? captured_cookie ?? undefined,
                                });
                            }
                        }
                        captured_session_id =
                            details.requestHeaders["x-msh-session-id"] ?? captured_session_id;
                        captured_device_id =
                            details.requestHeaders["x-msh-device-id"] ?? captured_device_id;
                    }
                    if (selected_cookie) {
                        log.info(`Cookie captured for ${login_id}`);
                        captured_cookie = selected_cookie;
                        if (
                            request.close_when_credential_refreshed &&
                            request.provider !== "kimi_web"
                        ) {
                            close_when_credential_refreshed({ cookie: selected_cookie });
                        }
                        if (request.auto_close_ms != null) {
                            auto_close_timer ??= setTimeout(() => {
                                auto_close_timer = null;
                                if (!completed && !window.isDestroyed()) {
                                    log.info(`Auto-closing login window for ${login_id}`);
                                    window.close();
                                }
                            }, request.auto_close_ms);
                        }
                    }
                });

                window.on("closed", () => {
                    log.debug(`Login window closed for ${login_id}`);
                    void save_cookie_on_close();
                });

                timeout = setTimeout(() => {
                    log.warn(`Login timed out for ${login_id}`);
                    finish_with_error(new Error("Login timed out"));
                }, timeout_ms);

                void window.loadURL(request.login_url).catch((error: unknown) => {
                    finish_with_error(to_error(error));
                });
            });
        },
        is_login_in_progress(
            instance_id: string,
            options?: { only_interactive?: boolean },
        ): boolean {
            const active = in_progress.get(instance_id);
            if (!active) return false;
            if (options?.only_interactive) {
                return !active.hidden;
            }
            return true;
        },
    };
}

export function get_session_login_partition(instance_id: string): string {
    return `persist:session-login:${instance_id}`;
}

function get_origin(url: string): string | null {
    try {
        return new URL(url).origin;
    } catch {
        return null;
    }
}

function extract_cookie_header(headers: Record<string, string>): string | null {
    for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === "cookie") {
            return headers[key] ?? null;
        }
    }
    return null;
}

function to_error(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
}

/**
 * t337: opencode_go web_login cookie 有效性判定——对 login_url 的 /auth 请求
 * 返回 3xx 且 Location 为 workspace 路由（含 workspace id）视为有效（对齐
 * connector 的 /auth 判定：`/\/workspace\/([^/?#]+)/`）。
 */
export function is_valid_opencode_login(status: number, location: string | null): boolean {
    return status >= 300 && status < 400 && Boolean(location?.match(/\/workspace\/([^/?#]+)/));
}

function select_cookie_header_values(
    header: string,
    cookie_names: readonly string[],
): string | null {
    const all_cookies = cookie_names.includes(ALL_COOKIES);
    const allowed = new Set(cookie_names);
    const selected = header
        .split(";")
        .map((part) => part.trim())
        .filter((part) => {
            const equals_index = part.indexOf("=");
            if (equals_index <= 0) return false;
            return all_cookies || allowed.has(part.slice(0, equals_index));
        });

    return selected.length > 0 ? selected.join("; ") : null;
}
