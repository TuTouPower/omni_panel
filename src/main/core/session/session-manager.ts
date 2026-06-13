import type { VaultBackend } from "../vault/vault-backend";

const SESSION_COOKIE_KEY = "SESSION_COOKIE";
const DEFAULT_TIMEOUT_MS = 120_000;

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
    get_cookies(): Promise<SessionCookie[]>;
}

export interface SessionManagerDeps {
    readonly vault: VaultBackend;
    create_window(): SessionWindow;
    create_session(): SessionController;
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
    const timeout_ms = options?.timeout_ms ?? DEFAULT_TIMEOUT_MS;

    return {
        start_login(request: LoginRequest): Promise<LoginResult> {
            const window = deps.create_window();
            const session = deps.create_session();
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

                function finish_with_error(error: Error): void {
                    if (completed) return;
                    completed = true;
                    clear_timeout();
                    reject(error);
                }

                async function save_cookie_on_close(): Promise<void> {
                    if (completed) return;
                    completed = true;
                    clear_timeout();
                    const cookie =
                        captured_cookie ??
                        (await select_session_cookies(session, request.cookie_names));
                    if (!cookie) {
                        resolve({ saved: false });
                        return;
                    }

                    await deps.vault.set(`${request.instance_id}:${SESSION_COOKIE_KEY}`, cookie);
                    resolve({ saved: true });
                }

                session.on_before_send_headers((details) => {
                    if (!details.url.includes("/api/v1/")) return;
                    captured_cookie =
                        details.requestHeaders["Cookie"] ??
                        details.requestHeaders["cookie"] ??
                        null;
                });

                window.on("closed", () => {
                    void save_cookie_on_close().catch((error: unknown) => {
                        finish_with_error(to_error(error));
                    });
                });

                timeout = setTimeout(() => {
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

function to_error(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
}

async function select_session_cookies(
    session: SessionController,
    cookie_names: readonly string[],
): Promise<string | null> {
    const cookies = await session.get_cookies();
    const selected = cookie_names
        .map((name) => cookies.find((cookie) => cookie.name === name))
        .filter((cookie): cookie is SessionCookie => cookie !== undefined)
        .map((cookie) => `${cookie.name}=${cookie.value}`);

    return selected.length > 0 ? selected.join("; ") : null;
}
