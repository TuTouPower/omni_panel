import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRuntimeStore } from "../../../src/main/core/scheduler/runtime-store";
import { create_observation_store } from "../../../src/main/core/observation/observation-store";
import { hydrate_runtime_store } from "../../../src/main/core/scheduler/hydrate-runtime-store";
import type { Observation } from "../../../src/shared/types/observation";
import type { ConnectorConfiguration } from "../../../src/shared/types/config";
import type { ConnectorDefinition } from "../../../src/main/core/connector/manifest-loader";
import type { Manifest } from "../../../src/shared/schemas/manifest";

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

function make_observation(overrides: Partial<Observation> = {}): Observation {
    return {
        provider: "brave",
        source_instance_id: "brave-1",
        account_id: "default",
        account_label: "Brave Search",
        metric_id: "brave:monthly_search",
        raw_label: "monthly_search",
        normalized_label: "月度搜索",
        window: "month",
        used: 50,
        limit: 1000,
        display_style: "ratio",
        reset_at: null,
        status: "normal",
        observed_at: Date.now(),
        source: "probe",
        stale: false,
        last_error: null,
        ...overrides,
    };
}

function make_manifest(overrides: Partial<Manifest> = {}): Manifest {
    return {
        id: "brave",
        name: "Brave Search",
        version: "1.0.0",
        capabilities: ["observe"],
        parameters: [],
        ...overrides,
    } as Manifest;
}

function make_definition(overrides: Partial<ConnectorDefinition> = {}): ConnectorDefinition {
    return {
        directory: "/connectors/brave",
        executablePath: "/connectors/brave",
        manifest: make_manifest(),
        ...overrides,
    };
}

function make_connector_config(
    overrides: Partial<ConnectorConfiguration> = {},
): ConnectorConfiguration {
    return {
        instanceId: "brave-1",
        stateId: "brave-1",
        name: "Brave Search",
        enabled: true,
        executablePath: "/connectors/brave",
        refreshIntervalSeconds: 0,
        manualRefreshOnly: true,
        parameterValues: {},
        endpointOverrides: {},
        ...overrides,
    };
}

describe("hydrate_runtime_store", () => {
    let temp_dir: string;

    beforeEach(async () => {
        temp_dir = await mkdtemp(join(tmpdir(), "runtime-hydrate-"));
    });

    afterEach(() => {
        rm(temp_dir, { recursive: true, force: true }).catch(() => undefined);
    });

    it("restores ready state from observation store for manualRefreshOnly connectors", () => {
        const obsStore = create_observation_store(join(temp_dir, "test.db"));
        const runtimeStore = createRuntimeStore();

        obsStore.insert(make_observation({ observed_at: Date.now() - 60000 }));
        obsStore.insert(
            make_observation({
                metric_id: "brave:daily_search",
                raw_label: "daily_search",
                normalized_label: "日搜索",
                observed_at: Date.now(),
            }),
        );

        const config = make_connector_config();
        const definition = make_definition();

        hydrate_runtime_store({
            runtimeStore,
            observationStore: obsStore,
            connectorConfigs: [config],
            definitions: [definition],
        });

        const snap = runtimeStore.getSnapshot("brave-1");
        expect(snap.status).toBe("ready");
        if (snap.status === "ready") {
            expect(snap.items.length).toBe(2);
            expect(snap.items[0]?.provider).toBe("brave");
            expect(snap.updatedAt).toBeInstanceOf(Date);
        }

        obsStore.close();
    });

    it("does not hydrate non-manualRefreshOnly connectors", () => {
        const obsStore = create_observation_store(join(temp_dir, "test.db"));
        const runtimeStore = createRuntimeStore();

        obsStore.insert(make_observation());

        const config = make_connector_config({ manualRefreshOnly: false });
        const definition = make_definition();

        hydrate_runtime_store({
            runtimeStore,
            observationStore: obsStore,
            connectorConfigs: [config],
            definitions: [definition],
        });

        expect(runtimeStore.getSnapshot("brave-1").status).toBe("idle");
        obsStore.close();
    });

    it("leaves connector idle when no observations exist", () => {
        const obsStore = create_observation_store(join(temp_dir, "test.db"));
        const runtimeStore = createRuntimeStore();

        const config = make_connector_config();
        const definition = make_definition();

        hydrate_runtime_store({
            runtimeStore,
            observationStore: obsStore,
            connectorConfigs: [config],
            definitions: [definition],
        });

        expect(runtimeStore.getSnapshot("brave-1").status).toBe("idle");
        obsStore.close();
    });
});
