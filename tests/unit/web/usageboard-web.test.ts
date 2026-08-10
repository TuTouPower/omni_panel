// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { create_web_usageboard } from "../../../src/web/usageboard-web";

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
            env: "win",
            start: 100,
            end: 200,
        });
        expect(cells).toEqual([]);
        const url = fetch_mock.mock.calls[0]?.[0] as string;
        expect(url).toContain("/v1/heatmap");
        expect(url).toContain("agent=claude-code");
        expect(url).toContain("env=win");
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
            env: "win",
            start: 100,
            end: 200,
        });
        expect(buckets).toEqual([]);
        const url = fetch_mock.mock.calls[0]?.[0] as string;
        expect(url).toContain("/v1/hourBuckets");
        expect(url).toContain("agent=claude-code");
        expect(url).toContain("env=win");
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

    it("session.login returns { saved: false }", async () => {
        const api = create_web_usageboard();
        const result = await api.session.login({ provider: "kimi" } as never);
        expect(result).toEqual({ saved: false });
    });

    it("session.refresh returns { saved: false }", async () => {
        const api = create_web_usageboard();
        const result = await api.session.refresh({ provider: "kimi" } as never);
        expect(result).toEqual({ saved: false });
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
        }) as (tag_name: string, options?: ElementCreationOptions) => HTMLElement);

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
        }) as (tag_name: string, options?: ElementCreationOptions) => HTMLElement);
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

    it("kimi surface is present and returns safe defaults", async () => {
        const api = create_web_usageboard();
        const status = await api.kimi.login_status("inst-1");
        expect(status).toEqual({ has_token: false, expires_at: null, can_refresh: false });
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

    it("sessionHistory.open switches to the history hash route (t259 AC2)", async () => {
        const api = create_web_usageboard();
        await api.sessionHistory.open("claude_code", "win", "sess-1");
        expect(window.location.hash).toBe("#history");
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
});
