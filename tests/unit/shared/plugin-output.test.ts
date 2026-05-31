import { describe, it, expect } from "vitest";
import { pluginSuccessOutputSchema } from "../../../src/shared/schemas/plugin-output";

const validOutput = {
    success: true,
    schemaVersion: 2,
    updatedAt: "2026-05-31T00:00:00.000Z",
    items: [
        {
            id: "tokens",
            provider: "claude",
            source: "direct",
            sourceInstanceId: "claude-direct",
            accountId: "account-1",
            accountLabel: "Claude Account",
            name: "Tokens",
            used: 100,
            limit: 1000,
            displayStyle: "percent",
        },
    ],
};

describe("pluginSuccessOutputSchema", () => {
    it("accepts schemaVersion 2 success output with provider metadata", () => {
        const result = pluginSuccessOutputSchema.safeParse(validOutput);

        expect(result.success).toBe(true);
    });

    it("rejects schemaVersion 1 success output", () => {
        const result = pluginSuccessOutputSchema.safeParse({
            ...validOutput,
            schemaVersion: 1,
        });

        expect(result.success).toBe(false);
    });

    it("rejects item without provider metadata", () => {
        const result = pluginSuccessOutputSchema.safeParse({
            ...validOutput,
            items: [
                {
                    id: "tokens",
                    name: "Tokens",
                    used: 100,
                    limit: 1000,
                    displayStyle: "percent",
                },
            ],
        });

        expect(result.success).toBe(false);
    });

    it("rejects cpa provider", () => {
        const result = pluginSuccessOutputSchema.safeParse({
            ...validOutput,
            items: [
                {
                    ...validOutput.items[0],
                    provider: "cpa",
                },
            ],
        });

        expect(result.success).toBe(false);
    });
});
