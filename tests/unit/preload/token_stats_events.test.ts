import { describe, expect, it, vi } from "vitest";
import { IPC_CHANNELS } from "../../../src/shared/types/ipc";
import { create_on_updated_subscriber } from "../../../src/preload/token-stats-events";

function create_ipc_mock(): {
    ipc: {
        on: ReturnType<typeof vi.fn>;
        removeListener: ReturnType<typeof vi.fn>;
    };
    listeners: Map<string, ((event: unknown, ...args: unknown[]) => void)[]>;
} {
    const listeners = new Map<string, ((event: unknown, ...args: unknown[]) => void)[]>();
    const ipc = {
        on: vi.fn((channel: string, listener: (event: unknown, ...args: unknown[]) => void) => {
            const arr = listeners.get(channel) ?? [];
            arr.push(listener);
            listeners.set(channel, arr);
        }),
        removeListener: vi.fn(
            (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => {
                const arr = listeners.get(channel) ?? [];
                listeners.set(
                    channel,
                    arr.filter((l) => l !== listener),
                );
            },
        ),
    };
    return { ipc, listeners };
}

describe("token-stats onUpdated 事件版本转发 (t202/p035)", () => {
    it("forwards the committed data version from the main-process event to the callback", () => {
        const { ipc, listeners } = create_ipc_mock();
        const subscribe = create_on_updated_subscriber(ipc);
        const callback = vi.fn();

        subscribe(callback);
        const listeners_for_channel = listeners.get(IPC_CHANNELS.TOKEN_STATS_UPDATED);
        expect(listeners_for_channel).toHaveLength(1);
        expect(ipc.on).toHaveBeenCalledWith(IPC_CHANNELS.TOKEN_STATS_UPDATED, expect.any(Function));

        // main → webContents.send(TOKEN_STATS_UPDATED, data_version) with a
        // number payload (index.ts:316).
        listeners_for_channel?.[0]?.({}, 7);
        expect(callback).toHaveBeenCalledWith(7);

        // A later committed batch advances the version; the same subscription
        // keeps reporting the fresh value — no drop, no shift.
        listeners_for_channel?.[0]?.({}, 8);
        expect(callback).toHaveBeenLastCalledWith(8);
    });

    it("falls back to 0 when the payload is not a number (web build has no push channel)", () => {
        const { ipc, listeners } = create_ipc_mock();
        const subscribe = create_on_updated_subscriber(ipc);
        const callback = vi.fn();

        subscribe(callback);
        const listeners_for_channel = listeners.get(IPC_CHANNELS.TOKEN_STATS_UPDATED);
        listeners_for_channel?.[0]?.(null);
        listeners_for_channel?.[0]?.({}, "7");
        listeners_for_channel?.[0]?.({}, undefined);
        expect(callback).toHaveBeenLastCalledWith(0);
        expect(callback.mock.calls.every((call) => call[0] === 0)).toBe(true);
    });

    it("unsubscribe removes the listener so no further events are delivered", () => {
        const { ipc, listeners } = create_ipc_mock();
        const subscribe = create_on_updated_subscriber(ipc);
        const callback = vi.fn();
        const emit = (args: unknown[]): void => {
            for (const l of listeners.get(IPC_CHANNELS.TOKEN_STATS_UPDATED) ?? []) {
                l({}, ...args);
            }
        };

        const unsubscribe = subscribe(callback);
        emit([5]);
        expect(callback).toHaveBeenCalledTimes(1);

        unsubscribe();
        expect(ipc.removeListener).toHaveBeenCalledWith(
            IPC_CHANNELS.TOKEN_STATS_UPDATED,
            expect.any(Function),
        );
        // The removed listener is gone from the channel's registry; any event
        // the main process emits reaches no callback.
        expect(listeners.get(IPC_CHANNELS.TOKEN_STATS_UPDATED)).toHaveLength(0);

        callback.mockClear();
        emit([9]);
        expect(callback).not.toHaveBeenCalled();
    });
});
