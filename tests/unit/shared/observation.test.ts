import { describe, expect, it } from "vitest";
import {
    observation_ingest_schema,
    observation_schema,
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
