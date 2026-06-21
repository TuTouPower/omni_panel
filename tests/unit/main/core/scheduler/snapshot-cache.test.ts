import { describe, it, expect } from "vitest";
import {
    serialize_state,
    deserialize_entry,
} from "../../../../../src/main/core/scheduler/snapshot-cache";
import type { ConnectorSnapshotState } from "../../../../../src/main/core/scheduler/types";

describe("snapshot-cache serialization", () => {
    it("round-trips a ready state", () => {
        const state: ConnectorSnapshotState = {
            status: "ready",
            items: [
                {
                    id: "acc:1",
                    provider: "claude",
                    source: "gateway",
                    sourceInstanceId: "cpa-main",
                    accountId: "acc-1",
                    accountLabel: "Pro",
                    raw_label: "pro",
                    normalized_label: "Pro",
                    used: 10,
                    limit: 100,
                    displayStyle: "percent",
                    resetAt: null,
                    status: "normal",
                    observedAt: 1736947200000,
                    stale: false,
                },
            ],
            updatedAt: new Date("2026-01-15T12:00:00Z"),
        };

        const entry = serialize_state("cpa-main", state);
        expect(entry.status).toBe("ready");
        expect(entry.instanceId).toBe("cpa-main");

        if (entry.status === "ready") {
            expect(typeof entry.updatedAt).toBe("string");
        }

        const restored = deserialize_entry(entry);
        expect(restored.status).toBe("ready");
        if (restored.status === "ready") {
            expect(restored.updatedAt).toBeInstanceOf(Date);
            expect(restored.updatedAt.toISOString()).toBe("2026-01-15T12:00:00.000Z");
            expect(restored.items).toEqual(state.items);
        }
    });

    it("round-trips a failed state with lastSuccess", () => {
        const state: ConnectorSnapshotState = {
            status: "failed",
            error: "network timeout",
            lastSuccess: {
                updatedAt: "2026-01-14T08:00:00Z",
                items: [],
            },
        };

        const entry = serialize_state("deepseek-key", state);
        const restored = deserialize_entry(entry);
        expect(restored.status).toBe("failed");
        if (restored.status === "failed") {
            expect(restored.error).toBe("network timeout");
            expect(restored.lastSuccess?.updatedAt).toBe("2026-01-14T08:00:00Z");
        }
    });

    it("round-trips an idle state", () => {
        const state: ConnectorSnapshotState = { status: "idle" };
        const entry = serialize_state("x", state);
        const restored = deserialize_entry(entry);
        expect(restored).toEqual({ status: "idle" });
    });

    it("round-trips a loading state with lastSuccess", () => {
        const state: ConnectorSnapshotState = {
            status: "loading",
            lastSuccess: {
                updatedAt: "2026-01-14T08:00:00Z",
                items: [
                    {
                        id: "i",
                        provider: "deepseek",
                        source: "poll",
                        sourceInstanceId: "s",
                        accountId: "a",
                        accountLabel: "L",
                        raw_label: "r",
                        normalized_label: "N",
                        used: 1,
                        limit: 10,
                        displayStyle: "ratio",
                        resetAt: null,
                        status: "normal",
                        observedAt: 1736860800000,
                        stale: false,
                    },
                ],
            },
        };

        const entry = serialize_state("s", state);
        const restored = deserialize_entry(entry);
        expect(restored.status).toBe("loading");
        if (restored.status === "loading") {
            expect(restored.lastSuccess?.items).toHaveLength(1);
            expect(restored.lastSuccess?.updatedAt).toBe("2026-01-14T08:00:00Z");
        }
    });
});
