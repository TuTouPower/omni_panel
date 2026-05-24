import { describe, it, expect } from "vitest";
import { createRuntimeStore } from "../../../src/main/core/scheduler/runtime-store";

describe("runtime-store", () => {
    it("returns idle for unknown instance", () => {
        const store = createRuntimeStore();
        expect(store.getSnapshot("unknown")).toEqual({ status: "idle" });
    });

    it("transitions idle → loading → ready", () => {
        const store = createRuntimeStore();
        store.updateState("p1", { status: "loading" });
        expect(store.getSnapshot("p1")).toEqual({ status: "loading" });

        const now = new Date();
        store.updateState("p1", { status: "ready", items: [], updatedAt: now });
        const snap = store.getSnapshot("p1");
        expect(snap.status).toBe("ready");
    });

    it("transitions idle → loading → failed", () => {
        const store = createRuntimeStore();
        store.updateState("p1", { status: "loading" });
        store.updateState("p1", { status: "failed", error: "timeout" });
        const snap = store.getSnapshot("p1");
        expect(snap.status).toBe("failed");
        if (snap.status === "failed") {
            expect(snap.error).toBe("timeout");
        }
    });

    it("preserves lastSuccess on failure after success", () => {
        const store = createRuntimeStore();
        const cached = { updatedAt: "2026-05-24T12:00:00Z", items: [] };
        store.updateState("p1", { status: "ready", items: [], updatedAt: new Date() });
        store.updateState("p1", { status: "failed", error: "err", lastSuccess: cached });
        const snap = store.getSnapshot("p1");
        if (snap.status === "failed") {
            expect(snap.lastSuccess).toBeDefined();
        }
    });

    it("notifies subscribers", () => {
        const store = createRuntimeStore();
        const calls: { id: string; status: string }[] = [];
        store.subscribe({
            onStateChange(id, state) {
                calls.push({ id, status: state.status });
            },
        });
        store.updateState("p1", { status: "loading" });
        expect(calls).toHaveLength(1);
        expect(calls[0]?.id).toBe("p1");
    });

    it("unsubscribe stops notifications", () => {
        const store = createRuntimeStore();
        let count = 0;
        const unsub = store.subscribe({
            onStateChange: () => {
                count++;
            },
        });
        store.updateState("p1", { status: "loading" });
        expect(count).toBe(1);
        unsub();
        store.updateState("p1", { status: "failed", error: "e" });
        expect(count).toBe(1);
    });

    it("getAll returns all states", () => {
        const store = createRuntimeStore();
        store.updateState("a", { status: "loading" });
        store.updateState("b", { status: "loading" });
        const all = store.getAll();
        expect(all.size).toBe(2);
        expect(all.has("a")).toBe(true);
        expect(all.has("b")).toBe(true);
    });
});
