import { describe, expect, it } from "vitest";
import { observation_to_metric_record } from "../../src/main/core/scheduler/observation-mapping";

const obs_base = {
    id: "obs1",
    provider: "claude",
    source_instance_id: "inst1",
    account_id: "acc1",
    account_label: "Primary",
    metric_id: "daily",
    raw_label: "daily",
    normalized_label: "日",
    used: 50,
    limit: 100,
    window: "month" as const,
    display_style: "percent" as const,
    reset_at: null,
    cycle_duration_ms: null,
    status: "unknown" as const,
    observed_at: Date.now(),
    source: "local" as const,
    stale: false,
    last_error: null,
};

describe("observation_to_metric_record error mapping", () => {
    it("maps last_error to MetricRecord.error when present", () => {
        const obs = { ...obs_base, last_error: "API key expired" };
        const rec = observation_to_metric_record(obs);
        expect(rec).not.toBeNull();
        expect(rec?.error).toBe("API key expired");
    });

    it("omits error when last_error is null", () => {
        const obs = { ...obs_base, last_error: null };
        const rec = observation_to_metric_record(obs);
        expect(rec).not.toBeNull();
        expect(rec?.error).toBeUndefined();
    });

    it("omits error when last_error absent (pre-existing observations)", () => {
        const obs = { ...obs_base };
        delete (obs as Record<string, unknown>)["last_error"];
        const rec = observation_to_metric_record(obs);
        expect(rec).not.toBeNull();
        expect(rec?.error).toBeUndefined();
    });
});
