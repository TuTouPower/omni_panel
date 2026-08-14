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
    create_window(partition: string): SessionWindow;
    create_session(partition: string): SessionController;
}

export interface LoginRequest {
    readonly instance_id?: string;
    readonly provider: string;
    readonly login_url: string;
    readonly cookie_names: readonly string[];
    readonly auto_close_ms?: number;
}

export interface LoginResult {
    readonly saved: boolean;
    readonly cookie?: string;
    /** t337: saved=false 时区分原因（验证失败 vs 未捕获到 cookie）。 */
    readonly reason?: "invalid_cookie" | "no_cookie";
}

export interface SessionManager {
    start_login(request: LoginRequest): Promise<LoginResult>;
    is_login_in_progress?(instance_id: string): boolean;
}

export function create_session_manager(
    deps: SessionManagerDeps,
    options?: { timeout_ms?: number },
): SessionManager {
    const timeout_ms = options?.timeout_ms ?? SESSION_LOGIN_TIMEOUT_MS;
    const in_progress = new Set<string>();

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
            if (in_progress.has(login_id)) {
                log.warn(`Concurrent login rejected for ${login_id}`);
                return Promise.reject(
                    new Error(`Login already in progress for instance: ${login_id}`),
                );
            }
            in_progress.add(login_id);

            const partition = instance_id
                ? get_session_login_partition(instance_id)
                : `session-login:${login_id}`;
            const window = deps.create_window(partition);
            const session = deps.create_session(partition);
            const is_wildcard_login = request.cookie_names.includes(ALL_COOKIES);
            let wildcard_left_login_origin = false;
            let wildcard_returned_to_login_origin = false;
            let captured_cookie: string | null = null;
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
                    in_progress.delete(login_id);
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
                        if (deps.verify_cookie) {
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

                        if (!instance_id) {
                            log.info("Anonymous session cookie captured");
                            resolve({ saved: true, cookie: captured_cookie });
                            return;
                        }

                        try {
                            await deps.vault.set(
                                keyFor(instance_id, SESSION_COOKIE_KEY),
                                captured_cookie,
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
                    if (is_wildcard_login && !wildcard_returned_to_login_origin) return;

                    const cookie = extract_cookie_header(details.requestHeaders);
                    const selected_cookie = cookie
                        ? select_cookie_header_values(cookie, request.cookie_names)
                        : null;
                    if (selected_cookie) {
                        log.info(`Cookie captured for ${login_id}`);
                        captured_cookie = selected_cookie;
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
        is_login_in_progress(instance_id: string): boolean {
            return in_progress.has(instance_id);
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
