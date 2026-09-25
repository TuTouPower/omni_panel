// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { DevPanelView } from "../../../../src/renderer/views/DevPanelView";
import type { DevPanelState } from "../../../../src/shared/types/dev-panel";

describe("DevPanelView (AC-004: adaptive polling & visibility pause)", () => {
    let getStatusMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.useFakeTimers();
        getStatusMock = vi.fn().mockResolvedValue({
            status: "idle",
            scan_id: null,
            started_at: null,
            result: null,
            error: null,
        } satisfies DevPanelState);

        window.usageboard = {
            log: vi.fn(),
            event: {
                onConfigChange: vi.fn().mockReturnValue(() => undefined),
                onThemeChange: vi.fn().mockReturnValue(() => undefined),
            },
            config: {
                get: vi.fn().mockResolvedValue({
                    config: {
                        schemaVersion: 1,
                        language: "zh-Hans",
                        plugins: [],
                        launchAtLogin: false,
                        devPanel: {
                            scanRoots: ["~/kar/code"],
                            commitCutoff: "2026-03-20",
                            currentUserOnly: true,
                        },
                    },
                }),
                save: vi.fn().mockResolvedValue(undefined),
            },
            devPanel: {
                getStatus: getStatusMock,
                startScan: vi.fn().mockResolvedValue({ scan_id: "s1" }),
                stopScan: vi.fn().mockResolvedValue(undefined),
                queryCommits: vi.fn().mockResolvedValue([]),
                getModelRouting: vi.fn().mockResolvedValue(null),
                saveModelRouting: vi.fn().mockResolvedValue(undefined),
                testChannel: vi.fn().mockResolvedValue({ ok: true, latencyMs: 10 }),
                takeRoutingSnapshot: vi.fn().mockResolvedValue({}),
            },
        } as unknown as typeof window.usageboard;

        Object.defineProperty(document, "hidden", {
            configurable: true,
            value: false,
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it("AC-004: pauses IPC polling when document is hidden and resumes when visible", async () => {
        render(<DevPanelView />);
        await act(async () => {
            await Promise.resolve();
        });

        const initialCalls = getStatusMock.mock.calls.length;
        expect(initialCalls).toBeGreaterThanOrEqual(1);

        // Advance 10s while visible in idle state -> triggers poll
        await act(async () => {
            vi.advanceTimersByTime(10_000);
            await Promise.resolve();
        });
        expect(getStatusMock.mock.calls.length).toBe(initialCalls + 1);

        // Hide document
        Object.defineProperty(document, "hidden", { configurable: true, value: true });
        act(() => {
            document.dispatchEvent(new Event("visibilitychange"));
        });

        // Advance another 30s while hidden -> no additional polling
        await act(async () => {
            vi.advanceTimersByTime(30_000);
            await Promise.resolve();
        });
        expect(getStatusMock.mock.calls.length).toBe(initialCalls + 1);

        // Show document again -> immediately refreshes
        Object.defineProperty(document, "hidden", { configurable: true, value: false });
        await act(async () => {
            document.dispatchEvent(new Event("visibilitychange"));
            await Promise.resolve();
        });
        expect(getStatusMock.mock.calls.length).toBe(initialCalls + 2);
    });
});
