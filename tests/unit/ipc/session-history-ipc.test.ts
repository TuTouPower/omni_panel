import { describe, it, expect, vi, beforeEach } from "vitest";
import { set_renderer_index_path } from "../../../src/main/ipc/helpers";
import { fileURLToPath } from "node:url";
import type { SessionRow } from "../../../src/main/core/session-history/subscription-service";

const ipc_main_mock = vi.hoisted(() => ({
    handle: vi.fn(),
    removeHandler: vi.fn(),
}));

vi.mock("electron", () => ({
    ipcMain: ipc_main_mock,
}));

// locator mock：默认返回 null，每个测试可改返回值
const locator_mock = vi.hoisted(() => ({
    resolve_session_file: vi.fn().mockReturnValue(null),
}));

vi.mock("../../../src/main/core/session-history/session-locator", () => ({
    resolve_session_file: locator_mock.resolve_session_file,
}));

set_renderer_index_path(fileURLToPath("file:///D:/app/out/renderer/index.html"));

const valid_sender = {
    senderFrame: { url: "file:///D:/app/out/renderer/index.html" },
    sender: {
        id: 1,
        isDestroyed: () => false,
        send: vi.fn(),
        once: vi.fn(),
    },
};

/** 第二个窗口 sender（t219 多窗口路由）。 */
function second_sender(): typeof valid_sender {
    return {
        senderFrame: { url: "file:///D:/app/out/renderer/index.html" },
        sender: {
            id: 2,
            isDestroyed: () => false,
            send: vi.fn(),
            once: vi.fn(),
        },
    };
}

interface MockService {
    subscribe: ReturnType<typeof vi.fn>;
    unsubscribe: ReturnType<typeof vi.fn>;
    query: ReturnType<typeof vi.fn>;
    recent_sessions: ReturnType<typeof vi.fn>;
    searchContent: ReturnType<typeof vi.fn>;
    summaries: ReturnType<typeof vi.fn>;
}

