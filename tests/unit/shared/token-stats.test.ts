import { describe, it, expect } from "vitest";
import {
    tokenStatsBucketSchema,
    tokenStatsSessionSchema,
    tokenStatsUpdateSchema,
    tokenStatsConfigSchema,
} from "../../../src/shared/types/token-stats";

const validBucket = {
    source: "claude_code",
    env: "win",
    bucket_date: "2026-07-17",
    model: "claude-sonnet-4-20250514",
    input_tokens: 1500,
    output_tokens: 800,
    cache_read_tokens: 200,
    cache_write_tokens: 100,
    sessions: 3,
    calls: 5,
};

const validSession = {
    id: "sess-abc123",
    source: "claude_code",
    env: "wsl",
    model: "claude-sonnet-4-20250514",
    title: "Fix auth bug",
    directory: "/home/user/project",
    input_tokens: 1000,
    output_tokens: 500,
    cache_read_tokens: 100,
    cache_write_tokens: 50,
    calls: 2,
    started_at: 1752758400000,
    ended_at: 1752762000000,
};

describe("tokenStatsBucketSchema", () => {
    it("accepts valid bucket", () => {
        const result = tokenStatsBucketSchema.safeParse(validBucket);
        expect(result.success).toBe(true);
    });

    it("accepts bucket with zero tokens", () => {
        const result = tokenStatsBucketSchema.safeParse({
            ...validBucket,
            input_tokens: 0,
            output_tokens: 0,
            cache_read_tokens: 0,
            cache_write_tokens: 0,
        });
        expect(result.success).toBe(true);
    });

    it("accepts opencode source", () => {
        const result = tokenStatsBucketSchema.safeParse({
            ...validBucket,
            source: "opencode",
        });
        expect(result.success).toBe(true);
    });

    it("rejects invalid source", () => {
        const result = tokenStatsBucketSchema.safeParse({
            ...validBucket,
            source: "invalid",
        });
        expect(result.success).toBe(false);
    });

    it("rejects missing required fields", () => {
        const result = tokenStatsBucketSchema.safeParse({
            source: "claude_code",
            env: "win",
        });
        expect(result.success).toBe(false);
    });

    it("rejects negative tokens", () => {
        const result = tokenStatsBucketSchema.safeParse({
            ...validBucket,
            input_tokens: -1,
        });
        expect(result.success).toBe(false);
    });
});

describe("tokenStatsSessionSchema", () => {
    it("accepts valid session", () => {
        const result = tokenStatsSessionSchema.safeParse(validSession);
        expect(result.success).toBe(true);
    });

    it("accepts session with null title and directory", () => {
        const result = tokenStatsSessionSchema.safeParse({
            ...validSession,
            title: null,
            directory: null,
        });
        expect(result.success).toBe(true);
    });

    it("rejects missing id", () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _, ...noId } = validSession;
        const result = tokenStatsSessionSchema.safeParse(noId);
        expect(result.success).toBe(false);
    });

    it("rejects missing model", () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { model: _, ...noModel } = validSession;
        const result = tokenStatsSessionSchema.safeParse(noModel);
        expect(result.success).toBe(false);
    });
});

describe("tokenStatsUpdateSchema", () => {
    it("accepts valid update message", () => {
        const result = tokenStatsUpdateSchema.safeParse({
            type: "token_stats_update",
            buckets: [validBucket],
            sessions: [validSession],
        });
        expect(result.success).toBe(true);
    });

    it("accepts empty buckets and sessions", () => {
        const result = tokenStatsUpdateSchema.safeParse({
            type: "token_stats_update",
            buckets: [],
            sessions: [],
        });
        expect(result.success).toBe(true);
    });

    it("rejects wrong type literal", () => {
        const result = tokenStatsUpdateSchema.safeParse({
            type: "other",
            buckets: [],
            sessions: [],
        });
        expect(result.success).toBe(false);
    });
});

describe("tokenStatsConfigSchema", () => {
    it("accepts valid config", () => {
        const result = tokenStatsConfigSchema.safeParse({
            win_home: "C:\\Users\\TestUser",
            wsl_enabled: true,
            wsl_distro: "Ubuntu-22.04",
            wsl_user: "testuser",
            poll_interval_ms: 600000,
        });
        expect(result.success).toBe(true);
    });

    it("applies defaults for optional fields", () => {
        const result = tokenStatsConfigSchema.safeParse({
            win_home: "C:\\Users\\TestUser",
            wsl_enabled: false,
            wsl_user: "testuser",
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.wsl_distro).toBe("Ubuntu-22.04");
            expect(result.data.poll_interval_ms).toBe(600000);
        }
    });

    it("rejects missing win_home", () => {
        const result = tokenStatsConfigSchema.safeParse({
            wsl_enabled: false,
            wsl_user: "testuser",
        });
        expect(result.success).toBe(false);
    });
});
