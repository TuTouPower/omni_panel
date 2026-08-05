import { describe, expect, it, vi } from "vitest";
import {
    select_grok_api,
    select_session_history_api,
    select_trend_api,
} from "../../../src/preload/route_api";
import type {
    GrokReadonlyApi,
    GrokSettingsApi,
    SessionHistoryApi,
    TrendApi,
} from "../../../src/shared/types/ipc";

function create_grok_apis(): {
    readonly readonly_api: GrokReadonlyApi;
    readonly settings_api: GrokSettingsApi;
} {
    const readonly_api: GrokReadonlyApi = {
        login_status: vi.fn(),
    };
    return {
        readonly_api,
        settings_api: {
            ...readonly_api,
            login_start: vi.fn(),
            login_poll: vi.fn(),
            login_cancel: vi.fn(),
            logout: vi.fn(),
            refresh: vi.fn(),
        },
    };
}

describe("select_grok_api", () => {
    it("exposes the full Grok API to setting", () => {
        const { readonly_api, settings_api } = create_grok_apis();

        const api = select_grok_api("setting", readonly_api, settings_api);

        expect(Object.keys(api).sort()).toEqual([
            "login_cancel",
            "login_poll",
            "login_start",
            "login_status",
            "logout",
            "refresh",
        ]);
    });

    it.each(["usage", "agent", "tray", "unknown"])(
        "exposes only Grok login status to %s",
        (route) => {
            const { readonly_api, settings_api } = create_grok_apis();

            const api = select_grok_api(route, readonly_api, settings_api);

            expect(Object.keys(api)).toEqual(["login_status"]);
        },
    );
});

describe("select_trend_api", () => {
    function create_trend_apis(): {
        readonly full_api: TrendApi;
        readonly disabled_api: TrendApi;
    } {
        const full_api: TrendApi = {
            get: vi.fn().mockResolvedValue([]),
            getBulk: vi.fn().mockResolvedValue({ series: [] }),
        };
        const disabled_api: TrendApi = {
            get: vi.fn().mockResolvedValue([]),
            getBulk: vi.fn().mockResolvedValue({ series: [] }),
        };
        return { full_api, disabled_api };
    }

    it.each(["usage", "agent", "unknown"])("exposes full trend API to %s route", (route) => {
        const { full_api, disabled_api } = create_trend_apis();

        const api = select_trend_api(route, full_api, disabled_api);

        expect(api).toBe(full_api);
    });

    it.each(["setting", "tray"])("exposes disabled trend API to %s route", async (route) => {
        const { full_api, disabled_api } = create_trend_apis();

        const api = select_trend_api(route, full_api, disabled_api);

        expect(api).toBe(disabled_api);
        // Lock the noop contract: disabled routes resolve to [] without throwing,
        // so setting/tray never see real trend data nor break on the IPC call.
        await expect(api.get("any", "any", "any", "any")).resolves.toEqual([]);
    });
});

describe("select_session_history_api", () => {
    function create_session_history_apis(): {
        readonly full_api: SessionHistoryApi;
        readonly open_api: SessionHistoryApi;
        readonly disabled_api: SessionHistoryApi;
        readonly open_spy: ReturnType<typeof vi.fn>;
    } {
        const open_spy = vi.fn().mockResolvedValue(undefined);
        const full_api: SessionHistoryApi = {
            open: open_spy,
            subscribe: vi.fn().mockResolvedValue({ subscribed: true }),
            unsubscribe: vi.fn().mockResolvedValue({ unsubscribed: true }),
            query: vi.fn().mockResolvedValue({ messages: [], next_cursor: null }),
            recent: vi.fn().mockResolvedValue([]),
            onMessagesUpdated: vi.fn(() => () => undefined),
            onFocus: vi.fn(() => () => undefined),
        };
        // open_only 档（t212）：usage route 仅暴露 open（打开历史窗口），
        // 其余方法保持 disabled 形状，避免 popup 窗口意外获得订阅/查询能力。
        const open_api: SessionHistoryApi = {
            open: open_spy,
            subscribe: vi.fn().mockResolvedValue({ subscribed: false }),
            unsubscribe: vi.fn().mockResolvedValue({ unsubscribed: false }),
            query: vi.fn().mockResolvedValue({ messages: [], next_cursor: null }),
            recent: vi.fn().mockResolvedValue([]),
            onMessagesUpdated: vi.fn(() => () => undefined),
            onFocus: vi.fn(() => () => undefined),
        };
        // disabled_api 用独立 spy（不共享 full_api mock），锁定 noop 契约：
        // 调用 disabled 方法不得触达 full（真实 IPC）实现。
        const disabled_api: SessionHistoryApi = {
            open: vi.fn().mockResolvedValue(undefined),
            subscribe: vi.fn().mockResolvedValue({ subscribed: false }),
            unsubscribe: vi.fn().mockResolvedValue({ unsubscribed: false }),
            query: vi.fn().mockResolvedValue({ messages: [], next_cursor: null }),
            recent: vi.fn().mockResolvedValue([]),
            onMessagesUpdated: vi.fn(() => () => undefined),
            onFocus: vi.fn(() => () => undefined),
        };
        return { full_api, open_api, disabled_api, open_spy };
    }

    // AC9: 会话历史 API 仅对 history 与 agent route 暴露真实 IPC。
    it.each(["history", "agent"])("exposes full session-history API to %s route", (route) => {
        const { full_api, open_api, disabled_api } = create_session_history_apis();

        const api = select_session_history_api(route, full_api, open_api, disabled_api);

        expect(api).toBe(full_api);
    });

    // t212: usage（托盘 popup / 用量面板）需打开历史窗口，暴露 open-only 档；
    // t?：tray（托盘菜单）的会话面板入口同样只需 open。
    it.each(["usage", "tray"])(
        "exposes open-only session-history API to %s route",
        async (route) => {
            const { full_api, open_api, disabled_api, open_spy } = create_session_history_apis();

            const api = select_session_history_api(route, full_api, open_api, disabled_api);

            expect(api).toBe(open_api);
            // open 触达真实 IPC 实现；其余方法保持 disabled 空形状。
            await expect(api.open("c", "win", "s")).resolves.toBeUndefined();
            expect(open_spy).toHaveBeenCalledWith("c", "win", "s");
            await expect(api.subscribe("c", "win", "s")).resolves.toEqual({ subscribed: false });
            await expect(api.query("c", "win", "s")).resolves.toEqual({
                messages: [],
                next_cursor: null,
            });
            await expect(api.recent("c", "win", 6)).resolves.toEqual([]);
        },
    );

    it.each(["setting", "unknown"])(
        "exposes disabled session-history API to %s route",
        async (route) => {
            const { full_api, open_api, disabled_api, open_spy } = create_session_history_apis();

            const api = select_session_history_api(route, full_api, open_api, disabled_api);

            expect(api).toBe(disabled_api);
            // Lock the noop contract: disabled routes resolve without touching the
            // full (real IPC) implementation, and return the disabled empty shapes.
            await expect(api.open("c", "win", "s")).resolves.toBeUndefined();
            await expect(api.subscribe("c", "win", "s")).resolves.toEqual({
                subscribed: false,
            });
            await expect(api.query("c", "win", "s")).resolves.toEqual({
                messages: [],
                next_cursor: null,
            });
            await expect(api.recent("c", "win", 6)).resolves.toEqual([]);
            expect(open_spy).not.toHaveBeenCalled();
        },
    );
});
