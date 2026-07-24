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
            source: "poll",
            sourceInstanceId: "claude-poll",
            accountId: "account-1",
            accountLabel: "Claude Account",
            raw_label: "tokens",
            normalized_label: "Tokens",
            used: 100,
            limit: 1000,
            displayStyle: "percent",
            resetAt: null,
            observedAt: 1748131200000,
            stale: false,
        },
    ],
};

describe("pluginSuccessOutputSchema", () => {
    it("accepts schemaVersion 2 success output with provider metadata", () => {
        const result = pluginSuccessOutputSchema.safeParse(validOutput);

        expect(result.success).toBe(true);
    });

    it("accepts provider opencode_go", () => {
        const result = pluginSuccessOutputSchema.safeParse({
            ...validOutput,
            items: [
                {
                    ...validOutput.items[0],
                    id: "opencode_go:rolling",
                    provider: "opencode_go",
                    source: "session",
                    sourceInstanceId: "opencode-go-1",
                    accountId: "opencode-go-1",
                    accountLabel: "OpenCode Go",
                    raw_label: "rolling",
                    normalized_label: "滚动",
                },
            ],
        });

        expect(result.success).toBe(true);
    });

    it("rejects schemaVersion 1 success output", () => {
        const result = pluginSuccessOutputSchema.safeParse({
            ...validOutput,
            schemaVersion: 1,
        });

        expect(result.success).toBe(false);
    });

    it("rejects negative cycleDurationMs (host >=0 contract)", () => {
        const base_item = validOutput.items[0];
        const result = pluginSuccessOutputSchema.safeParse({
            ...validOutput,
            items: base_item ? [{ ...base_item, cycleDurationMs: -1000 }] : [],
        });

        expect(result.success).toBe(false);
    });

    it("accepts zero and positive cycleDurationMs", () => {
        const base_item = validOutput.items[0];
        if (!base_item) throw new Error("fixture missing base item");
        const zero = pluginSuccessOutputSchema.safeParse({
            ...validOutput,
            items: [{ ...base_item, cycleDurationMs: 0 }],
        });
        const positive = pluginSuccessOutputSchema.safeParse({
            ...validOutput,
            items: [{ ...base_item, cycleDurationMs: 86400_000 }],
        });

        expect(zero.success).toBe(true);
        expect(positive.success).toBe(true);
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

    it("accepts arbitrary snake_case provider (t095 open namespace)", () => {
        const result = pluginSuccessOutputSchema.safeParse({
            ...validOutput,
            items: [
                {
                    ...validOutput.items[0],
                    provider: "custom_vendor",
                },
            ],
        });

        expect(result.success).toBe(true);
    });

    it("accepts raw_label and normalized_label on usage items", () => {
        const result = pluginSuccessOutputSchema.safeParse({
            ...validOutput,
            items: [
                {
                    ...validOutput.items[0],
                    raw_label: "five_hour",
                    normalized_label: "5小时",
                },
            ],
        });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.items[0]?.raw_label).toBe("five_hour");
            expect(result.data.items[0]?.normalized_label).toBe("5小时");
        }
    });

    it("accepts optional display_label on usage items", () => {
        const result = pluginSuccessOutputSchema.safeParse({
            ...validOutput,
            items: [
                {
                    ...validOutput.items[0],
                    raw_label: "five_hour",
                    normalized_label: "5小时",
                    display_label: "我的 5h",
                },
            ],
        });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.items[0]?.display_label).toBe("我的 5h");
        }
    });

    it("rejects item missing normalized_label", () => {
        const result = pluginSuccessOutputSchema.safeParse({
            ...validOutput,
            items: [
                {
                    id: "tokens",
                    provider: "claude",
                    source: "poll",
                    sourceInstanceId: "claude-poll",
                    accountId: "account-1",
                    accountLabel: "Claude Account",
                    raw_label: "five_hour",
                    used: 100,
                    limit: 1000,
                    displayStyle: "percent",
                },
            ],
        });

        expect(result.success).toBe(false);
    });

    it("rejects item missing raw_label", () => {
        const result = pluginSuccessOutputSchema.safeParse({
            ...validOutput,
            items: [
                {
                    id: "tokens",
                    provider: "claude",
                    source: "poll",
                    sourceInstanceId: "claude-poll",
                    accountId: "account-1",
                    accountLabel: "Claude Account",
                    normalized_label: "5小时",
                    used: 100,
                    limit: 1000,
                    displayStyle: "percent",
                },
            ],
        });

        expect(result.success).toBe(false);
    });
});
