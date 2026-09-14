import { describe, expect, it, vi } from "vitest";
import {
    CONTENT_SEARCH_PAGE_SIZE,
    QUERY_LIMIT_MAX,
    SEARCH_ENUM_CAP,
    TREND_DEFAULT_DAYS,
    content_search_candidates,
    normalize_recent_query,
    normalize_session_history_query,
    normalize_summary_locs,
    normalize_trend_query,
    validate_search_content_request,
    validate_token_stats_record_filters,
    validate_token_stats_session_filters,
} from "../../../src/main/core/query-contract";
import type { SessionsProvider } from "../../../src/main/core/session-history/subscription-service";

describe("shared query contract (t476)", () => {
    it("keeps the public constants single and bounded", () => {
        expect(CONTENT_SEARCH_PAGE_SIZE).toBe(100);
        expect(SEARCH_ENUM_CAP).toBe(100_000);
        expect(QUERY_LIMIT_MAX).toBe(10_000);
        expect(TREND_DEFAULT_DAYS).toBe(7);
    });

    it.each([
        [undefined, true],
        [{ limit: 1, before_cursor: { kind: "pagination", end_index: 3 } }, true],
        [{ limit: 0 }, false],
        [{ limit: 1.5 }, false],
        [{ before_cursor: Number.NaN }, false],
    ])("normalizes query input %j", (options, valid) => {
        const result = normalize_session_history_query({
            id: "session-1",
            source: "claude_code",
            env: "linux",
            options,
        });
        expect(result.ok).toBe(valid);
    });

    it("uses the same recent boundary for missing, zero, and maximum limits", () => {
        expect(
            normalize_recent_query({ source: "claude_code", env: "linux", limit: undefined }).ok,
        ).toBe(false);
        expect(normalize_recent_query({ source: "claude_code", env: "linux", limit: 0 }).ok).toBe(
            false,
        );
        expect(
            normalize_recent_query({ source: "claude_code", env: "linux", limit: QUERY_LIMIT_MAX })
                .ok,
        ).toBe(true);
        expect(
            normalize_recent_query({
                source: "claude_code",
                env: "linux",
                limit: QUERY_LIMIT_MAX + 1,
            }).ok,
        ).toBe(false);
    });

    it("validates searchContent once and applies the same paging provider calls", () => {
        const provider = vi.fn<SessionsProvider>((filters) => {
            const offset = typeof filters === "object" ? (filters.offset ?? 0) : 0;
            return offset === 0
                ? [
                      {
                          id: "s1",
                          source: "claude_code",
                          env: "linux",
                          title: null,
                          model: null,
                          started_at: 1,
                          ended_at: 2,
                      },
                  ]
                : [];
        });
        const request = {
            filters: { sources: ["claude_code"], title: "alpha" },
            keyword: "hello",
            offset: 0,
            limit: 1,
        };
        const validated = validate_search_content_request(request);
        expect(validated.ok).toBe(true);
        if (!validated.ok) return;
        const candidates = content_search_candidates(provider, validated.value);
        expect(candidates.rows.map((row) => row.id)).toEqual(["s1"]);
        expect(provider).toHaveBeenCalledWith({
            sources: ["claude_code"],
            title: "alpha",
            limit: CONTENT_SEARCH_PAGE_SIZE,
            offset: 0,
        });
        expect(
            validate_search_content_request({ filters: { sources: 5 }, keyword: "hello" }).ok,
        ).toBe(false);
    });

    it("skips malformed summary locs but rejects a malformed locs container", () => {
        const normalized = normalize_summary_locs({
            locs: [
                null,
                { source: "", env: "linux", session_id: "empty" },
                { source: "claude_code", env: "linux", session_id: "s1" },
            ],
        });
        expect(normalized).toEqual({
            ok: true,
            value: [{ source: "claude_code", env: "linux", session_id: "s1" }],
        });
        expect(normalize_summary_locs({ locs: "nope" }).ok).toBe(false);
    });

    it("shares token-stat limit/range validation and trend defaults", () => {
        expect(validate_token_stats_session_filters({ limit: 0 }).ok).toBe(false);
        expect(validate_token_stats_record_filters({ limit: QUERY_LIMIT_MAX + 1 }).ok).toBe(false);
        expect(
            validate_token_stats_record_filters({
                source: "codex",
                session_id: "session-1",
                limit: 10,
            }).ok,
        ).toBe(true);
        expect(validate_token_stats_record_filters({ session_id: "" }).ok).toBe(false);
        expect(validate_token_stats_session_filters({ limit: 10, offset: 0 }).ok).toBe(true);
        expect(
            normalize_trend_query({
                provider: "claude",
                account_id: "account",
                metric_id: "tokens",
                source_instance_id: "instance",
            }),
        ).toMatchObject({ ok: true, value: { days: TREND_DEFAULT_DAYS } });
        expect(
            normalize_trend_query({
                provider: "claude",
                account_id: "account",
                metric_id: "tokens",
                source_instance_id: "instance",
                days: 2.9,
            }),
        ).toMatchObject({ ok: true, value: { days: 2 } });
        expect(
            normalize_trend_query({
                provider: "",
                account_id: "account",
                metric_id: "tokens",
                source_instance_id: "instance",
            }),
        ).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    });
});
