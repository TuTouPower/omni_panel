// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { create_web_usageboard } from "../../../src/web/usageboard-web";

/** 桥测试用假 EventSource：捕获连接与监听器，供订阅/推送/注销断言。 */
class FakeEventSource {
    static instances: FakeEventSource[] = [];
    readonly url: string;
    readonly listeners = new Map<string, ((ev: MessageEvent) => void)[]>();
    closed = false;
    constructor(url: string) {
        this.url = url;
        FakeEventSource.instances.push(this);
    }
    addEventListener(type: string, cb: (ev: MessageEvent) => void): void {
        const list = this.listeners.get(type) ?? [];
        list.push(cb);
        this.listeners.set(type, list);
    }
    close(): void {
        this.closed = true;
    }
}

function mock_response(body: unknown): Response {
    return { ok: true, json: () => Promise.resolve(body) } as Response;
}

function mock_error_response(body: unknown, status = 400): Response {
    return { ok: false, status, json: () => Promise.resolve(body) } as Response;
}

/** jsdom 无 matchMedia 实现；桩成固定返回值供 system 模式解析。 */
function stub_match_media(dark: boolean): void {
    vi.stubGlobal(
        "matchMedia",
        vi.fn(() => ({ matches: dark }) as unknown as MediaQueryList),
    );
}