describe("session-history-ipc (t210)", () => {
    let service: MockService;

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules();
        const { set_renderer_index_path } = await import("../../../src/main/ipc/helpers");
        set_renderer_index_path(fileURLToPath("file:///D:/app/out/renderer/index.html"));

        locator_mock.resolve_session_file.mockReturnValue(null);

        service = {
            subscribe: vi.fn().mockReturnValue("claude_code|win|s1"),
            unsubscribe: vi.fn(),
            query: vi.fn().mockReturnValue({ messages: [], next_cursor: null }),
            recent_sessions: vi.fn().mockReturnValue([
                {
                    source: "claude_code",
                    env: "win",
                    session_id: "s1",
                    title: "hello",
                    agent: "claude-code",
                },
            ]),
            searchContent: vi.fn().mockResolvedValue(new Set(["claude_code|win|s1"])),
            summaries: vi.fn().mockResolvedValue({ "claude_code|win|s1": "摘要" }),
        };
    });

    async function register(sessions_provider = vi.fn().mockReturnValue([])): Promise<void> {
        const { registerSessionHistoryIpc } =
            await import("../../../src/main/ipc/session-history-ipc");
        registerSessionHistoryIpc(ipc_main_mock as never, {
            service: service as never,
            sessions_provider,
        });
    }

    async function register_with_paths(paths: {
        host: "windows" | "linux" | "macos";
        homedir: string;
        win_home: string;
        wsl_distro: string;
        wsl_user: string;
    }): Promise<void> {
        const { registerSessionHistoryIpc } =
            await import("../../../src/main/ipc/session-history-ipc");
        const sessions_provider = vi.fn().mockReturnValue([]);
        registerSessionHistoryIpc(ipc_main_mock as never, {
            service: service as never,
            sessions_provider,
            locator_paths: paths,
        });
    }

    function get_handler(channel: string): (...args: unknown[]) => unknown {
        const call = ipc_main_mock.handle.mock.calls.find((c: unknown[]) => c[0] === channel);
        if (!call) throw new Error(`handler not registered: ${channel}`);
        return call[1] as (...args: unknown[]) => unknown;
    }

    it("注册 SUBSCRIBE/UNSUBSCRIBE/QUERY/RECENT/SEARCH_CONTENT/SUMMARIES 通道", async () => {
        await register();

        const channels = ipc_main_mock.handle.mock.calls.map((c: unknown[]) => c[0]);
        expect(channels).toContain("sessionHistory:subscribe");
        expect(channels).toContain("sessionHistory:unsubscribe");
        expect(channels).toContain("sessionHistory:query");
        expect(channels).toContain("sessionHistory:recent");
        expect(channels).toContain("sessionHistory:searchContent");
        expect(channels).toContain("sessionHistory:summaries");
        // SESSION_HISTORY_OPEN 不在本模块注册（由 main/index.ts 单点注册）
        expect(channels).not.toContain("sessionHistory:open");
    });

    it("SUBSCRIBE resolve 成功时调 service.subscribe 并返回 ok", async () => {
        locator_mock.resolve_session_file.mockReturnValue({
            file_path: "/x/sess.jsonl",
            extractor_kind: "claude_code",
        });
        await register();

        const handler = get_handler("sessionHistory:subscribe");
        const result = handler(valid_sender, "claude_code", "win", "s1") as {
            ok: boolean;
            data: { subscribed: boolean };
        };

        expect(result.ok).toBe(true);
        expect(result.data.subscribed).toBe(true);
        expect(service.subscribe).toHaveBeenCalledTimes(1);
        const params = service.subscribe.mock.calls[0]?.[0] as {
            file_path: string;
            extractor_kind: string;
            subscriber_id: string;
            on_update: (m: unknown[]) => void;
        };
        expect(params.file_path).toBe("/x/sess.jsonl");
        expect(params.extractor_kind).toBe("claude_code");
        // t219：订阅携带发起窗口身份（event.sender.id）。
        expect(params.subscriber_id).toBe("1");
        expect(typeof params.on_update).toBe("function");
    });

    it("SUBSCRIBE resolve 失败时返回 fail SESSION_NOT_FOUND", async () => {
        locator_mock.resolve_session_file.mockReturnValue(null);
        await register();

        const handler = get_handler("sessionHistory:subscribe");
        const result = handler(valid_sender, "claude_code", "win", "missing") as {
            ok: boolean;
            error: { code: string; message: string };
        };

        expect(result.ok).toBe(false);
        expect(result.error.code).toBe("SESSION_NOT_FOUND");
        expect(service.subscribe).not.toHaveBeenCalled();
    });

    it("SUBSCRIBE 把 deps.locator_paths（wsl 配置）传给 resolve_session_file", async () => {
        locator_mock.resolve_session_file.mockReturnValue({
            file_path: "/x/sess.jsonl",
            extractor_kind: "claude_code",
        });
        const paths = {
            host: "windows",
            homedir: "/unused-homedir",
            win_home: "C:/users/u",
            wsl_distro: "Ubuntu-22.04",
            wsl_user: "karon",
        } as const;
        await register_with_paths(paths);

        const handler = get_handler("sessionHistory:subscribe");
        handler(valid_sender, "claude_code", "wsl", "s1");

        expect(locator_mock.resolve_session_file).toHaveBeenCalledWith(
            "claude_code",
            "wsl",
            "s1",
            paths,
        );
    });

    it("SUBSCRIBE on_update 回调把增量推到发起订阅的窗口（t219）", async () => {
        locator_mock.resolve_session_file.mockReturnValue({
            file_path: "/x/sess.jsonl",
            extractor_kind: "claude_code",
        });
        await register();

        const handler = get_handler("sessionHistory:subscribe");
        handler(valid_sender, "claude_code", "win", "s1");

        const params = service.subscribe.mock.calls[0]?.[0] as {
            on_update: (m: unknown[]) => void;
        };
        const messages = [{ id: "1", role: "user", text: "hi", timestamp: null }];
        params.on_update(messages);

        // 推送目标是订阅方窗口（event.sender），不再是历史窗口 singleton。
        expect(valid_sender.sender.send).toHaveBeenCalledWith("sessionHistory:messagesUpdated", {
            source: "claude_code",
            env: "win",
            session_id: "s1",
            messages,
        });
    });

    it("SUBSCRIBE on_update 遇已销毁的订阅方窗口不发送（t219 竞态守卫）", async () => {
        locator_mock.resolve_session_file.mockReturnValue({
            file_path: "/x/sess.jsonl",
            extractor_kind: "claude_code",
        });
        await register();

        const handler = get_handler("sessionHistory:subscribe");
        const destroyed_sender = {
            senderFrame: { url: "file:///D:/app/out/renderer/index.html" },
            sender: {
                id: 3,
                isDestroyed: () => true,
                send: vi.fn(),
                once: vi.fn(),
            },
        };
        handler(destroyed_sender, "claude_code", "win", "s1");

        const params = service.subscribe.mock.calls[0]?.[0] as {
            on_update: (m: unknown[]) => void;
        };
        params.on_update([{ id: "1", role: "user", text: "hi", timestamp: null }]);

        // 向已销毁 webContents send 会抛错；守卫应跳过发送。
        expect(destroyed_sender.sender.send).not.toHaveBeenCalled();
    });

    it("两个窗口订阅同一会话，各窗口只收到自己订阅的推送（t219 AC-1）", async () => {
        locator_mock.resolve_session_file.mockReturnValue({
            file_path: "/x/sess.jsonl",
            extractor_kind: "claude_code",
        });
        await register();

        const handler = get_handler("sessionHistory:subscribe");
        const sender_b = second_sender();
        handler(valid_sender, "claude_code", "win", "s1");
        handler(sender_b, "claude_code", "win", "s1");

        // 两个订阅各带各自窗口身份。
        const params_a = service.subscribe.mock.calls[0]?.[0] as {
            subscriber_id: string;
            on_update: (m: unknown[]) => void;
        };
        const params_b = service.subscribe.mock.calls[1]?.[0] as {
            subscriber_id: string;
            on_update: (m: unknown[]) => void;
        };
        expect(params_a.subscriber_id).toBe("1");
        expect(params_b.subscriber_id).toBe("2");

        const messages = [{ id: "1", role: "user", text: "hi", timestamp: null }];

        // 窗口 B 的订阅触发推送 → 只发给 B，不发给 A。
        params_b.on_update(messages);
        expect(sender_b.sender.send).toHaveBeenCalledTimes(1);
        expect(valid_sender.sender.send).not.toHaveBeenCalled();

        // 窗口 A 的订阅触发推送 → 只发给 A。
        params_a.on_update(messages);
        expect(valid_sender.sender.send).toHaveBeenCalledTimes(1);
    });

    it("订阅方窗口销毁时注销该订阅（t219 AC-3 无残留）", async () => {
        locator_mock.resolve_session_file.mockReturnValue({
            file_path: "/x/sess.jsonl",
            extractor_kind: "claude_code",
        });
        await register();

        const handler = get_handler("sessionHistory:subscribe");
        handler(valid_sender, "claude_code", "win", "s1");

        // 挂 destroyed 监听：销毁时用订阅方 id 注销，不误伤同会话其他订阅方。
        expect(valid_sender.sender.once).toHaveBeenCalledWith("destroyed", expect.any(Function));
        const cleanup = valid_sender.sender.once.mock.calls[0]?.[1] as () => void;
        cleanup();
        expect(service.unsubscribe).toHaveBeenCalledWith("claude_code", "win", "s1", "1");
    });

    it("UNSUBSCRIBE 只注销调用方窗口的订阅（t219）", async () => {
        await register();

        const handler = get_handler("sessionHistory:unsubscribe");
        const result = handler(valid_sender, "claude_code", "win", "s1") as {
            ok: boolean;
            data: { unsubscribed: boolean };
        };

        expect(result.ok).toBe(true);
        expect(service.unsubscribe).toHaveBeenCalledWith("claude_code", "win", "s1", "1");
    });

    it("QUERY resolve 成功时调 service.query 并返回 ok", async () => {
        service.query.mockReturnValue({
            messages: [{ id: "1", role: "user", text: "hi", timestamp: null }],
            next_cursor: null,
        });
        locator_mock.resolve_session_file.mockReturnValue({
            file_path: "/x/sess.jsonl",
            extractor_kind: "claude_code",
        });
        await register();

        const handler = get_handler("sessionHistory:query");
        const result = handler(valid_sender, "claude_code", "win", "s1", { limit: 10 }) as {
            ok: boolean;
            data: { messages: unknown[]; next_cursor: unknown };
        };

        expect(result.ok).toBe(true);
        expect(result.data.messages).toHaveLength(1);
        expect(service.query).toHaveBeenCalledTimes(1);
    });

    it("QUERY resolve 失败返回 fail", async () => {
        locator_mock.resolve_session_file.mockReturnValue(null);
        await register();

        const handler = get_handler("sessionHistory:query");
        const result = handler(valid_sender, "claude_code", "win", "missing") as {
            ok: boolean;
            error: { code: string };
        };

        expect(result.ok).toBe(false);
        expect(result.error.code).toBe("SESSION_NOT_FOUND");
    });

    it("RECENT 调 service.recent_sessions 并返回 ok", async () => {
        locator_mock.resolve_session_file.mockReturnValue(null);
        await register();

        const handler = get_handler("sessionHistory:recent");
        const result = handler(valid_sender, "claude_code", "win", 6) as {
            ok: boolean;
            data: unknown[];
        };

        expect(result.ok).toBe(true);
        expect(result.data).toHaveLength(1);
        expect(service.recent_sessions).toHaveBeenCalledTimes(1);
    });

    it("t389 AC-001: RECENT 超大 limit 被拒，不触发全量拉取", async () => {
        await register();
        const handler = get_handler("sessionHistory:recent");
        const result = handler(valid_sender, "claude_code", "win", Number.MAX_SAFE_INTEGER) as {
            ok: boolean;
        };
        expect(result.ok).toBe(false);
        expect(service.recent_sessions).not.toHaveBeenCalled();
    });

    it("t389 AC-004: RECENT 非法 limit（0/负/非整数）被拒", async () => {
        await register();
        const handler = get_handler("sessionHistory:recent");
        for (const bad of [0, -5, 1.5, Number.NaN]) {
            const result = handler(valid_sender, "claude_code", "win", bad) as { ok: boolean };
            expect(result.ok, `limit=${String(bad)}`).toBe(false);
        }
        expect(service.recent_sessions).not.toHaveBeenCalled();
    });

    it("SEARCH_CONTENT resolve 后调 service.searchContent 并返回命中数组", async () => {
        locator_mock.resolve_session_file.mockReturnValue({
            file_path: "/x/sess.jsonl",
            extractor_kind: "claude_code",
        });
        await register();

        const handler = get_handler("sessionHistory:searchContent");
        const result = (await handler(valid_sender, {
            locs: [{ source: "claude_code", env: "win", session_id: "s1" }],
            keyword: "hello",
        })) as { ok: boolean; data: { hits: string[] } };

        expect(result.ok).toBe(true);
        expect(result.data.hits).toEqual(["claude_code|win|s1"]);
        expect(service.searchContent).toHaveBeenCalledTimes(1);
        const args = service.searchContent.mock.calls[0];
        expect(args?.[0]).toEqual([
            {
                source: "claude_code",
                env: "win",
                session_id: "s1",
                file_path: "/x/sess.jsonl",
                extractor_kind: "claude_code",
            },
        ]);
        expect(args?.[1]).toBe("hello");
    });

    it("SEARCH_CONTENT 跳过未 resolve 的 loc，不整批失败", async () => {
        locator_mock.resolve_session_file.mockImplementation(
            (_source: string, _env: string, session_id: string) => {
                if (session_id === "s1") {
                    return { file_path: "/x/s1.jsonl", extractor_kind: "claude_code" };
                }
                return null;
            },
        );
        service.searchContent.mockResolvedValue(new Set(["claude_code|win|s1"]));
        await register();

        const handler = get_handler("sessionHistory:searchContent");
        const result = (await handler(valid_sender, {
            locs: [
                { source: "claude_code", env: "win", session_id: "s1" },
                { source: "claude_code", env: "win", session_id: "missing" },
            ],
            keyword: "hello",
        })) as { ok: boolean; data: { hits: string[] } };

        expect(result.ok).toBe(true);
        expect(result.data.hits).toEqual(["claude_code|win|s1"]);
        expect(service.searchContent).toHaveBeenCalledWith(
            [
                {
                    source: "claude_code",
                    env: "win",
                    session_id: "s1",
                    file_path: "/x/s1.jsonl",
                    extractor_kind: "claude_code",
                },
            ],
            "hello",
        );
    });

    it("t388 AC-002: 未超限搜索响应 truncated=false", async () => {
        locator_mock.resolve_session_file.mockReturnValue({
            file_path: "/x/sess.jsonl",
            extractor_kind: "claude_code",
        });
        await register(vi.fn().mockReturnValue([]));
        const handler = get_handler("sessionHistory:searchContent");
        const result = (await handler(valid_sender, {
            filters: { search: "hello" },
            keyword: "hello",
        })) as { ok: boolean; data: { truncated?: boolean } };
        expect(result.ok).toBe(true);
        expect(result.data.truncated).toBe(false);
    });

    it("t388 AC-001: 枚举达 SEARCH_ENUM_CAP 截断时 truncated=true", async () => {
        locator_mock.resolve_session_file.mockReturnValue({
            file_path: "/x/sess.jsonl",
            extractor_kind: "claude_code",
        });
        // provider 恒返回满页 100 条（filter 搜索路径枚举达 cap 触发截断）。
        const full_page = Array.from({ length: 100 }, (_, i) => ({
            id: `s${String(i)}`,
            source: "claude_code",
            env: "win",
            title: null,
            model: null,
            started_at: 0,
            ended_at: 0,
        }));
        await register(vi.fn().mockReturnValue(full_page));
        service.searchContent.mockResolvedValue(new Set(["claude_code|win|s0"]));
        const handler = get_handler("sessionHistory:searchContent");
        const result = (await handler(valid_sender, {
            filters: { search: "hello" },
            keyword: "hello",
        })) as { ok: boolean; data: { truncated?: boolean } };
        expect(result.ok).toBe(true);
        expect(result.data.truncated).toBe(true);
    });

    it("SEARCH_CONTENT 从后端筛选候选集，不要求 renderer 传入全量 locs（t248 AC5）", async () => {
        locator_mock.resolve_session_file.mockReturnValue({
            file_path: "/x/hidden.jsonl",
            extractor_kind: "claude_code",
        });
        service.searchContent.mockResolvedValue(new Set(["claude_code|win|hidden"]));
        const sessions_provider = vi.fn().mockReturnValue([
            {
                id: "hidden",
                source: "claude_code",
                env: "win",
                title: "backend candidate",
                model: "sonnet",
                started_at: 100,
                ended_at: 200,
                session: {
                    id: "hidden",
                    source: "claude_code",
                    env: "win",
                    model: "sonnet",
                    title: "backend candidate",
                    directory: "/hidden",
                    input_tokens: 1,
                    output_tokens: 2,
                    cache_read_tokens: 3,
                    cache_write_tokens: 4,
                    calls: 1,
                    started_at: 100,
                    ended_at: 200,
                },
            },
        ]);
        await register(sessions_provider);

        const handler = get_handler("sessionHistory:searchContent");
        const result = (await handler(valid_sender, {
            filters: {
                sources: ["claude_code"],
                search: "backend",
                start_at: 50,
                end_at: 250,
            },
            keyword: "秘密词",
        })) as { ok: boolean; data: { hits: string[]; sessions: { id: string }[] } };

        expect(result.ok).toBe(true);
        expect(result.data.hits).toEqual(["claude_code|win|hidden"]);
        expect(result.data.sessions.map((session) => session.id)).toEqual(["hidden"]);
        expect(sessions_provider).toHaveBeenNthCalledWith(1, {
            sources: ["claude_code"],
            start_at: 50,
            end_at: 250,
            limit: 100,
            offset: 0,
        });
        expect(sessions_provider).toHaveBeenNthCalledWith(2, {
            sources: ["claude_code"],
            search: "backend",
            start_at: 50,
            end_at: 250,
            limit: 100,
            offset: 0,
        });
        expect(service.searchContent).toHaveBeenCalledWith(
            [
                {
                    source: "claude_code",
                    env: "win",
                    session_id: "hidden",
                    file_path: "/x/hidden.jsonl",
                    extractor_kind: "claude_code",
                },
            ],
            "秘密词",
        );
    });

    it("SEARCH_CONTENT 去重 metadata 与 candidate 重叠会话，不重复输出 (t354 AC-001)", async () => {
        locator_mock.resolve_session_file.mockReturnValue({
            file_path: "/x/sess.jsonl",
            extractor_kind: "claude_code",
        });
        // candidate 与 metadata 都含 s1（重叠）：candidate 来自枚举、metadata 来自
        // search 过滤的 query_all_sessions。旧 includes 引用比较恒 false 导致重叠行
        // 重复进 sessions；新 Set 判断按 key 去重。
        const shared_session = {
            id: "s1",
            source: "claude_code",
            env: "win",
            title: "shared",
            model: "sonnet",
            started_at: 100,
            ended_at: 200,
            session: {
                id: "s1",
                source: "claude_code",
                env: "win",
                model: "sonnet",
                title: "shared",
                directory: "/x",
                input_tokens: 1,
                output_tokens: 2,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                calls: 1,
                started_at: 100,
                ended_at: 200,
            },
        };
        // provider 首调（candidate 枚举）返回 s1；次调（metadata search 过滤）也返回 s1。
        const sessions_provider = vi
            .fn()
            .mockReturnValueOnce([shared_session])
            .mockReturnValueOnce([shared_session]);
        service.searchContent.mockResolvedValue(new Set(["claude_code|win|s1"]));
        await register(sessions_provider);

        const handler = get_handler("sessionHistory:searchContent");
        const result = (await handler(valid_sender, {
            filters: { sources: ["claude_code"], search: "shared" },
            keyword: "秘密词",
        })) as { ok: boolean; data: { hits: string[]; sessions: { id: string }[] } };

        expect(result.ok).toBe(true);
        // 重叠行只输出一次。
        expect(result.data.sessions.map((s) => s.id)).toEqual(["s1"]);
    });

    it("SEARCH_CONTENT 分页枚举有总量上限，不随会话库规模无限分页 (t354 AC-003)", async () => {
        locator_mock.resolve_session_file.mockReturnValue({
            file_path: "/x/sess.jsonl",
            extractor_kind: "claude_code",
        });
        // provider 永远返回满页（CONTENT_SEARCH_PAGE_SIZE=100）模拟无限库。
        const full_page: SessionRow[] = Array.from({ length: 100 }, (_, i) => ({
            id: `sess-${String(i)}`,
            source: "claude_code",
            env: "win" as SessionRow["env"],
            title: null,
            model: null,
            started_at: i,
            ended_at: 1000 - i,
        }));
        const sessions_provider = vi.fn().mockReturnValue(full_page);
        service.searchContent.mockResolvedValue(new Set([]));
        await register(sessions_provider);

        const handler = get_handler("sessionHistory:searchContent");
        const result = await handler(valid_sender, {
            filters: { sources: ["claude_code"], search: "x" },
            keyword: "词",
        });

        expect((result as { ok: boolean }).ok).toBe(true);
        // candidate 与 metadata 各一次枚举，每枚举在 cap(100_000) 处停止
        // （100_000/100 = 1000 页 + 首页 = 1001 次）。断言有限次数证明不无限循环。
        expect(sessions_provider.mock.calls.length).toBeLessThanOrEqual(2005);
    });

    it("SUMMARIES resolve 后调 service.summaries 并返回摘要映射", async () => {
        locator_mock.resolve_session_file.mockReturnValue({
            file_path: "/x/sess.jsonl",
            extractor_kind: "claude_code",
        });
        await register();

        const handler = get_handler("sessionHistory:summaries");
        const result = (await handler(valid_sender, {
            locs: [{ source: "claude_code", env: "win", session_id: "s1" }],
        })) as { ok: boolean; data: { summaries: Record<string, string> } };

        expect(result.ok).toBe(true);
        expect(result.data.summaries).toEqual({ "claude_code|win|s1": "摘要" });
        expect(service.summaries).toHaveBeenCalledTimes(1);
        const args = service.summaries.mock.calls[0];
        expect(args?.[0]).toEqual([
            {
                source: "claude_code",
                env: "win",
                session_id: "s1",
                file_path: "/x/sess.jsonl",
                extractor_kind: "claude_code",
            },
        ]);
    });

    it("SUMMARIES 跳过未 resolve 的 loc", async () => {
        locator_mock.resolve_session_file.mockImplementation(
            (_source: string, _env: string, session_id: string) => {
                if (session_id === "s1") {
                    return { file_path: "/x/s1.jsonl", extractor_kind: "claude_code" };
                }
                return null;
            },
        );
        await register();

        const handler = get_handler("sessionHistory:summaries");
        const result = (await handler(valid_sender, {
            locs: [
                { source: "claude_code", env: "win", session_id: "s1" },
                { source: "claude_code", env: "win", session_id: "missing" },
            ],
        })) as { ok: boolean; data: { summaries: Record<string, string> } };

        expect(result.ok).toBe(true);
        expect(service.summaries).toHaveBeenCalledWith([
            {
                source: "claude_code",
                env: "win",
                session_id: "s1",
                file_path: "/x/s1.jsonl",
                extractor_kind: "claude_code",
            },
        ]);
    });
});
