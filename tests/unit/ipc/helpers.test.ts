import { describe, it, expect } from "vitest";
import { ok, fail, toDTO } from "../../../src/main/ipc/helpers";

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

    it("toDTO includes last successful items during loading", () => {
        const result = toDTO({
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

    it("toDTO includes last successful metadata during failed", () => {
        const result = toDTO({
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
