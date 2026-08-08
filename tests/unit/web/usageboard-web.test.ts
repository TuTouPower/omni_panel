// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { create_web_usageboard } from "../../../src/web/usageboard-web";

function mock_response(body: unknown): Response {
    return { ok: true, json: () => Promise.resolve(body) } as Response;
}

describe("web usageboard bridge", () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
        // 重置 URL，避免 history.replaceState 写入的 loc 参数跨测试污染。
        window.history.replaceState(null, "", "/");
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

    it("config.createInstance returns stub instance id", async () => {
        const api = create_web_usageboard();
        const result = await api.config.createInstance("some-manifest");
        expect(result.instanceId).toBe("");
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
});
