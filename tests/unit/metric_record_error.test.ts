import { describe, expect, it } from "vitest";
import { pluginResultSchema } from "../../src/shared/schemas/plugin-output";

const metric_base = {
    id: "test",
    provider: "claude",
    source: "local" as const,
    sourceInstanceId: "inst1",
    accountId: "acc1",
    accountLabel: "acc1@example.com",
    raw_label: "hourly",
    normalized_label: "小时",
    used: 50,
    limit: 100,
    displayStyle: "ratio" as const,
    resetAt: null,
    status: "unknown" as const,
    observedAt: Date.now(),
    stale: false,
};

describe("MetricRecord error field", () => {
    it("schema accepts optional error field (per-account error)", () => {
        const metric = { ...metric_base, error: "API key expired" };
        const result = pluginResultSchema.parse({
            success: true,
            schemaVersion: 2,
            updatedAt: new Date().toISOString(),
            items: [metric],
        });
        expect(result.success).toBe(true);
        expect((result as { items: { error?: string }[] }).items[0]?.error).toBe("API key expired");
    });

    it("schema accepts metric without error field (backward compat)", () => {
        const metric = { ...metric_base };
        delete (metric as Record<string, unknown>)["error"];
        const result = pluginResultSchema.parse({
            success: true,
            schemaVersion: 2,
            updatedAt: new Date().toISOString(),
            items: [metric],
        });
        expect(result.success).toBe(true);
        expect((result as { items: { error?: string }[] }).items[0]?.error).toBeUndefined();
    });
});
