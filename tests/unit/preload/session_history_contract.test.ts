import { beforeEach, describe, expect, it, vi } from "vitest";

const electron_mock = vi.hoisted(() => ({
    contextBridge: {
        exposeInMainWorld: vi.fn(),
    },
    ipcRenderer: {
        invoke: vi.fn(),
        on: vi.fn(),
        removeListener: vi.fn(),
    },
}));

vi.mock("electron", () => electron_mock);

// t341：preload sessionHistory 契约修复——summaries 解包包装对象、open 走裸 invoke
// 不经 IpcResult 信封校验。
describe("preload sessionHistory contract (t341)", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        vi.stubGlobal("window", {
            location: { href: "file:///app/index.html#session", hash: "#session" },
        });
        vi.stubGlobal("document", {
            documentElement: { setAttribute: vi.fn(), style: {} },
        });
    });

    it("summaries 解包 { summaries } 包装对象（AC-001）", async () => {
        electron_mock.ipcRenderer.invoke.mockResolvedValue({
            ok: true,
            data: { summaries: { "loc-key": "摘要文本" } },
        });
        await import("../../../src/preload/index");

        const api = electron_mock.contextBridge.exposeInMainWorld.mock.calls[0]?.[1] as {
            sessionHistory: {
                summaries: (locs: unknown[]) => Promise<Record<string, string>>;
            };
        };

        const result = await api.sessionHistory.summaries([
            { source: "claude", env: "win", session_id: "s1" },
        ]);
        expect(result).toEqual({ "loc-key": "摘要文本" });
    });

    it("open 不校验 IpcResult 信封、不抛 Invalid IPC response（AC-002）", async () => {
        // main open handler 无返回 → invoke resolve undefined，非 IpcResult 形状。
        electron_mock.ipcRenderer.invoke.mockResolvedValue(undefined);
        await import("../../../src/preload/index");

        const api = electron_mock.contextBridge.exposeInMainWorld.mock.calls[0]?.[1] as {
            sessionHistory: {
                open: (source: string, env: string, session_id: string) => Promise<void>;
            };
        };

        await expect(api.sessionHistory.open("claude", "win", "s1")).resolves.toBeUndefined();
    });

    it("usage/tray 路由 open_only 档 open 同样不抛 Invalid IPC response（AC-002 全路由）", async () => {
        // usage 路由：hash=usage 使 preload 选择 open_only 档，从暴露的 api 取真实实现。
        vi.stubGlobal("window", {
            location: { href: "file:///app/index.html#usage", hash: "#usage" },
        });
        electron_mock.ipcRenderer.invoke.mockResolvedValue(undefined);
        await import("../../../src/preload/index");

        const api = electron_mock.contextBridge.exposeInMainWorld.mock.calls[0]?.[1] as {
            sessionHistory: {
                open: (source: string, env: string, session_id: string) => Promise<void>;
            };
        };

        // 若 open_only 仍走 invoke<undefined>（破损实现），这里会抛 Invalid IPC response。
        await expect(api.sessionHistory.open("claude", "win", "s1")).resolves.toBeUndefined();
        expect(electron_mock.ipcRenderer.invoke).toHaveBeenCalledWith(
            "sessionHistory:open",
            "claude",
            "win",
            "s1",
        );
    });
});
