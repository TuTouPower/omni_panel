/**
 * Shared query contracts for the desktop IPC and LocalAPI adapters.
 *
 * The adapters intentionally stay thin: they decode transport values, call
 * these validators/services, and encode the result back into IPC/HTTP DTOs.
 * Keeping the runtime checks here prevents the two public entry points from
 * accepting different subsets of the same query language.
 */
import {
    valid_directories,
    INVALID_DIRECTORIES_MESSAGE,
} from "../../shared/lib/session_directories";
import type {
    SessionHistoryLoc,
    SessionHistorySearchContentLegacyRequest,
    SessionHistorySearchContentRequest,
    TrendBulkRequest,
} from "../../shared/types/ipc";
import type {
    TokenStatsRecordFilters,
    TokenStatsSessionFilters,
} from "../../shared/types/token-stats";
import type {
    Env,
    QueryOptions,
    SessionQueryFilters,
    SessionRow,
    SessionsProvider,
} from "./session-history/subscription-service";
import { clamp_search_content_range } from "./session-history/search_content_range";

export const CONTENT_SEARCH_PAGE_SIZE = 100;
export const SEARCH_ENUM_CAP = 100_000;
export const QUERY_LIMIT_MIN = 1;
export const QUERY_LIMIT_MAX = 10_000;
export const TREND_DEFAULT_DAYS = 7;

export type QueryValidationCode =
    | "VALIDATION_ERROR"
    | "INVALID_LIMIT"
    | "INVALID_RANGE"
    | "INVALID_DIRECTORIES";

export interface QueryValidationFailure {
    readonly ok: false;
    readonly code: QueryValidationCode;
    readonly message: string;
}

export interface QueryValidationSuccess<T> {
    readonly ok: true;
    readonly value: T;
}

export type QueryValidation<T> = QueryValidationSuccess<T> | QueryValidationFailure;

function ok<T>(value: T): QueryValidationSuccess<T> {
    return { ok: true, value };
}

function fail(
    message: string,
    code: QueryValidationCode = "VALIDATION_ERROR",
): QueryValidationFailure {
    return { ok: false, code, message };
}

