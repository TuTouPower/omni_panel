import { describe, it, expect } from "vitest";
import type { ConnectorSnapshotDTO } from "../../../src/shared/types/ipc";
import {
    ok,
    fail,
    state_to_snapshot_dto,
    assert_valid_sender,
} from "../../../src/main/ipc/helpers";

describe("IPC helpers", () => {
    it("ok() returns success envelope with data", () => {
        const result = ok(42);
        expect(result).toEqual({ ok: true, data: 42 });
    });

    it("ok() returns success envelope with undefined", () => {
        const result = ok(undefined);
        expect(result).toEqual({ ok: true, data: undefined });
    });

    it("ok() returns success envelope with object", () => {
        const data = { name: "test" };
        const result = ok(data);
        expect(result).toEqual({ ok: true, data });
    });

    it("fail() returns error envelope with code and message", () => {
        const result = fail("VALIDATION_ERROR", "Invalid input");
        expect(result).toEqual({
            ok: false,
            error: { code: "VALIDATION_ERROR", message: "Invalid input" },
        });
    });

    it("state_to_snapshot_dto includes last successful items during loading", () => {
        const result: ConnectorSnapshotDTO = state_to_snapshot_dto({
            status: "loading",
            lastSuccess: {
                updatedAt: "2026-06-06T12:00:00Z",
                items: [
                    {
                        id: "item-1",
                        provider: "claude",
                        source: "gateway",
                        sourceInstanceId: "cpa-1",
                        accountId: "acct-1",
                        accountLabel: "Claude Account",
                        raw_label: "five_hour",
                        normalized_label: "5小时用量",
                        used: 10,
                        limit: 100,
                        resetAt: null,
                        observedAt: 1735689600000,
                        stale: false,
                        displayStyle: "percent",
                        status: "normal",
                    },
                ],
                badge: "10%",
            },
        });

        expect(result).toMatchObject({
            status: "loading",
            updatedAt: "2026-06-06T12:00:00Z",
            badge: "10%",
        });
        expect(result.status).toBe("loading");
        if (result.status !== "loading") throw new Error("expected loading DTO");
        expect(result.items?.[0]?.provider).toBe("claude");
    });

    it("state_to_snapshot_dto includes last successful metadata during failed", () => {
        const result: ConnectorSnapshotDTO = state_to_snapshot_dto({
            status: "failed",
            error: "timeout",
            lastSuccess: {
                updatedAt: "2026-06-06T12:00:00Z",
                items: [],
                badge: "10%",
            },
        });

        expect(result).toEqual({
            status: "failed",
            error: "timeout",
            updatedAt: "2026-06-06T12:00:00Z",
            items: [],
            badge: "10%",
        });
    });
});

describe("assert_valid_sender", () => {
    const original_dev = process.env["ELECTRON_RENDERER_URL"];

    afterEach(() => {
        if (original_dev === undefined) delete process.env["ELECTRON_RENDERER_URL"];
        else process.env["ELECTRON_RENDERER_URL"] = original_dev;
    });

    it("rejects empty sender URL", () => {
        const event = { senderFrame: { url: "" } } as unknown as Electron.IpcMainInvokeEvent;
        expect(() => {
            assert_valid_sender(event);
        }).toThrow("IPC not allowed from unknown origin");
    });

    it("rejects about:blank sender", () => {
        const event = {
            senderFrame: { url: "about:blank" },
        } as unknown as Electron.IpcMainInvokeEvent;
        expect(() => {
            assert_valid_sender(event);
        }).toThrow("IPC not allowed from unknown origin");
    });

    it("allows file:// sender (packaged app pages)", () => {
        delete process.env["ELECTRON_RENDERER_URL"];
        const event = {
            senderFrame: { url: "file:///index.html" },
        } as unknown as Electron.IpcMainInvokeEvent;
        expect(() => {
            assert_valid_sender(event);
        }).not.toThrow();
    });

    it("allows dev-server sender matching ELECTRON_RENDERER_URL", () => {
        process.env["ELECTRON_RENDERER_URL"] = "http://localhost:3000";
        const event = {
            senderFrame: { url: "http://localhost:3000/index.html" },
        } as unknown as Electron.IpcMainInvokeEvent;
        expect(() => {
            assert_valid_sender(event);
        }).not.toThrow();
    });

    it("rejects http:// sender when no dev server is configured", () => {
        delete process.env["ELECTRON_RENDERER_URL"];
        const event = {
            senderFrame: { url: "http://localhost:3000" },
        } as unknown as Electron.IpcMainInvokeEvent;
        expect(() => {
            assert_valid_sender(event);
        }).toThrow("Invalid sender protocol");
    });

    it("rejects http:// sender that does not match the dev server", () => {
        process.env["ELECTRON_RENDERER_URL"] = "http://localhost:3000";
        const event = {
            senderFrame: { url: "http://evil.com" },
        } as unknown as Electron.IpcMainInvokeEvent;
        expect(() => {
            assert_valid_sender(event);
        }).toThrow("Invalid sender protocol");
    });
});
