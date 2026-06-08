import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type CookieChangedHandler = (
    _e: unknown,
    cookie: unknown,
    _cause: string,
    removed: boolean,
) => void;

const mock_changed_handlers: CookieChangedHandler[] = [];
const mock_window_events: Record<string, (() => void) | undefined> = {};
let mock_cookie_get_result: { name: string; value: string }[] = [];

vi.mock("electron", () => ({
    BrowserWindow: vi.fn().mockImplementation(() => ({
        on: (event: string, handler: () => void) => {
            mock_window_events[event] = handler;
        },
        close: vi.fn(() => {
            const h = mock_window_events["closed"];
            if (h) h();
        }),
        isDestroyed: () => false,
        loadURL: vi.fn(),
        setTitle: vi.fn(),
    })),
    session: {
        fromPartition: vi.fn(() => ({
            cookies: {
                on: vi.fn((_event: string, handler: CookieChangedHandler) => {
                    mock_changed_handlers.push(handler);
                }),
                removeListener: vi.fn(),
                get: vi.fn(() => Promise.resolve(mock_cookie_get_result)),
            },
        })),
    },
    ipcMain: {
        handle: vi.fn(),
    },
}));

describe("handleCookieLogin", () => {
    let secrets_store: Record<string, string>;

    beforeEach(() => {
        secrets_store = {};
        mock_changed_handlers.length = 0;
        mock_cookie_get_result = [];
        Object.keys(mock_window_events).forEach((k) => {
            mock_window_events[k] = undefined;
        });
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    function build_deps(instance_id: string) {
        return {
            configStore: {
                load: vi.fn().mockResolvedValue({
                    schemaVersion: 1,
                    language: "zh-Hans",
                    plugins: [
                        {
                            instanceId: instance_id,
                            stateId: instance_id,
                            name: "MiMo",
                            enabled: true,
                            executablePath: "plugins/mimo-usage-plugin.ts",
                            refreshIntervalSeconds: 300,
                            parameterValues: {},
                            endpointOverrides: {},
                        },
                    ],
                    launchAtLogin: false,
                }),
                save: vi.fn(),
                scheduleSave: vi.fn(),
                flushPendingSave: vi.fn(),
                hasPendingSave: vi.fn().mockReturnValue(false),
            },
            secretsStore: {
                set: vi.fn((_key: string, value: string) => {
                    secrets_store[_key] = value;
                    return Promise.resolve();
                }),
                get: vi.fn((key: string) => Promise.resolve(secrets_store[key] ?? null)),
                delete: vi.fn(),
                exportAll: vi.fn(),
                importAll: vi.fn(),
            },
            definitions: [
                {
                    scriptName: "mimo-usage-plugin",
                    executablePath: "plugins/mimo-usage-plugin.ts",
                    source: "bundled" as const,
                    metadata: {
                        schemaVersion: 1,
                        name: "MiMo",
                        supportedProviders: ["mimo"],
                        defaultSource: "direct" as const,
                        endpoints: {
                            default: "https://platform.xiaomimimo.com",
                            login: "https://platform.xiaomimimo.com/console/plan-manage",
                        },
                    },
                },
            ],
            cookieRefreshService: {
                refreshAll: vi.fn(),
                inProgress: new Set() as ReadonlySet<string>,
            },
        };
    }

    it("returns saved:true with final cookie value after 5s stabilization delay", async () => {
        // Set up the mock to return the final cookie value after delay
        mock_cookie_get_result = [{ name: "api-platform_serviceToken", value: "final_token" }];

        const mod = await import("../../../src/main/ipc/auth-ipc");
        const promise = mod.handleCookieLogin(build_deps("mimo-test-1") as never, "mimo-test-1");

        // Wait for handler registration
        await vi.waitFor(() => {
            expect(mock_changed_handlers.length).toBe(1);
        });
        const handler = mock_changed_handlers[0];
        if (!handler) throw new Error("handler not registered");

        // Fire cookie change — this starts the 5s timer
        handler(
            null,
            { name: "api-platform_serviceToken", value: "temp_token" },
            "explicit",
            false,
        );

        // Advance 5s to let the capture timer fire
        await vi.advanceTimersByTimeAsync(5000);

        const result = await promise;
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.data.saved).toBe(true);
        }
        // Should use the final value from cookies.get(), not the event value
        expect(secrets_store["mimo-test-1:SESSION_COOKIE"]).toBe(
            "api-platform_serviceToken=final_token",
        );
    });

    it("returns saved:false when login window is closed without logging in", async () => {
        const mod = await import("../../../src/main/ipc/auth-ipc");
        const promise = mod.handleCookieLogin(build_deps("mimo-test-1") as never, "mimo-test-1");

        await vi.waitFor(() => {
            if (!mock_window_events["closed"]) throw new Error("not ready");
        });

        const closed = mock_window_events["closed"];
        if (closed) closed();
        // Flush any pending microtasks after window close
        await Promise.resolve();

        const result = await promise;
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.data.saved).toBe(false);
        }
    });
});