function is_record(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function is_non_empty_string(value: unknown): value is string {
    return typeof value === "string" && value.length > 0;
}

function valid_finite_number(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function invalid_limit_message(): string {
    return `limit must be an integer in [${String(QUERY_LIMIT_MIN)}, ${String(QUERY_LIMIT_MAX)}]`;
}

/** Validate a session-history query's optional pagination options. */
export function normalize_session_query_options(value: unknown): QueryValidation<QueryOptions> {
    if (value === undefined || value === null) return ok({});
    if (!is_record(value)) return fail("options must be an object");

    let limit_value: number | undefined;
    let before_cursor_value: QueryOptions["before_cursor"] | undefined;
    if (value["limit"] !== undefined) {
        const limit = value["limit"];
        if (!Number.isInteger(limit) || (limit as number) < QUERY_LIMIT_MIN) {
            return fail("limit must be a positive integer");
        }
        limit_value = limit as number;
    }

    if (value["before_cursor"] !== undefined) {
        const cursor = value["before_cursor"];
        if (cursor === null) {
            before_cursor_value = null;
        } else if (valid_finite_number(cursor)) {
            before_cursor_value = { kind: "pagination", end_index: cursor };
        } else if (
            is_record(cursor) &&
            cursor["kind"] === "pagination" &&
            valid_finite_number(cursor["end_index"])
        ) {
            before_cursor_value = {
                kind: "pagination",
                end_index: cursor["end_index"],
            };
        } else {
            return fail("before_cursor must be a finite pagination cursor");
        }
    }
    return ok({
        ...(limit_value !== undefined ? { limit: limit_value } : {}),
        ...(before_cursor_value !== undefined ? { before_cursor: before_cursor_value } : {}),
    });
}

export interface NormalizedSessionHistoryQuery {
    readonly source: string;
    readonly env: Env;
    readonly session_id: string;
    readonly options: QueryOptions;
}

/** Validate and normalize the positional IPC/HTTP session-history query. */
export function normalize_session_history_query(input: {
    readonly id: unknown;
    readonly source: unknown;
    readonly env: unknown;
    readonly options?: unknown;
}): QueryValidation<NormalizedSessionHistoryQuery> {
    if (!is_non_empty_string(input.id)) return fail("id is required");
    if (!is_non_empty_string(input.source)) return fail("source is required");
    if (!is_non_empty_string(input.env)) return fail("env is required");
    const options = normalize_session_query_options(input.options);
    if (!options.ok) return options;
    return ok({
        source: input.source,
        env: input.env as Env,
        session_id: input.id,
        options: options.value,
    });
}

export interface NormalizedRecentQuery {
    readonly source: string;
    readonly env: Env;
    readonly limit: number;
}

/** Recent is deliberately bounded and requires an explicit limit. */
export function normalize_recent_query(input: {
    readonly source: unknown;
    readonly env: unknown;
    readonly limit: unknown;
}): QueryValidation<NormalizedRecentQuery> {
    if (!is_non_empty_string(input.source)) return fail("source is required");
    if (!is_non_empty_string(input.env)) return fail("env is required");
    if (
        !Number.isInteger(input.limit) ||
        (input.limit as number) < QUERY_LIMIT_MIN ||
        (input.limit as number) > QUERY_LIMIT_MAX
    ) {
        return fail(invalid_limit_message(), "INVALID_LIMIT");
    }
    return ok({
        source: input.source,
        env: input.env as Env,
        limit: input.limit as number,
    });
}

export type SessionHistorySearchRequest =
    | SessionHistorySearchContentRequest
    | SessionHistorySearchContentLegacyRequest;

export function is_legacy_search_request(
    request: SessionHistorySearchRequest,
): request is SessionHistorySearchContentLegacyRequest {
    return "locs" in request;
}

function valid_history_loc(value: unknown): value is SessionHistoryLoc {
    return (
        is_record(value) &&
        is_non_empty_string(value["source"]) &&
        is_non_empty_string(value["env"]) &&
        is_non_empty_string(value["session_id"])
    );
}

/** Validate the shared searchContent wire shape before either adapter touches it. */
export function validate_search_content_request(
    value: unknown,
): QueryValidation<SessionHistorySearchRequest> {
    if (!is_record(value) || typeof value["keyword"] !== "string") {
        return fail("Invalid searchContent request");
    }

    if ("locs" in value) {
        if (!Array.isArray(value["locs"]) || !value["locs"].every(valid_history_loc)) {
            return fail("Invalid searchContent request");
        }
    } else {
        const filters = value["filters"];
        if (!is_record(filters)) return fail("Invalid searchContent request");
        if (
            filters["sources"] !== undefined &&
            (!Array.isArray(filters["sources"]) ||
                !filters["sources"].every((source) => typeof source === "string"))
        ) {
            return fail("Invalid searchContent request");
        }
        for (const key of ["search", "title", "directory"] as const) {
            if (filters[key] !== undefined && typeof filters[key] !== "string") {
                return fail("Invalid searchContent request");
            }
        }
        for (const key of ["start_at", "end_at"] as const) {
            if (filters[key] !== undefined && typeof filters[key] !== "number") {
                return fail("Invalid searchContent request");
            }
        }
    }

    for (const key of ["offset", "limit"] as const) {
        if (value[key] !== undefined && typeof value[key] !== "number") {
            return fail("Invalid searchContent request");
        }
    }
    return ok(value as unknown as SessionHistorySearchRequest);
}

/** Normalizes the summary input while retaining valid locs in their original order. */
export function normalize_summary_locs(value: unknown): QueryValidation<SessionHistoryLoc[]> {
    if (!is_record(value) || !Array.isArray(value["locs"])) {
        return fail("Invalid summaries request");
    }
    return ok(value["locs"].filter(valid_history_loc));
}

export function legacy_session_row(loc: SessionHistoryLoc): SessionRow {
    return {
        id: loc.session_id,
        source: loc.source,
        env: loc.env as Env,
        title: null,
        model: null,
        started_at: 0,
        ended_at: 0,
    };
}

/** Build the provider filters used to enumerate content-search candidates. */
export function search_content_filters(
    request: SessionHistorySearchRequest,
    include_search: boolean,
): SessionQueryFilters {
    if (is_legacy_search_request(request)) return {};
    const filters = request.filters;
    return {
        ...(filters.sources ? { sources: [...filters.sources] } : {}),
        ...(include_search && filters.search ? { search: filters.search } : {}),
        ...(filters.title ? { title: filters.title } : {}),
        ...(filters.directory ? { directory: filters.directory } : {}),
        ...(filters.start_at !== undefined ? { start_at: filters.start_at } : {}),
        ...(filters.end_at !== undefined ? { end_at: filters.end_at } : {}),
    };
}

/** Shared bounded provider enumeration for both IPC and LocalAPI search. */
export function query_all_sessions(
    sessions_provider: SessionsProvider,
    filters: SessionQueryFilters,
): { rows: SessionRow[]; truncated: boolean } {
    const rows: SessionRow[] = [];
    let offset = 0;
    let page = sessions_provider({ ...filters, limit: CONTENT_SEARCH_PAGE_SIZE, offset });
    rows.push(...page);
    while (page.length === CONTENT_SEARCH_PAGE_SIZE && rows.length < SEARCH_ENUM_CAP) {
        offset += CONTENT_SEARCH_PAGE_SIZE;
        page = sessions_provider({ ...filters, limit: CONTENT_SEARCH_PAGE_SIZE, offset });
        rows.push(...page);
    }
    return {
        rows,
        truncated: rows.length >= SEARCH_ENUM_CAP && page.length === CONTENT_SEARCH_PAGE_SIZE,
    };
}

export function content_search_candidates(
    sessions_provider: SessionsProvider,
    request: SessionHistorySearchRequest,
): { rows: SessionRow[]; truncated: boolean } {
    if (is_legacy_search_request(request)) {
        return { rows: request.locs.map(legacy_session_row), truncated: false };
    }
    return query_all_sessions(sessions_provider, search_content_filters(request, false));
}

export function content_search_range(
    total: number,
    request: SessionHistorySearchRequest,
): ReturnType<typeof clamp_search_content_range> {
    return clamp_search_content_range(
        total,
        typeof request.offset === "number" ? request.offset : undefined,
        typeof request.limit === "number" ? request.limit : undefined,
    );
}

export function valid_token_stats_limit(value: unknown): QueryValidation<number | undefined> {
    if (value === undefined) return ok(undefined);
    if (
        !Number.isInteger(value) ||
        (value as number) < QUERY_LIMIT_MIN ||
        (value as number) > QUERY_LIMIT_MAX
    ) {
        return fail(invalid_limit_message(), "INVALID_LIMIT");
    }
    return ok(value as number);
}

function valid_nonnegative_integer_or_undefined(value: unknown): boolean {
    return value === undefined || (Number.isInteger(value) && (value as number) >= 0);
}

function validate_common_session_filters(filters: Record<string, unknown>): QueryValidation<null> {
    const limit = valid_token_stats_limit(filters["limit"]);
    if (!limit.ok) return limit;
    if (
        filters["sources"] !== undefined &&
        (!Array.isArray(filters["sources"]) ||
            !filters["sources"].every((source) => typeof source === "string"))
    ) {
        return fail("sources must be an array of strings");
    }
    for (const key of ["min_tokens", "max_tokens", "min_calls", "max_calls"] as const) {
        if (!valid_nonnegative_integer_or_undefined(filters[key])) {
            return fail(`${key} must be a non-negative integer`, "INVALID_RANGE");
        }
    }
    if (!valid_nonnegative_integer_or_undefined(filters["offset"])) {
        return fail("offset must be a non-negative integer", "INVALID_RANGE");
    }
    return ok(null);
}

export function validate_token_stats_session_filters(filters: unknown): QueryValidation<null> {
    if (filters === undefined || filters === null) return ok(null);
    if (!is_record(filters)) return fail("Invalid token stats session filters");
    const common = validate_common_session_filters(filters);
    if (!common.ok) return common;
    if (!valid_directories(filters["directories"])) {
        return fail(INVALID_DIRECTORIES_MESSAGE, "INVALID_DIRECTORIES");
    }
    return ok(null);
}

export function validate_token_stats_record_filters(filters: unknown): QueryValidation<null> {
    if (filters === undefined || filters === null) return ok(null);
    if (!is_record(filters)) return fail("Invalid token stats record filters");
    for (const key of ["source", "session_id"] as const) {
        if (filters[key] !== undefined && !is_non_empty_string(filters[key])) {
            return fail(`${key} must be a non-empty string`);
        }
    }
    const limit = valid_token_stats_limit(filters["limit"]);
    if (!limit.ok) return limit;
    return ok(null);
}

export interface NormalizedTrendQuery {
    readonly provider: string;
    readonly account_id: string;
    readonly metric_id: string;
    readonly source_instance_id: string;
    readonly days: number;
}

function normalize_trend_days(value: unknown): number {
    const numeric =
        typeof value === "number"
            ? value
            : typeof value === "string" && value.trim() !== ""
              ? Number(value)
              : Number.NaN;
    return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : TREND_DEFAULT_DAYS;
}

export function normalize_trend_query(input: {
    readonly provider: unknown;
    readonly account_id: unknown;
    readonly metric_id: unknown;
    readonly source_instance_id: unknown;
    readonly days?: unknown;
}): QueryValidation<NormalizedTrendQuery> {
    if (!is_non_empty_string(input.provider)) return fail("provider is required");
    if (!is_non_empty_string(input.account_id)) return fail("accountId is required");
    if (!is_non_empty_string(input.metric_id)) return fail("metricId is required");
    if (!is_non_empty_string(input.source_instance_id)) return fail("sourceInstanceId is required");
    return ok({
        provider: input.provider,
        account_id: input.account_id,
        metric_id: input.metric_id,
        source_instance_id: input.source_instance_id,
        days: normalize_trend_days(input.days),
    });
}

export interface NormalizedTrendBulkQuery {
    readonly provider: string;
    readonly account_id: string;
    readonly source_instance_id: string;
    readonly periods: readonly { metric_id: string; days: number }[];
}

export function normalize_trend_bulk_query(
    value: unknown,
): QueryValidation<NormalizedTrendBulkQuery> {
    if (!is_record(value) || !Array.isArray(value["periods"])) {
        return fail("Invalid trend bulk request");
    }
    if (!is_non_empty_string(value["provider"])) return fail("provider is required");
    if (!is_non_empty_string(value["account_id"])) return fail("account_id is required");
    if (!is_non_empty_string(value["source_instance_id"])) {
        return fail("source_instance_id is required");
    }
    const periods: { metric_id: string; days: number }[] = [];
    for (const period of value["periods"]) {
        if (!is_record(period) || !is_non_empty_string(period["metric_id"])) {
            return fail("metric_id is required");
        }
        periods.push({
            metric_id: period["metric_id"],
            days: normalize_trend_days(period["days"]),
        });
    }
    return ok({
        provider: value["provider"],
        account_id: value["account_id"],
        source_instance_id: value["source_instance_id"],
        periods,
    });
}

/**
 * Dashboard adapters both enforce the wire-level invariant that the status
 * object exposes an array, even when an older query worker omitted it.
 */
export function ensure_dashboard_sources_status<T>(dto: T, source_statuses: readonly unknown[]): T {
    if (!is_record(dto) || !is_record(dto["status"])) return dto;
    const status = dto["status"];
    return {
        ...dto,
        status: {
            ...status,
            sources_status: status["sources_status"] ?? [...source_statuses],
        },
    };
}

// Keep the imported wire type referenced in this module's public contract so
// adapters can use this file as the single source for the bulk shape.
export type SharedTrendBulkRequest = TrendBulkRequest;
export type SharedTokenStatsSessionFilters = TokenStatsSessionFilters;
export type SharedTokenStatsRecordFilters = TokenStatsRecordFilters;
