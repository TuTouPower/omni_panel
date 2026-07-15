import { describe, expect, it } from "vitest";
import {
    observation_ingest_schema,
    observation_schema,
    script_observation_schema,
} from "../../../src/shared/schemas/observation";

const valid_observation = {
    provider: "claude",
    source_instance_id: "main",
    account_id: "acc-1",
    account_label: "Personal",
    metric_id: "tokens",
    raw_label: "daily_tokens",
    normalized_label: "Daily tokens",
    window: "day",
    cycleDurationMs: 24 * 3600 * 1000,
    used: 1000,
    limit: 10000,
    display_style: "percent",
    reset_at: 1700000000,
    status: "normal",
    observed_at: 1700000000,
    source: "poll",
    stale: false,
    last_error: null,
};

describe("observation_schema", () => {
    it("accepts a valid observation", () => {
        const result = observation_schema.safeParse(valid_observation);
        expect(result.success).toBe(true);
    });

    it("accepts cycleDurationMs as null", () => {
        const result = observation_schema.safeParse({
            ...valid_observation,
            cycleDurationMs: null,
        });
        expect(result.success).toBe(true);
        expect(result.data?.cycleDurationMs).toBeNull();
    });

    it("accepts cycleDurationMs as a finite number", () => {
        const result = observation_schema.safeParse({
            ...valid_observation,
            cycleDurationMs: 7 * 24 * 3600 * 1000,
        });
        expect(result.success).toBe(true);
        expect(result.data?.cycleDurationMs).toBe(7 * 24 * 3600 * 1000);
    });

    it("rejects non-finite cycleDurationMs", () => {
        const result = observation_schema.safeParse({
            ...valid_observation,
            cycleDurationMs: Infinity,
        });
        expect(result.success).toBe(false);
    });

    it("rejects empty provider", () => {
        const result = observation_schema.safeParse({
            ...valid_observation,
            provider: "",
        });
        expect(result.success).toBe(false);
    });

    it("rejects invalid window", () => {
        const result = observation_schema.safeParse({
            ...valid_observation,
            window: "hour",
        });
        expect(result.success).toBe(false);
    });

    it("rejects invalid source", () => {
        const result = observation_schema.safeParse({
            ...valid_observation,
            source: "magic",
        });
        expect(result.success).toBe(false);
    });

    it("accepts null used and limit", () => {
        const result = observation_schema.safeParse({
            ...valid_observation,
            used: null,
            limit: null,
        });
        expect(result.success).toBe(true);
    });
});

describe("observation_ingest_schema", () => {
    it("accepts object without observed_at, stale, last_error", () => {
        const input = Object.fromEntries(
            Object.entries(valid_observation).filter(
                ([k]) => k !== "observed_at" && k !== "stale" && k !== "last_error",
            ),
        );
        const result = observation_ingest_schema.safeParse(input);
        expect(result.success).toBe(true);
    });

    it("rejects object missing required source", () => {
        const input = Object.fromEntries(
            Object.entries(valid_observation).filter(
                ([k]) =>
                    k !== "observed_at" && k !== "stale" && k !== "last_error" && k !== "source",
            ),
        );
        const result = observation_ingest_schema.safeParse(input);
        expect(result.success).toBe(false);
    });
});

describe("script_observation_schema (connector output contract)", () => {
    it("accepts script output WITHOUT source_instance_id (instance identity is host authority)", () => {
        const script_output = Object.fromEntries(
            Object.entries(valid_observation).filter(([k]) => k !== "source_instance_id"),
        );
        const result = script_observation_schema.safeParse(script_output);
        expect(result.success).toBe(true);
        expect(result.success && result.data).not.toHaveProperty("source_instance_id");
    });

    it("strips source_instance_id if a legacy connector still emits it", () => {
        const result = script_observation_schema.safeParse(valid_observation);
        expect(result.success).toBe(true);
        expect(result.success && result.data).not.toHaveProperty("source_instance_id");
    });
});

describe("observation_schema (host-stamped)", () => {
    it("requires source_instance_id — connectors cannot produce a stored observation without it", () => {
        const without_instance = Object.fromEntries(
            Object.entries(valid_observation).filter(([k]) => k !== "source_instance_id"),
        );
        expect(observation_schema.safeParse(without_instance).success).toBe(false);
    });
});
