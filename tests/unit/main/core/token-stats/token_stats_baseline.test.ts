import { describe, expect, it } from "vitest";
import {
    generate_synthetic_records,
    run_baseline,
} from "../../../../../scripts/token-stats-baseline";

describe("token-stats-baseline", () => {
    it("generates deterministic records at the requested scale without source data", () => {
        const first = generate_synthetic_records(3);
        const second = generate_synthetic_records(3);
        expect(first).toEqual(second);
        expect(first).toHaveLength(3);
        expect(first[0]).toMatchObject({
            session_id: "synthetic-session-0",
            message_id: "synthetic-message-0",
            title: null,
            directory: null,
        });
        expect(generate_synthetic_records(600_000)).toHaveLength(600_000);
    });

    it("reports all range and filter combinations with stage metrics", () => {
        const report = run_baseline(12_000);
        expect(report.schema_version).toBe(1);
        expect(report.synthetic_record_count).toBe(12_000);
        expect(report.scenarios).toHaveLength(36);
        const scenario_keys = report.scenarios.map(
            (scenario) => `${scenario.range}|${scenario.agent}|${scenario.platform}`,
        );
        const expected_scenario_keys = [
            ...(["24h", "7d", "30d"] as const).flatMap((range) =>
                (["all", ...["claude-code", "opencode", "kimi-code"]] as const).flatMap((agent) =>
                    (["all", "win", "wsl"] as const).map(
                        (platform) => `${range}|${agent}|${platform}`,
                    ),
                ),
            ),
        ];
        expect(new Set(scenario_keys).size).toBe(36);
        expect(new Set(scenario_keys)).toEqual(new Set(expected_scenario_keys));
        expect(new Set(report.scenarios.map((scenario) => scenario.range))).toEqual(
            new Set(["24h", "7d", "30d"]),
        );
        expect(new Set(report.scenarios.map((scenario) => scenario.agent))).toEqual(
            new Set(["all", "claude-code", "opencode", "kimi-code"]),
        );
        expect(new Set(report.scenarios.map((scenario) => scenario.platform))).toEqual(
            new Set(["all", "win", "wsl"]),
        );

        for (const scenario of report.scenarios) {
            const query_names = scenario.query.map((query) => query.name);
            expect(query_names).toEqual(
                scenario.range === "24h"
                    ? ["records", "heatmap", "buckets", "sessions", "hour_buckets", "rollup"]
                    : ["records", "heatmap", "buckets", "sessions", "hour_buckets"],
            );
            expect(scenario.renderer_conversion_ms).toBeGreaterThanOrEqual(0);
            expect(scenario.renderer_output_bytes).toBeGreaterThan(0);
            expect(scenario.total_ms).toBeGreaterThanOrEqual(0);
            for (const query of scenario.query) {
                expect(query.elapsed_ms).toBeGreaterThanOrEqual(0);
                expect(query.row_count).toBeGreaterThan(0);
                expect(query.serialized_bytes).toBeGreaterThan(2);
            }
        }
    });

    it("does not put record content or sensitive fields in the report", () => {
        const report_text = JSON.stringify(run_baseline(12));
        expect(report_text).not.toContain("synthetic-message-0");
        expect(report_text).not.toContain("synthetic-session-0");
        expect(report_text).not.toContain("prompt");
        expect(report_text).not.toContain("secret");
        expect(report_text).not.toContain("directory");
    });
});
