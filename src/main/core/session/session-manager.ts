import { createLogger } from "../../../shared/lib/logger";
import { keyFor } from "../config/secrets-store";
import type { VaultBackend } from "../vault/vault-backend";

const log = createLogger("session-manager");

const SESSION_COOKIE_KEY = "SESSION_COOKIE";
const ALL_COOKIES = "*";
export const SESSION_LOGIN_PARTITION = "persist:session-login";
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
        handler: (details: { url: string; requestHeaders: Record<string, string> }) => void,
    ): void;
    get_cookies(url: string): Promise<SessionCookie[]>;
}

export interface SessionManagerDeps {
    readonly vault: VaultBackend;
    create_window(partition: string): SessionWindow;
    create_session(partition: string): SessionController;
}

export interface LoginRequest {
    readonly instance_id: string;
    readonly login_url: string;
    readonly cookie_names: readonly string[];
}

export interface LoginResult {
    readonly saved: boolean;
}

export interface SessionManager {
    start_login(request: LoginRequest): Promise<LoginResult>;
}

export function create_session_manager(
    deps: SessionManagerDeps,
    options?: { timeout_ms?: number },
): SessionManager {
    const timeout_ms = options?.timeout_ms ?? SESSION_LOGIN_TIMEOUT_MS;
    const in_progress = new Set<string>();

    return {
        start_login(request: LoginRequest): Promise<LoginResult> {
            log.info(`start_login: ${request.instance_id}`);
            if (in_progress.has(request.instance_id)) {
                log.warn(`Concurrent login rejected for ${request.instance_id}`);
                return Promise.reject(
                    new Error(`Login already in progress for instance: ${request.instance_id}`),
                );
            }
            in_progress.add(request.instance_id);

            const partition = get_session_login_partition(request.instance_id);
            const window = deps.create_window(partition);
            const session = deps.create_session(partition);
            const login_origin = new URL(request.login_url).origin;
            let captured_cookie: string | null = null;
            let timeout: ReturnType<typeof setTimeout> | null = null;
            let completed = false;

            return new Promise<LoginResult>((resolve, reject) => {
                function clear_timeout(): void {
                    if (timeout) {
                        clearTimeout(timeout);
                        timeout = null;
                    }
                }

                function release_lock(): void {
                    in_progress.delete(request.instance_id);
                }

                function finish_with_error(error: Error): void {
                    if (completed) return;
                    completed = true;
                    clear_timeout();
                    captured_cookie = null;
                    release_lock();
                    reject(error);
                }

                async function save_cookie_on_close(): Promise<void> {
                    if (completed) return;
                    completed = true;
                    clear_timeout();
                    try {
                        const cookie =
                            captured_cookie ??
                            (await select_session_cookies(
                                session,
                                login_origin,
                                request.cookie_names,
                            ));
                        if (!cookie) {
                            log.warn(`No matching cookies captured for ${request.instance_id}`);
                            resolve({ saved: false });
                            return;
                        }

                        await deps.vault.set(
                            keyFor(request.instance_id, SESSION_COOKIE_KEY),
                            cookie,
                        );
                        log.info(`Session cookie saved for ${request.instance_id}`);
                        resolve({ saved: true });
                    } catch (error) {
                        reject(to_error(error));
                    } finally {
                        captured_cookie = null;
                        release_lock();
                    }
                }

                session.on_before_send_headers((details) => {
                    if (!should_capture_cookie(details.url, login_origin)) return;
                    const cookie = extract_cookie_header(details.requestHeaders);
                    const selected_cookie = cookie
                        ? select_cookie_header_values(cookie, request.cookie_names)
                        : null;
                    if (selected_cookie) {
                        log.info(`Cookie captured for ${request.instance_id}`);
                        captured_cookie = selected_cookie;
                    }
                });

                window.on("closed", () => {
                    log.debug(`Login window closed for ${request.instance_id}`);
                    void save_cookie_on_close();
                });

                timeout = setTimeout(() => {
                    log.warn(`Login timed out for ${request.instance_id}`);
                    finish_with_error(new Error("Login timed out"));
                    if (!window.isDestroyed()) window.close();
                }, timeout_ms);

                void window.loadURL(request.login_url).catch((error: unknown) => {
                    finish_with_error(to_error(error));
                });
            });
        },
    };
}

export function get_session_login_partition(instance_id: string): string {
    return `${SESSION_LOGIN_PARTITION}:${instance_id}`;
}

function should_capture_cookie(url: string, login_origin: string): boolean {
    try {
        const parsed_url = new URL(url);
        if (parsed_url.origin !== login_origin) return false;
        return parsed_url.pathname.includes("/api/v1/") || parsed_url.pathname === "/_server";
    } catch {
        return false;
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

async function select_session_cookies(
    session: SessionController,
    url: string,
    cookie_names: readonly string[],
): Promise<string | null> {
    const cookies = await session.get_cookies(url);
    const selected = cookie_names.includes(ALL_COOKIES)
        ? cookies
        : cookie_names
              .map((name) => cookies.find((cookie) => cookie.name === name))
              .filter((cookie): cookie is SessionCookie => cookie !== undefined);
    const values = selected.map((cookie) => `${cookie.name}=${cookie.value}`);

    return values.length > 0 ? values.join("; ") : null;
}
