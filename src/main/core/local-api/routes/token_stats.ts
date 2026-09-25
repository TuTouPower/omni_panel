import type { ServerResponse } from "node:http";
import type { TokenStatsStore } from "../../token-stats/token-stats-store";
import type { TokenStatsQueryDispatcher } from "../../token-stats/query-dispatcher";
import type { TokenStatsEnv, TokenStatsSessionFilters } from "../../../../shared/types/token-stats";
import {
    tokenStatsDashboardDtoSchema,
    tokenStatsDashboardQuerySchema,
    tokenStatsDashboardSessionsDtoSchema,
    tokenStatsDashboardSessionsQuerySchema,
} from "../../../../shared/types/token-stats";
import {
    ensure_dashboard_sources_status,
    validate_token_stats_record_filters,
    validate_token_stats_session_filters,
} from "../../query-contract";
import {
    valid_directories,
    INVALID_DIRECTORIES_MESSAGE,
} from "../../../../shared/lib/session_directories";
import { json_response, parse_int_param, InvalidParamError } from "../http_helpers";

export interface TokenStatsDeps {
    readonly store: TokenStatsStore;
    readonly running: () => boolean;
    readonly query_dispatcher?: TokenStatsQueryDispatcher | undefined;
}

export async function handle_web_read(
    url: URL,
    res: ServerResponse,
    deps: TokenStatsDeps,
): Promise<boolean> {
    const params = url.searchParams;
    const env = params.get("env");
    const agent = params.get("agent");
    const model = params.get("model");
    try {
        return await handle_web_read_inner(url, res, deps, params, env, agent, model);
    } catch (err) {
        if (
            (err instanceof InvalidParamError ||
                (err instanceof Error && err.name === "InvalidParamError")) &&
            err instanceof Error
        ) {
            json_response(res, 400, { error: err.message });
            return true;
        }
        throw err;
    }
}