describe("web usageboard bridge", () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
        // 重置 URL，避免 history.replaceState 写入的 loc 参数跨测试污染。
        window.history.replaceState(null, "", "/");
        // 重置 DOM 主题状态，避免 theme.set 用例互相污染。
        document.documentElement.removeAttribute("data-theme");
        document.documentElement.style.removeProperty("--accent");
    });

    it("tokenStats.getRecords fetches /v1/records", async () => {
        const fetch_mock = vi.fn<typeof fetch>().mockResolvedValue(mock_response([]));
        vi.stubGlobal("fetch", fetch_mock);

        const api = create_web_usageboard();
        const records = await api.tokenStats.getRecords({});
        expect(records).toEqual([]);
        expect(fetch_mock).toHaveBeenCalledWith(expect.stringContaining("/v1/records"));
    });

    it("tokenStats.getHeatmap forwards window/env/agent filters as query params", async () => {
        const fetch_mock = vi.fn<typeof fetch>().mockResolvedValue(mock_response([]));
        vi.stubGlobal("fetch", fetch_mock);

        const api = create_web_usageboard();
        const cells = await api.tokenStats.getHeatmap({
            agent: "claude-code",
            env: "local",
            start: 100,
            end: 200,
        });
        expect(cells).toEqual([]);
        const url = fetch_mock.mock.calls[0]?.[0] as string;
        expect(url).toContain("/v1/heatmap");
        expect(url).toContain("agent=claude-code");
        expect(url).toContain("env=local");
        expect(url).toContain("start=100");
        expect(url).toContain("end=200");
    });

    it("tokenStats.getHeatmap omits query string when no filters", async () => {
        const fetch_mock = vi.fn<typeof fetch>().mockResolvedValue(mock_response([]));
        vi.stubGlobal("fetch", fetch_mock);

        const api = create_web_usageboard();
        await api.tokenStats.getHeatmap({});
        expect(fetch_mock).toHaveBeenCalledWith(expect.stringContaining("/v1/heatmap"));
    });

    it("tokenStats.getHourBuckets forwards filters to /v1/hourBuckets (t173)", async () => {
        const fetch_mock = vi.fn<typeof fetch>().mockResolvedValue(mock_response([]));
        vi.stubGlobal("fetch", fetch_mock);

        const api = create_web_usageboard();
        const buckets = await api.tokenStats.getHourBuckets({
            agent: "claude-code",
            env: "local",
            start: 100,
            end: 200,
        });
        expect(buckets).toEqual([]);
        const url = fetch_mock.mock.calls[0]?.[0] as string;
        expect(url).toContain("/v1/hourBuckets");
        expect(url).toContain("agent=claude-code");
        expect(url).toContain("env=local");
        expect(url).toContain("start=100");
        expect(url).toContain("end=200");
    });

    it("tokenStats.getDashboard forwards the model filter to /v1/dashboard (t204)", async () => {
        const fetch_mock = vi.fn<typeof fetch>().mockResolvedValue(mock_response({ ok: true }));
        vi.stubGlobal("fetch", fetch_mock);

        const api = create_web_usageboard();
        await api.tokenStats.getDashboard({
            agent: "all",
            platform: "all",
            start: 100,
            end: 200,
            metric: "tokens",
            xaxis: "time",
            gran: "hour",
            model: "sonnet",
        });
        const url = fetch_mock.mock.calls[0]?.[0] as string;
        expect(url).toContain("/v1/dashboard");
        expect(url).toContain("model=sonnet");
    });

    it("tokenStats.getDashboardSessions forwards the model filter to /v1/dashboard/sessions (t204)", async () => {
        const fetch_mock = vi.fn<typeof fetch>().mockResolvedValue(mock_response({ ok: true }));
        vi.stubGlobal("fetch", fetch_mock);

        const api = create_web_usageboard();
        await api.tokenStats.getDashboardSessions({
            agent: "all",
            platform: "all",
            start: 100,
            end: 200,
            model: "sonnet",
        });
        const url = fetch_mock.mock.calls[0]?.[0] as string;
        expect(url).toContain("/v1/dashboard/sessions");
        expect(url).toContain("model=sonnet");
    });

    it("tokenStats.getHeatmap/getHourBuckets/getRangeRollup forward a model filter (t204)", async () => {
        const fetch_mock = vi.fn<typeof fetch>().mockResolvedValue(mock_response([]));
        vi.stubGlobal("fetch", fetch_mock);

        const api = create_web_usageboard();
        await api.tokenStats.getHeatmap({ start: 100, end: 200, model: "opus" });
        await api.tokenStats.getHourBuckets({ start: 100, end: 200, model: "opus" });
        await api.tokenStats.getRangeRollup({ start: 100, end: 200, model: "opus" });
        const urls = fetch_mock.mock.calls.map((call) => call[0] as string);
        expect(urls[0]).toContain("/v1/heatmap?model=opus");
        expect(urls[1]).toContain("/v1/hourBuckets?model=opus");
        expect(urls[2]).toContain("/v1/rollup?model=opus");
    });

    it("config.get fetches /v1/config", async () => {
        const fetch_mock = vi
            .fn<typeof fetch>()
            .mockResolvedValue(mock_response({ config: { language: "zh-Hans" }, hasSecrets: {} }));
        vi.stubGlobal("fetch", fetch_mock);

        const api = create_web_usageboard();
        const result = await api.config.get();
        expect(result.config.language).toBe("zh-Hans");
        expect(fetch_mock).toHaveBeenCalledWith(expect.stringContaining("/v1/config"));
    });

    it("config.save posts to /v1/config", async () => {
        const fetch_mock = vi.fn<typeof fetch>().mockResolvedValue(mock_response(undefined));
        vi.stubGlobal("fetch", fetch_mock);

        const api = create_web_usageboard();
        await api.config.save({ language: "en" } as never);
        expect(fetch_mock).toHaveBeenCalledWith(
            expect.stringContaining("/v1/config"),
            expect.objectContaining({ method: "POST" }),
        );
    });

    it("get/post errors include the local-api response message", async () => {
        const fetch_mock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(mock_error_response({ message: "配置读取失败" }, 500))
            .mockResolvedValueOnce(mock_error_response({ error: "配置保存失败" }, 400))
            .mockResolvedValueOnce(
                mock_error_response(
                    { error: { code: "VALIDATION_ERROR", message: "导入的配置格式无效" } },
                    400,
                ),
            );
        vi.stubGlobal("fetch", fetch_mock);

        const api = create_web_usageboard();
        await expect(api.config.get()).rejects.toThrow("GET /v1/config failed: 配置读取失败");
        await expect(api.config.save({ schemaVersion: 1 } as never)).rejects.toThrow(
            "POST /v1/config failed: 配置保存失败",
        );
        await expect(api.config.save({ schemaVersion: 1 } as never)).rejects.toThrow(
            "POST /v1/config failed: 导入的配置格式无效",
        );
    });

    it("session.login POSTs the session request to local-api", async () => {
        const fetch_mock = vi
            .fn<typeof fetch>()
            .mockResolvedValue(mock_response({ saved: true, cookie: "captured-cookie" }));
        vi.stubGlobal("fetch", fetch_mock);

        const api = create_web_usageboard();
        const request = {
            provider: "mimo",
            login_url: "https://platform.xiaomimimo.com/console/plan-manage",
            cookie_names: ["api-platform_serviceToken"],
        } as const;
        await expect(api.session.login(request)).resolves.toEqual({
            saved: true,
            cookie: "captured-cookie",
        });
        expect(fetch_mock).toHaveBeenCalledWith(
            "/v1/session/login",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify(request),
            }),
        );
    });

    it("session.refresh POSTs the session request to local-api", async () => {
        const fetch_mock = vi.fn<typeof fetch>().mockResolvedValue(mock_response({ saved: true }));
        vi.stubGlobal("fetch", fetch_mock);

        const api = create_web_usageboard();
        const request = {
            instance_id: "mimo-1",
            provider: "mimo",
            login_url: "https://platform.xiaomimimo.com/console/plan-manage",
            cookie_names: ["api-platform_serviceToken"],
        } as const;
        await expect(api.session.refresh(request)).resolves.toEqual({ saved: true });
        expect(fetch_mock).toHaveBeenCalledWith(
            "/v1/session/refresh",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify(request),
            }),
        );
    });

    it("auth.cookieLogin POSTs the instance id to local-api", async () => {
        const fetch_mock = vi
            .fn<typeof fetch>()
            .mockResolvedValue(mock_response({ started: true }));
        vi.stubGlobal("fetch", fetch_mock);

        const api = create_web_usageboard();
        await expect(api.auth.cookieLogin("mimo-1")).resolves.toEqual({ started: true });
        expect(fetch_mock).toHaveBeenCalledWith(
            "/v1/auth/cookieLogin",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ instanceId: "mimo-1" }),
            }),
        );
    });

    it("auth.cookieLoginStatus GETs the local-api status endpoint", async () => {
        const fetch_mock = vi
            .fn<typeof fetch>()
            .mockResolvedValue(mock_response({ in_progress: false, saved: true }));
        vi.stubGlobal("fetch", fetch_mock);

        const api = create_web_usageboard();
        await expect(api.auth.cookieLoginStatus("mimo/1")).resolves.toEqual({
            in_progress: false,
            saved: true,
        });
        expect(fetch_mock).toHaveBeenCalledWith("/v1/auth/cookieLogin/status?instanceId=mimo%2F1");
    });

    it("connector.catalog fetches /v1/catalog", async () => {
        const fetch_mock = vi.fn<typeof fetch>().mockResolvedValue(mock_response([]));
        vi.stubGlobal("fetch", fetch_mock);

        const api = create_web_usageboard();
        const result = await api.connector.catalog();
        expect(result).toEqual([]);
        expect(fetch_mock).toHaveBeenCalledWith(expect.stringContaining("/v1/catalog"));
    });

    it("config.duplicate posts instance id and returns the created instance", async () => {
        const fetch_mock = vi
            .fn<typeof fetch>()
            .mockResolvedValue(mock_response({ instanceId: "duplicate-1" }));
        vi.stubGlobal("fetch", fetch_mock);

        const api = create_web_usageboard();
        const result = await api.config.duplicate("source-1");

        expect(result).toEqual({ instanceId: "duplicate-1" });
        expect(fetch_mock).toHaveBeenCalledWith(
            "/v1/config/duplicate",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ instanceId: "source-1" }),
            }),
        );
    });

    it("config.createInstance calls the local-api endpoint for a manifest", async () => {
        const fetch_mock = vi
            .fn<typeof fetch>()
            .mockResolvedValue(mock_response({ instanceId: "created-1" }));
        vi.stubGlobal("fetch", fetch_mock);

        const api = create_web_usageboard();
        const result = await api.config.createInstance("claude");

        expect(result).toEqual({ instanceId: "created-1" });
        expect(fetch_mock).toHaveBeenCalledWith(
            "/v1/config/createInstance",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ manifestId: "claude" }),
            }),
        );
    });

    it("config.import reports malformed JSON files before posting", async () => {
        const input = document.createElementNS(
            "http://www.w3.org/1999/xhtml",
            "input",
        ) as HTMLInputElement;
        const file = new File(["{"], "malformed.json", { type: "application/json" });
        Object.defineProperty(input, "files", {
            configurable: true,
            value: [file],
        });
        const click = vi.spyOn(input, "click").mockImplementation(() => {
            input.onchange?.(new Event("change"));
        });
        const original_create_element = Reflect.get(Document.prototype, "createElement") as (
            tag_name: string,
            options?: ElementCreationOptions,
        ) => HTMLElement;
        const create_element = vi.spyOn(document, "createElement");
        create_element.mockImplementation(((tag_name: string, options?: ElementCreationOptions) => {
            if (tag_name === "input") return input;
            return original_create_element.call(document, tag_name, options);
        }) as never);

        const api = create_web_usageboard();
        await expect(api.config.import()).rejects.toThrow("导入文件 JSON 无效");

        click.mockRestore();
        create_element.mockRestore();
    });

    it("config.import resolves a cancelled file picker without posting", async () => {
        const input = document.createElementNS(
            "http://www.w3.org/1999/xhtml",
            "input",
        ) as HTMLInputElement;
        const click = vi.spyOn(input, "click").mockImplementation(() => {
            input.oncancel?.(new Event("cancel"));
        });
        const original_create_element = Reflect.get(Document.prototype, "createElement") as (
            tag_name: string,
            options?: ElementCreationOptions,
        ) => HTMLElement;
        const create_element = vi.spyOn(document, "createElement");
        create_element.mockImplementation(((tag_name: string, options?: ElementCreationOptions) => {
            if (tag_name === "input") return input;
            return original_create_element.call(document, tag_name, options);
        }) as never);
        const fetch_mock = vi.fn<typeof fetch>();
        vi.stubGlobal("fetch", fetch_mock);

        const api = create_web_usageboard();
        await expect(api.config.import()).resolves.toEqual({ imported: false });
        expect(click).toHaveBeenCalledTimes(1);
        expect(fetch_mock).not.toHaveBeenCalled();

        click.mockRestore();
        create_element.mockRestore();
    });
    it("config.export downloads both redacted and plaintext native config bodies", async () => {
        const redacted = { schemaVersion: 1, plugins: [{ parameterValues: {} }] };
        const plaintext = {
            schemaVersion: 1,
            plugins: [{ parameterValues: { API_KEY: "sk-test" } }],
        };
        const fetch_mock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(mock_response(redacted))
            .mockResolvedValueOnce(mock_response(plaintext));
        vi.stubGlobal("fetch", fetch_mock);
        const downloaded: Blob[] = [];
        const create_url = vi.fn((blob: Blob) => {
            downloaded.push(blob);
            return `blob:${String(downloaded.length)}`;
        });
        const revoke_url = vi.fn();
        Object.defineProperty(URL, "createObjectURL", { configurable: true, value: create_url });
        Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revoke_url });

        const api = create_web_usageboard();
        await api.config.export();
        await api.config.export({ includeSecrets: true });

        expect(fetch_mock).toHaveBeenNthCalledWith(1, "/v1/config/export?includeSecrets=false", {
            method: "GET",
        });
        expect(fetch_mock).toHaveBeenNthCalledWith(2, "/v1/config/export?includeSecrets=true", {
            method: "GET",
        });
        expect(downloaded).toHaveLength(2);
        expect(await downloaded[0]?.text()).toContain('"plugins"');
        expect(await downloaded[0]?.text()).not.toContain("sk-test");
        expect(await downloaded[1]?.text()).toContain("sk-test");
        expect(create_url).toHaveBeenCalledTimes(2);
        expect(revoke_url).toHaveBeenNthCalledWith(1, "blob:1");
        expect(revoke_url).toHaveBeenNthCalledWith(2, "blob:2");
    });

    it("settings.openConnectorsDir is a no-op", () => {
        const api = create_web_usageboard();
        expect(() => {
            api.settings.openConnectorsDir();
        }).not.toThrow();
    });

    it("grok and kimi OAuth surfaces call the local-api endpoints", async () => {
        const fetch_mock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(
                mock_response({
                    device_code: "kimi-device",
                    user_code: "KIMI-CODE",
                    verification_uri: "https://auth.kimi.com/device",
                    verification_uri_complete: null,
                    expires_in: 600,
                    interval: 5,
                }),
            )
            .mockResolvedValueOnce(mock_response({ saved: true, token: "kimi-token" }))
            .mockResolvedValueOnce(mock_response(undefined))
            .mockResolvedValueOnce(
                mock_response({ has_token: true, expires_at: null, can_refresh: true }),
            )
            .mockResolvedValueOnce(mock_response({ logged_out: true }))
            .mockResolvedValueOnce(mock_response({ success: true }));
        vi.stubGlobal("fetch", fetch_mock);

        const api = create_web_usageboard();
        if (!("login_start" in api.kimi)) throw new Error("Kimi settings API unavailable");
        const start = await api.kimi.login_start();
        expect(start.user_code).toBe("KIMI-CODE");
        await expect(
            api.kimi.login_poll("kimi-1", "kimi-device", 5, Date.now() + 600_000),
        ).resolves.toEqual({ saved: true, token: "kimi-token" });
        await expect(api.kimi.login_cancel("kimi-1")).resolves.toBeUndefined();
        await expect(api.kimi.login_status("kimi-1")).resolves.toEqual({
            has_token: true,
            expires_at: null,
            can_refresh: true,
        });
        await expect(api.kimi.logout("kimi-1")).resolves.toEqual({ logged_out: true });
        await expect(api.kimi.refresh("kimi-1")).resolves.toEqual({ success: true });

        const urls = fetch_mock.mock.calls.map((call) => call[0] as string);
        expect(urls[0]).toBe("/v1/auth/kimi/loginStart");
        expect(urls[1]).toBe("/v1/auth/kimi/loginPoll");
        expect(urls[2]).toBe("/v1/auth/kimi/loginCancel");
        expect(urls[3]).toBe("/v1/auth/kimi/loginStatus?instanceId=kimi-1");
        expect(urls[4]).toBe("/v1/auth/kimi/logout");
        expect(urls[5]).toBe("/v1/auth/kimi/refresh");
    });

    it("buildInfo.get returns web stub", async () => {
        const api = create_web_usageboard();
        const info = await api.buildInfo.get();
        expect(info).toEqual({
            version: "web",
            branch: "web",
            commit: "web",
            subject: "web",
        });
    });

    it("native surfaces are no-ops", () => {
        const api = create_web_usageboard();
        expect(() => {
            api.window.close();
        }).not.toThrow();
        expect(() => {
            api.tray.open_panel();
        }).not.toThrow();
        expect(() => {
            api.theme.set("dark");
        }).not.toThrow();
    });

    it("onStateChange relays /v1/events SSE messages", () => {
        const message_handlers: ((ev: { data: string }) => void)[] = [];
        class FakeEventSource {
            constructor(public url: string) {}
            addEventListener(_type: string, handler: (ev: { data: string }) => void): void {
                message_handlers.push(handler);
            }
        }
        vi.stubGlobal("EventSource", FakeEventSource);

        const api = create_web_usageboard();
        const received: [string, unknown][] = [];
        api.event.onStateChange((instanceId, state) => received.push([instanceId, state]));
        expect(message_handlers).toHaveLength(1);
        const handler = message_handlers[0];
        if (!handler) throw new Error("no message handler");
        handler({ data: JSON.stringify({ instanceId: "inst-1", state: { status: "idle" } }) });
        expect(received).toEqual([["inst-1", { status: "idle" }]]);
    });

    it("onConfigChange/onThemeChange relay named SSE events", () => {
        const handlers = new Map<string, (ev: { data: string }) => void>();
        class FakeEventSource {
            constructor(public url: string) {}
            addEventListener(type: string, handler: (ev: { data: string }) => void): void {
                handlers.set(type, handler);
            }
        }
        vi.stubGlobal("EventSource", FakeEventSource);

        const api = create_web_usageboard();
        const configs: unknown[] = [];
        const themes: boolean[] = [];
        api.event.onConfigChange?.((config) => configs.push(config));
        api.event.onThemeChange((isDark) => themes.push(isDark));

        handlers.get("config")?.({ data: JSON.stringify({ schemaVersion: 1 }) });
        handlers.get("theme")?.({ data: JSON.stringify(true) });
        expect(configs).toEqual([{ schemaVersion: 1 }]);
        expect(themes).toEqual([true]);
    });

    it("trend.get forwards sourceInstanceId as query param (t214)", async () => {
        const fetch_mock = vi.fn<typeof fetch>().mockResolvedValue(mock_response([]));
        vi.stubGlobal("fetch", fetch_mock);

        const api = create_web_usageboard();
        await api.trend.get("claude", "acc-a", "claude:acc-a:5h", "inst-a", 7);
        const url = fetch_mock.mock.calls[0]?.[0] as string;
        expect(url).toContain("/v1/trend");
        expect(url).toContain("sourceInstanceId=inst-a");
        expect(url).toContain("days=7");
    });

    it("trend.getBulk forwards source_instance_id per-period (t214)", async () => {
        const fetch_mock = vi.fn<typeof fetch>().mockResolvedValue(mock_response([]));
        vi.stubGlobal("fetch", fetch_mock);

        const api = create_web_usageboard();
        await api.trend.getBulk({
            provider: "claude",
            account_id: "acc-a",
            source_instance_id: "inst-a",
            periods: [{ metric_id: "claude:acc-a:5h" }],
        });
        const url = fetch_mock.mock.calls[0]?.[0] as string;
        expect(url).toContain("/v1/trend");
        expect(url).toContain("sourceInstanceId=inst-a");
    });

    it("sessionHistory.open switches to the session hash route (t259 AC2)", async () => {
        const api = create_web_usageboard();
        await api.sessionHistory.open("claude_code", "win", "sess-1");
        expect(window.location.hash).toBe("#session");
    });

    it("sessionHistory.open 把 loc 编码进 URL search 供会话面板初始定位 (t263)", async () => {
        const api = create_web_usageboard();
        await api.sessionHistory.open("claude_code", "win", "sess-1");
        const loc = new URLSearchParams(window.location.search).get("loc");
        expect(loc).toBe(
            JSON.stringify({ source: "claude_code", env: "win", session_id: "sess-1" }),
        );
    });

    it("sessionHistory.open 空 loc（纯面板互跳）不写 URL search (t263)", async () => {
        const api = create_web_usageboard();
        await api.sessionHistory.open("", "", "");
        expect(new URLSearchParams(window.location.search).get("loc")).toBeNull();
    });

    it("sessionHistory.searchContent 透传取消 signal 到 fetch (t263)", async () => {
        const fetch_mock = vi
            .fn<typeof fetch>()
            .mockResolvedValue(mock_response({ hits: [], sessions: [] }));
        vi.stubGlobal("fetch", fetch_mock);

        const api = create_web_usageboard();
        const controller = new AbortController();
        await api.sessionHistory.searchContent(
            { filters: { search: "x" }, keyword: "x" },
            controller.signal,
        );
        const first_call = fetch_mock.mock.calls[0];
        expect(first_call).toBeDefined();
        const opts = first_call?.[1];
        expect(opts?.signal).toBe(controller.signal);
        expect(fetch_mock.mock.calls[0]?.[0]).toContain("/v1/sessionHistory/searchContent");
    });

    it("sessionHistory.query forwards source/env so the server can resolve the session (t259)", async () => {
        const fetch_mock = vi
            .fn<typeof fetch>()
            .mockResolvedValue(mock_response({ messages: [], next_cursor: null }));
        vi.stubGlobal("fetch", fetch_mock);

        const api = create_web_usageboard();
        await api.sessionHistory.query("claude_code", "win", "sess-1", { limit: 10 });
        const url = fetch_mock.mock.calls[0]?.[0] as string;
        expect(url).toContain("/v1/sessionHistory");
        expect(url).toContain("id=sess-1");
        expect(url).toContain("source=claude_code");
        expect(url).toContain("env=win");
        expect(url).toContain("limit=10");
    });

    it("sessionHistory.searchContent POSTs to /v1/sessionHistory/searchContent (t259 AC1)", async () => {
        const fetch_mock = vi
            .fn<typeof fetch>()
            .mockResolvedValue(mock_response({ hits: [], sessions: [] }));
        vi.stubGlobal("fetch", fetch_mock);

        const api = create_web_usageboard();
        const result = await api.sessionHistory.searchContent({
            filters: { sources: ["claude_code"] },
            keyword: "hello",
        });
        expect(result).toEqual({ hits: [], sessions: [] });
        expect(fetch_mock).toHaveBeenCalledWith(
            expect.stringContaining("/v1/sessionHistory/searchContent"),
            expect.objectContaining({ method: "POST" }),
        );
        // t259 f003: 断言请求 body 含 keyword/filters 与 Content-Type。
        const opts = fetch_mock.mock.calls[0]?.[1] as {
            body?: string;
            headers?: Record<string, string>;
        };
        expect(JSON.parse(opts.body ?? "{}")).toEqual({
            filters: { sources: ["claude_code"] },
            keyword: "hello",
        });
        expect(opts.headers?.["Content-Type"]).toContain("application/json");
    });

    it("sessionHistory.summaries POSTs to /v1/sessionHistory/summaries (t259 AC1)", async () => {
        const fetch_mock = vi
            .fn<typeof fetch>()
            .mockResolvedValue(mock_response({ summaries: {} }));
        vi.stubGlobal("fetch", fetch_mock);

        const api = create_web_usageboard();
        const result = await api.sessionHistory.summaries([
            { source: "claude_code", env: "win", session_id: "sess-1" },
        ]);
        expect(result).toEqual({});
        expect(fetch_mock).toHaveBeenCalledWith(
            expect.stringContaining("/v1/sessionHistory/summaries"),
            expect.objectContaining({ method: "POST" }),
        );
    });

    it("theme.set('dark')/'light' 更新 data-theme 并通知 onThemeChange (t274)", () => {
        const api = create_web_usageboard();
        const received: boolean[] = [];
        api.event.onThemeChange((dark) => received.push(dark));

        api.theme.set("dark");
        expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
        expect(received).toEqual([true]);

        api.theme.set("light");
        expect(document.documentElement.getAttribute("data-theme")).toBe("light");
        expect(received).toEqual([true, false]);
    });

    it("theme.set('system') 按 matchMedia 解析 data-theme (t274)", () => {
        const api = create_web_usageboard();

        stub_match_media(true);
        api.theme.set("system");
        expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

        stub_match_media(false);
        api.theme.set("system");
        expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });

    it("theme.set 相同值不重复通知（对齐 nativeTheme updated 语义）(t274)", () => {
        const api = create_web_usageboard();
        api.theme.set("dark");
        const received: boolean[] = [];
        api.event.onThemeChange((dark) => received.push(dark));

        api.theme.set("dark");
        expect(received).toEqual([]);

        api.theme.set("light");
        expect(received).toEqual([false]);
    });

    it("onThemeChange 返回可退订函数 (t274)", () => {
        const api = create_web_usageboard();
        const received: boolean[] = [];
        const unsubscribe = api.event.onThemeChange((dark) => received.push(dark));

        api.theme.set("dark");
        unsubscribe();
        api.theme.set("light");
        expect(received).toEqual([true]);
    });

    it("config.save 成功后通知 onConfigChange 订阅者 (t274)", async () => {
        const fetch_mock = vi.fn<typeof fetch>().mockResolvedValue(mock_response({ ok: true }));
        vi.stubGlobal("fetch", fetch_mock);

        const api = create_web_usageboard();
        const received: unknown[] = [];
        const unsubscribe = api.event.onConfigChange?.((cfg) => received.push(cfg));
        expect(typeof unsubscribe).toBe("function");

        const saved = { schemaVersion: 1, theme: "dark" } as never;
        await api.config.save(saved);
        expect(received).toEqual([saved]);
    });

    it("config.save 失败不通知 onConfigChange (t274)", async () => {
        const fetch_mock = vi.fn<typeof fetch>().mockRejectedValue(new Error("network down"));
        vi.stubGlobal("fetch", fetch_mock);

        const api = create_web_usageboard();
        const received: unknown[] = [];
        const unsubscribe = api.event.onConfigChange?.((cfg) => received.push(cfg));
        expect(typeof unsubscribe).toBe("function");

        await expect(api.config.save({ schemaVersion: 1 } as never)).rejects.toThrow(
            "network down",
        );
        expect(received).toEqual([]);
    });

    it("onConfigChange 返回可退订函数 (t274)", async () => {
        const fetch_mock = vi.fn<typeof fetch>().mockResolvedValue(mock_response({ ok: true }));
        vi.stubGlobal("fetch", fetch_mock);

        const api = create_web_usageboard();
        const received: unknown[] = [];
        const unsubscribe = api.event.onConfigChange?.((cfg) => received.push(cfg));
        expect(typeof unsubscribe).toBe("function");
        unsubscribe?.();

        await api.config.save({ schemaVersion: 1 } as never);
        expect(received).toEqual([]);
    });

    it("sessionHistory.subscribe 开专属 SSE 连接，open 后 POST 订阅 (t279 AC1)", async () => {
        const fetch_mock = vi
            .fn<typeof fetch>()
            .mockResolvedValue(mock_response({ subscribed: true, subscriber_id: "web-1" }));
        vi.stubGlobal("fetch", fetch_mock);
        FakeEventSource.instances = [];
        vi.stubGlobal("EventSource", FakeEventSource);

        const api = create_web_usageboard();
        const result = await api.sessionHistory.subscribe("claude_code", "win", "sess-1");
        expect(result).toEqual({ subscribed: true });
        expect(FakeEventSource.instances).toHaveLength(1);
        expect(FakeEventSource.instances[0]?.url).toContain("/v1/events?subscriberId=web-1");
        // open 前不 POST（注册统一在连接建立后发送，f007）。
        expect(fetch_mock).not.toHaveBeenCalled();

        const source = FakeEventSource.instances[0];
        if (!source) throw new Error("no EventSource opened");
        const open_listener = source.listeners.get("open")?.[0];
        if (!open_listener) throw new Error("no open listener");
        open_listener({} as MessageEvent);
        await Promise.resolve();
        expect(fetch_mock).toHaveBeenCalledWith(
            "/v1/sessionHistory/subscribe",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({
                    source: "claude_code",
                    env: "win",
                    session_id: "sess-1",
                    subscriber_id: "web-1",
                }),
            }),
        );
    });

    it("onMessagesUpdated 收到 SSE messagesUpdated 事件 (t279 AC1)", async () => {
        vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(mock_response({})));
        FakeEventSource.instances = [];
        vi.stubGlobal("EventSource", FakeEventSource);

        const api = create_web_usageboard();
        const received: unknown[] = [];
        const off = api.sessionHistory.onMessagesUpdated((payload) => received.push(payload));
        await api.sessionHistory.subscribe("claude_code", "win", "sess-1");

        const source = FakeEventSource.instances[0];
        if (!source) throw new Error("no EventSource opened");
        const listener = source.listeners.get("messagesUpdated")?.[0];
        if (!listener) throw new Error("no messagesUpdated listener");
        listener({
            data: JSON.stringify({
                source: "claude_code",
                env: "win",
                session_id: "sess-1",
                messages: [{ id: "m2", role: "assistant", text: "world", timestamp: 200 }],
            }),
        } as MessageEvent);
        expect(received).toEqual([
            expect.objectContaining({ source: "claude_code", session_id: "sess-1" }),
        ]);
        off();
    });

    it("SSE 重连 open 时用同 subscriber_id 重挂订阅 (t279 AC3)", async () => {
        const fetch_mock = vi
            .fn<typeof fetch>()
            .mockResolvedValue(mock_response({ subscribed: true, subscriber_id: "web-1" }));
        vi.stubGlobal("fetch", fetch_mock);
        FakeEventSource.instances = [];
        vi.stubGlobal("EventSource", FakeEventSource);

        const api = create_web_usageboard();
        await api.sessionHistory.subscribe("claude_code", "win", "sess-1");

        const source = FakeEventSource.instances[0];
        if (!source) throw new Error("no EventSource opened");
        const open_listener = source.listeners.get("open")?.[0];
        if (!open_listener) throw new Error("no open listener");
        // 初次 open 完成注册（POST 1 次）。
        open_listener({} as MessageEvent);
        await Promise.resolve();
        expect(fetch_mock).toHaveBeenCalledTimes(1);

        // 断连重连：再次 open 以同 subscriber_id 幂等重挂（POST 第 2 次）。
        open_listener({} as MessageEvent);
        await Promise.resolve();
        expect(fetch_mock).toHaveBeenCalledTimes(2);
        expect(fetch_mock).toHaveBeenLastCalledWith(
            "/v1/sessionHistory/subscribe",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({
                    source: "claude_code",
                    env: "win",
                    session_id: "sess-1",
                    subscriber_id: "web-1",
                }),
            }),
        );
    });

    it("初始订阅 POST 失败时关闭连接并清理订阅条目 (t279 f002)", async () => {
        const fetch_mock = vi.fn<typeof fetch>().mockRejectedValue(new Error("network down"));
        vi.stubGlobal("fetch", fetch_mock);
        FakeEventSource.instances = [];
        vi.stubGlobal("EventSource", FakeEventSource);

        const api = create_web_usageboard();
        await api.sessionHistory.subscribe("claude_code", "win", "sess-1");
        const source = FakeEventSource.instances[0];
        if (!source) throw new Error("no EventSource opened");
        const open_listener = source.listeners.get("open")?.[0];
        if (!open_listener) throw new Error("no open listener");
        // 初始注册失败：连接关闭、条目清理。
        open_listener({} as MessageEvent);
        await vi.waitFor(() => {
            expect(FakeEventSource.instances[0]?.closed).toBe(true);
        });

        // 失败后重新订阅应能开新连接（旧条目已清理）。
        const fetch_ok = vi
            .fn<typeof fetch>()
            .mockResolvedValue(mock_response({ subscribed: true, subscriber_id: "web-2" }));
        vi.stubGlobal("fetch", fetch_ok);
        await api.sessionHistory.subscribe("claude_code", "win", "sess-1");
        expect(FakeEventSource.instances).toHaveLength(2);
    });

    it("sessionHistory.unsubscribe 关闭专属连接并 POST 注销 (t279 AC1)", async () => {
        const fetch_mock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(mock_response({ subscribed: true, subscriber_id: "web-1" }))
            .mockResolvedValueOnce(mock_response({ unsubscribed: true }));
        vi.stubGlobal("fetch", fetch_mock);
        FakeEventSource.instances = [];
        vi.stubGlobal("EventSource", FakeEventSource);

        const api = create_web_usageboard();
        await api.sessionHistory.subscribe("claude_code", "win", "sess-1");
        await api.sessionHistory.unsubscribe("claude_code", "win", "sess-1");
        expect(FakeEventSource.instances[0]?.closed).toBe(true);
        expect(fetch_mock).toHaveBeenCalledWith(
            "/v1/sessionHistory/unsubscribe",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ subscriber_id: "web-1" }),
            }),
        );
    });

    it("logs.export 下载 /v1/logs/export 响应并返回 saved (t279 AC2)", async () => {
        const blob = new Blob(["log-content"], { type: "text/plain" });
        const fetch_mock = vi
            .fn<typeof fetch>()
            .mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) } as Response);
        vi.stubGlobal("fetch", fetch_mock);
        const create_object_url = vi.fn(() => "blob:fake");
        const revoke_object_url = vi.fn();
        vi.stubGlobal("URL", {
            ...URL,
            createObjectURL: create_object_url,
            revokeObjectURL: revoke_object_url,
        });
        const click_spy = vi
            .spyOn(HTMLAnchorElement.prototype, "click")
            .mockImplementation(() => undefined);

        const api = create_web_usageboard();
        try {
            const result = await api.logs.export();
            expect(result).toEqual({ saved: true });
            expect(fetch_mock).toHaveBeenCalledWith("/v1/logs/export");
            expect(click_spy).toHaveBeenCalled();
        } finally {
            click_spy.mockRestore();
        }
    });

    it("log POSTs the renderer log payload to /v1/logs/renderer (t325 AC-001)", async () => {
        const fetch_mock = vi.fn<typeof fetch>().mockResolvedValue(mock_response({}));
        vi.stubGlobal("fetch", fetch_mock);

        const api = create_web_usageboard();
        const payload = { level: "info", module: "web-panel", message: "hello web" } as const;
        api.log(payload);
        await vi.waitFor(() => {
            expect(fetch_mock).toHaveBeenCalledWith(
                "/v1/logs/renderer",
                expect.objectContaining({
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                }),
            );
        });
    });

    it("log POST 失败静默，不阻塞 renderer (t325)", async () => {
        const fetch_mock = vi.fn<typeof fetch>().mockRejectedValue(new Error("network down"));
        vi.stubGlobal("fetch", fetch_mock);

        const api = create_web_usageboard();
        expect(() => {
            api.log({ level: "error", module: "web-panel", message: "boom" });
        }).not.toThrow();
        await vi.waitFor(() => {
            expect(fetch_mock).toHaveBeenCalledWith(
                expect.stringContaining("/v1/logs/renderer"),
                expect.anything(),
            );
        });
    });

    it("web platform derives from the real host UA (t369 AC-004)", () => {
        const cases: [string, string][] = [
            ["Mozilla/5.0 (X11; Linux x86_64)", "linux"],
            ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "darwin"],
            ["Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "win32"],
            // iOS UA 含 "Mac OS X"——不得误判 darwin（t369 f001 修复）。
            [
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
                "linux",
            ],
        ];
        for (const [ua, expected] of cases) {
            Object.defineProperty(window.navigator, "userAgent", {
                configurable: true,
                value: ua,
            });
            const api = create_web_usageboard();
            expect(api.platform).toBe(expected);
        }
    });
});
