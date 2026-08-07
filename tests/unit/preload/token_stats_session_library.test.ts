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

describe("preload tokenStats session-library contract (t248)", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        vi.stubGlobal("window", {
            location: { href: "file:///app/index.html#history", hash: "#history" },
        });
        vi.stubGlobal("document", {
            documentElement: { setAttribute: vi.fn(), style: {} },
        });
    });

    it("forwards getSessionStats through the dedicated IPC channel", async () => {
        electron_mock.ipcRenderer.invoke.mockResolvedValue({
            ok: true,
            data: { sessions: 73, agents: 4, tokens: 9876 },
        });
        await import("../../../src/preload/index");

        const api = electron_mock.contextBridge.exposeInMainWorld.mock.calls[0]?.[1] as {
            tokenStats: {
                getSessionStats: () => Promise<{
                    sessions: number;
                    agents: number;
                    tokens: number;
                }>;
            };
        };
        await expect(api.tokenStats.getSessionStats()).resolves.toEqual({
            sessions: 73,
            agents: 4,
            tokens: 9876,
        });
        expect(electron_mock.ipcRenderer.invoke).toHaveBeenCalledWith("tokenStats:sessionStats");
    });
});