async function handle_web_read_inner(
    url: URL,
    res: ServerResponse,
    deps: TokenStatsDeps,
    params: URLSearchParams,
    env: string | null,
    agent: string | null,
    model: string | null,
): Promise<boolean> {
    const { store, running, query_dispatcher } = deps;
    switch (url.pathname) {
        case "/v1/dashboard": {
            let dir_aliases: unknown;
            let model_aliases: unknown;
            const dir_aliases_raw = params.get("dir_aliases");
            const model_aliases_raw = params.get("model_aliases");
            try {
                dir_aliases = dir_aliases_raw ? JSON.parse(dir_aliases_raw) : undefined;
                model_aliases = model_aliases_raw ? JSON.parse(model_aliases_raw) : undefined;
            } catch {
                json_response(res, 400, { error: "Invalid dashboard query" });
                return true;
            }
            const parsed_query = tokenStatsDashboardQuerySchema.safeParse({
                agent: params.get("agent"),
                platform: params.get("platform"),
                start: Number(params.get("start")),
                end: Number(params.get("end")),
                metric: params.get("metric"),
                xaxis: params.get("xaxis"),
                gran: params.get("gran"),
                ...(model ? { model } : {}),
                ...(params.has("session_offset")
                    ? { session_offset: Number(params.get("session_offset")) }
                    : {}),
                ...(params.has("session_limit")
                    ? { session_limit: Number(params.get("session_limit")) }
                    : {}),
                ...(dir_aliases !== undefined ? { dir_aliases } : {}),
                ...(model_aliases !== undefined ? { model_aliases } : {}),
            });
            if (!parsed_query.success) {
                json_response(res, 400, { error: "Invalid dashboard query" });
                return true;
            }
            const query = parsed_query.data;
            try {
                const status = {
                    running: running(),
                    last_updated: store.last_updated(),
                    sources_status: store.sources_status(),
                };
                const dto = query_dispatcher
                    ? await query_dispatcher.request_dashboard(query, status)
                    : store.query_dashboard(query, status);
                const dto_with_status = ensure_dashboard_sources_status(dto, status.sources_status);
                const parsed_dto = tokenStatsDashboardDtoSchema.safeParse(dto_with_status);
                if (!parsed_dto.success) {
                    json_response(res, 500, { error: "Invalid dashboard response" });
                    return true;
                }
                json_response(res, 200, parsed_dto.data);
            } catch {
                json_response(res, 500, { error: "Dashboard query failed" });
            }
            return true;
        }
        case "/v1/dashboard/sessions": {
            const parsed_query = tokenStatsDashboardSessionsQuerySchema.safeParse({
                agent: params.get("agent"),
                platform: params.get("platform"),
                start: Number(params.get("start")),
                end: Number(params.get("end")),
                ...(model ? { model } : {}),
                ...(params.has("session_offset")
                    ? { session_offset: Number(params.get("session_offset")) }
                    : {}),
                ...(params.has("session_limit")
                    ? { session_limit: Number(params.get("session_limit")) }
                    : {}),
            });
            if (!parsed_query.success) {
                json_response(res, 400, { error: "Invalid dashboard sessions query" });
                return true;
            }
            try {
                const dto = store.query_dashboard_sessions(parsed_query.data);
                const parsed_dto = tokenStatsDashboardSessionsDtoSchema.safeParse(dto);
                if (!parsed_dto.success) {
                    json_response(res, 500, { error: "Invalid dashboard sessions response" });
                    return true;
                }
                json_response(res, 200, parsed_dto.data);
            } catch {
                json_response(res, 500, { error: "Dashboard sessions query failed" });
            }
            return true;
        }
        case "/v1/records": {
            const rec_start = parse_int_param(params, "start");
            const rec_end = parse_int_param(params, "end");
            const record_source = params.get("source");
            const record_session_id = params.get("session_id");
            let record_limit: number | undefined;
            if (params.has("limit")) {
                const raw_limit = params.get("limit") ?? "";
                const parsed_limit = raw_limit.trim() === "" ? Number.NaN : Number(raw_limit);
                const validated_limit = validate_token_stats_record_filters({
                    limit: parsed_limit,
                    ...(params.has("source") ? { source: record_source } : {}),
                    ...(params.has("session_id") ? { session_id: record_session_id } : {}),
                });
                if (!validated_limit.ok) {
                    json_response(res, 400, {
                        error: validated_limit.message,
                        code: validated_limit.code,
                    });
                    return true;
                }
                record_limit = parsed_limit;
            } else {
                const validated_filters = validate_token_stats_record_filters({
                    ...(params.has("source") ? { source: record_source } : {}),
                    ...(params.has("session_id") ? { session_id: record_session_id } : {}),
                });
                if (!validated_filters.ok) {
                    json_response(res, 400, {
                        error: validated_filters.message,
                        code: validated_filters.code,
                    });
                    return true;
                }
            }
            json_response(
                res,
                200,
                store.query_records({
                    ...(agent
                        ? {
                              agent: agent as
                                  | "claude-code"
                                  | "opencode"
                                  | "kimi-code"
                                  | "grok"
                                  | "codex"
                                  | "commandcode",
                          }
                        : {}),
                    ...(env ? { env: env as TokenStatsEnv } : {}),
                    ...(record_source ? { source: record_source } : {}),
                    ...(record_session_id ? { session_id: record_session_id } : {}),
                    ...(rec_start !== null ? { start: rec_start } : {}),
                    ...(rec_end !== null ? { end: rec_end } : {}),
                    ...(record_limit !== undefined ? { limit: record_limit } : {}),
                }),
            );
            return true;
        }
        case "/v1/heatmap": {
            const hm_start = parse_int_param(params, "start");
            const hm_end = parse_int_param(params, "end");
            json_response(
                res,
                200,
                store.query_heatmap({
                    ...(agent
                        ? {
                              agent: agent as
                                  | "claude-code"
                                  | "opencode"
                                  | "kimi-code"
                                  | "grok"
                                  | "codex"
                                  | "commandcode",
                          }
                        : {}),
                    ...(env ? { env: env as TokenStatsEnv } : {}),
                    ...(model ? { model } : {}),
                    ...(hm_start !== null ? { start: hm_start } : {}),
                    ...(hm_end !== null ? { end: hm_end } : {}),
                }),
            );
            return true;
        }
        case "/v1/hourBuckets": {
            const hb_start = parse_int_param(params, "start");
            const hb_end = parse_int_param(params, "end");
            json_response(
                res,
                200,
                store.query_hour_buckets({
                    ...(agent
                        ? {
                              agent: agent as
                                  | "claude-code"
                                  | "opencode"
                                  | "kimi-code"
                                  | "grok"
                                  | "codex"
                                  | "commandcode",
                          }
                        : {}),
                    ...(env ? { env: env as TokenStatsEnv } : {}),
                    ...(model ? { model } : {}),
                    ...(hb_start !== null ? { start: hb_start } : {}),
                    ...(hb_end !== null ? { end: hb_end } : {}),
                }),
            );
            return true;
        }
        case "/v1/rollup": {
            const rl_start = parse_int_param(params, "start");
            const rl_end = parse_int_param(params, "end");
            json_response(
                res,
                200,
                store.query_range_rollup({
                    ...(agent
                        ? {
                              agent: agent as
                                  | "claude-code"
                                  | "opencode"
                                  | "kimi-code"
                                  | "grok"
                                  | "codex"
                                  | "commandcode",
                          }
                        : {}),
                    ...(env ? { env: env as TokenStatsEnv } : {}),
                    ...(model ? { model } : {}),
                    ...(rl_start !== null ? { start: rl_start } : {}),
                    ...(rl_end !== null ? { end: rl_end } : {}),
                }),
            );
            return true;
        }
        case "/v1/sessions": {
            const sources = params.get("sources");
            const filters: TokenStatsSessionFilters = {};
            const source = params.get("source");
            const search = params.get("search");
            const order_by = params.get("order_by");
            const direction = params.get("direction");
            if (source) filters.source = source;
            if (sources) filters.sources = sources.split(",").filter((item) => item.length > 0);
            if (env) filters.env = env;
            if (search) filters.search = search;
            const title = params.get("title");
            const directory = params.get("directory");
            if (title) filters.title = title;
            if (directory) filters.directory = directory;
            const directories = params.getAll("directories").filter((d) => d.length > 0);
            if (!valid_directories(directories)) {
                json_response(res, 400, {
                    code: "INVALID_DIRECTORIES",
                    message: INVALID_DIRECTORIES_MESSAGE,
                });
                return true;
            }
            if (directories.length > 0) filters.directories = directories;
            if (params.has("start_at")) {
                const start_at = parse_int_param(params, "start_at", { require_present: true });
                if (start_at !== null) filters.start_at = start_at;
            }
            if (params.has("end_at")) {
                const end_at = parse_int_param(params, "end_at", { require_present: true });
                if (end_at !== null) filters.end_at = end_at;
            }
            for (const range_key of [
                "min_tokens",
                "max_tokens",
                "min_calls",
                "max_calls",
            ] as const) {
                if (params.has(range_key)) {
                    const bound = parse_int_param(params, range_key, {
                        require_present: true,
                        min: 0,
                    });
                    if (bound !== null) filters[range_key] = bound;
                }
            }
            if (
                order_by === "ended_at" ||
                order_by === "tokens" ||
                order_by === "calls" ||
                order_by === "started_at" ||
                order_by === "title"
            ) {
                filters.order_by = order_by;
            }
            if (direction === "asc" || direction === "desc") filters.direction = direction;
            if (params.has("limit")) {
                const limit = parse_int_param(params, "limit", { require_present: true });
                if (limit !== null) filters.limit = limit;
            }
            if (params.has("offset")) {
                const offset = parse_int_param(params, "offset", { require_present: true });
                if (offset !== null) filters.offset = offset;
            }
            const validated_filters = validate_token_stats_session_filters(filters);
            if (!validated_filters.ok) {
                json_response(res, 400, {
                    error: validated_filters.message,
                    code: validated_filters.code,
                });
                return true;
            }
            json_response(res, 200, store.query_sessions(filters));
            return true;
        }
        case "/v1/sessionStats":
            json_response(res, 200, store.query_session_stats());
            return true;
        case "/v1/buckets": {
            const bucket_source = params.get("source");
            const from_date = params.get("from_date");
            const to_date = params.get("to_date");
            json_response(
                res,
                200,
                store.query_buckets({
                    ...(bucket_source ? { source: bucket_source } : {}),
                    ...(env ? { env } : {}),
                    ...(from_date ? { from_date } : {}),
                    ...(to_date ? { to_date } : {}),
                }),
            );
            return true;
        }
        case "/v1/status":
            json_response(res, 200, {
                running: running(),
                last_updated: store.last_updated(),
            });
            return true;
        default:
            return false;
    }
}
