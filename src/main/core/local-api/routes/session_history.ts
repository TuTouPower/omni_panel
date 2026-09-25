import type { IncomingMessage, ServerResponse } from "node:http";
import {
    resolve_session_file,
    type HistorySource,
    type LocatorPaths,
} from "../../session-history/session-locator";
import { execute_commandcode_resume } from "../../session-history/resume";
import type {
    Env,
    ResolvedSessionLoc,
    SessionHistorySubscriptionService,
    SessionRow,
    SessionsProvider,
} from "../../session-history/subscription-service";
import type {
    SessionHistorySearchContentResponse,
    SessionHistorySummariesRequest,
    SessionHistorySummariesResponse,
} from "../../../../shared/types/ipc";
import type { TokenStatsSession } from "../../../../shared/types/token-stats";
import {
    content_search_candidates,
    content_search_range,
    is_legacy_search_request,
    normalize_recent_query,
    normalize_session_history_query,
    normalize_summary_locs,
    query_all_sessions,
    search_content_filters,
    validate_search_content_request,
} from "../../query-contract";
import { json_response, read_json_body, is_record } from "../http_helpers";

export interface WebSessionSub {
    readonly source: string;
    readonly env: Env;
    readonly session_id: string;
    readonly client: ServerResponse;
}

export function sse_cleanup_should_unsubscribe(
    subscriber_id: string,
    closing_res: ServerResponse,
    subs: ReadonlyMap<string, WebSessionSub>,
    sse_clients_by_sub: ReadonlyMap<string, ServerResponse>,
): boolean {
    if (sse_clients_by_sub.get(subscriber_id) !== closing_res) return false;
    const sub = subs.get(subscriber_id);
    if (sub && sub.client !== closing_res) return false;
    return true;
}

export interface SessionHistoryDeps {
    readonly service: SessionHistorySubscriptionService;
    readonly sessions_provider: SessionsProvider;
    readonly locator_paths?: LocatorPaths;
    readonly command_templates?: Readonly<Record<string, string>>;
}

// --- t259: 会话历史 HTTP 桥（映射桌面 session-history-ipc 的 QUERY/SEARCH_CONTENT/SUMMARIES） ---

function session_history_key_of(row: SessionRow): string {
    return `${row.source}|${row.env}|${row.id}`;
}

/** 解析候选行到 ResolvedSessionLoc，跳过定位失败的会话（对齐 IPC 层）。 */
function resolve_session_rows(
    deps: SessionHistoryDeps,
    rows: readonly SessionRow[],
): ResolvedSessionLoc[] {
    const resolved_locs: ResolvedSessionLoc[] = [];
    for (const row of rows) {
        const resolved = resolve_session_file(
            row.source as HistorySource,
            row.env,
            row.id,
            deps.locator_paths,
        );
        if (!resolved) continue;
        resolved_locs.push({
            source: row.source,
            env: row.env,
            session_id: row.id,
            file_path: resolved.file_path,
            extractor_kind: resolved.extractor_kind,
        });
    }
    return resolved_locs;
}

/**
 * GET /v1/sessionHistory：按 id + source/env 取消息分页。
 * t263: source/env 必须提供，不再支持缺省时全量枚举反查（web query 恒透传，
 * id-only 回退开销线性且多来源同 id 歧义）。缺 source/env 直接 400。
 */
function handle_session_history_query(
    res: ServerResponse,
    deps: SessionHistoryDeps,
    params: URLSearchParams,
): void {
    const options: Record<string, unknown> = {};
    if (params.has("limit")) {
        const raw = params.get("limit") ?? "";
        options["limit"] = raw.trim() === "" ? Number.NaN : Number(raw);
    }
    if (params.has("before_cursor")) {
        const raw = params.get("before_cursor") ?? "";
        options["before_cursor"] = raw.trim() === "" ? Number.NaN : Number(raw);
    }
    const normalized = normalize_session_history_query({
        id: params.get("id"),
        source: params.get("source"),
        env: params.get("env"),
        options: Object.keys(options).length > 0 ? options : undefined,
    });
    if (!normalized.ok) {
        json_response(res, 400, { error: normalized.message, code: normalized.code });
        return;
    }
    const resolved = resolve_session_file(
        normalized.value.source as HistorySource,
        normalized.value.env,
        normalized.value.session_id,
        deps.locator_paths,
    );
    if (!resolved) {
        json_response(res, 404, { error: "SESSION_NOT_FOUND", code: "SESSION_NOT_FOUND" });
        return;
    }
    const result = deps.service.query(
        {
            source: normalized.value.source,
            env: normalized.value.env,
            session_id: normalized.value.session_id,
            file_path: resolved.file_path,
            extractor_kind: resolved.extractor_kind,
        },
        normalized.value.options,
    );
    const next_cursor =
        result.next_cursor?.kind === "pagination" ? String(result.next_cursor.end_index) : null;
    json_response(res, 200, { messages: result.messages, next_cursor });
}

function handle_session_history_recent(
    res: ServerResponse,
    deps: SessionHistoryDeps,
    params: URLSearchParams,
): void {
    const raw_limit = params.get("limit");
    const normalized = normalize_recent_query({
        source: params.get("source"),
        env: params.get("env"),
        limit: raw_limit === null || raw_limit.trim() === "" ? Number.NaN : Number(raw_limit),
    });
    if (!normalized.ok) {
        json_response(res, 400, { error: normalized.message, code: normalized.code });
        return;
    }
    const recent = deps.service.recent_sessions(
        normalized.value.source,
        normalized.value.env,
        normalized.value.limit,
        deps.sessions_provider,
    );
    json_response(res, 200, recent);
}

async function handle_session_history_resume(
    req: IncomingMessage,
    res: ServerResponse,
    deps: SessionHistoryDeps,
): Promise<void> {
    const parsed = await read_json_body(req, res);
    if (!parsed.ok) return;
    const body = is_record(parsed.value) ? parsed.value : {};
    const source = body["source"];
    const env = body["env"];
    const session_id = body["session_id"];
    if (
        source !== "commandcode" ||
        (env !== "linux" && env !== "mac") ||
        typeof session_id !== "string" ||
        session_id === ""
    ) {
        json_response(res, 400, { error: "Command Code resume requires a local platform" });
        return;
    }
    const resolved = resolve_session_file("commandcode", env, session_id, deps.locator_paths);
    if (!resolved) {
        json_response(res, 404, { error: "SESSION_NOT_FOUND", code: "SESSION_NOT_FOUND" });
        return;
    }
    try {
        json_response(res, 200, execute_commandcode_resume(session_id));
    } catch {
        json_response(res, 500, { error: "RESUME_FAILED", code: "RESUME_FAILED" });
    }
}

async function handle_session_history_search_content(
    res: ServerResponse,
    deps: SessionHistoryDeps,
    body: unknown,
): Promise<void> {
    const validated = validate_search_content_request(body);
    if (!validated.ok) {
        json_response(res, 400, { error: validated.message, code: validated.code });
        return;
    }
    const request = validated.value;
    const candidates = content_search_candidates(deps.sessions_provider, request);
    const candidate_rows = candidates.rows;
    // t404: 仅 resolve/extract 本批候选 slice；省略 limit 时 end=total（全量兼容）。
    const range = content_search_range(candidate_rows.length, request);
    const batch_rows = candidate_rows.slice(range.offset, range.end);
    const metadata_filters = search_content_filters(request, true);
    const metadata =
        range.offset > 0 || is_legacy_search_request(request) || !metadata_filters.search
            ? { rows: [] as SessionRow[], truncated: false }
            : query_all_sessions(deps.sessions_provider, metadata_filters);
    const metadata_rows = metadata.rows;
    const resolved_locs = resolve_session_rows(deps, batch_rows);
    // t263: 客户端断连（fetch abort / 页面关闭）时中止底层搜索扫描，避免连续搜索
    // 前序请求持续扫盘并发堆积。res 'close' 在响应正常结束或连接关闭时触发；正常
    // 完成后 abort 无副作用（搜索已结束）。
    const abort_controller = new AbortController();
    res.on("close", () => {
        if (!res.writableEnded) abort_controller.abort();
    });
    const hits = await deps.service.searchContentWithAbort(
        resolved_locs,
        request.keyword,
        abort_controller.signal,
    );
    const hit_keys = new Set(hits);
    // t354 AC-001: metadata 行预构建 key Set 替代 includes 线性扫描（原 includes 对
    // metadata 数组元素引用恒真、对 candidate 行 O(n·m) 查询），语义等价（同引用
    // 必有同 key）。t404: 本批 sessions = 首批 metadata ∪ 本 slice 内容命中。
    const metadata_keys = new Set(metadata_rows.map(session_history_key_of));
    const response_sessions: TokenStatsSession[] = [];
    const response_keys = new Set<string>();
    for (const row of [...metadata_rows, ...batch_rows]) {
        const key = session_history_key_of(row);
        if (response_keys.has(key)) continue;
        if (metadata_keys.has(key) || (row.session && hit_keys.has(key))) {
            response_keys.add(key);
            if (row.session) response_sessions.push(row.session);
        }
    }
    const result: SessionHistorySearchContentResponse = {
        hits: [...hit_keys],
        sessions: response_sessions,
        truncated: candidates.truncated || metadata.truncated,
        progress: {
            scanned: range.scanned,
            total: range.total,
            done: range.done,
            next_offset: range.next_offset,
        },
    };
    json_response(res, 200, result);
}

async function handle_session_history_summaries(
    res: ServerResponse,
    deps: SessionHistoryDeps,
    body: unknown,
): Promise<void> {
    const normalized = normalize_summary_locs(body);
    if (!normalized.ok) {
        json_response(res, 400, { error: normalized.message, code: normalized.code });
        return;
    }
    const request = body as SessionHistorySummariesRequest;
    const resolved_locs: ResolvedSessionLoc[] = [];
    for (const loc of normalized.value) {
        const resolved = resolve_session_file(
            loc.source as HistorySource,
            loc.env as Env,
            loc.session_id,
            deps.locator_paths,
        );
        if (!resolved) continue;
        resolved_locs.push({
            source: loc.source,
            env: loc.env as Env,
            session_id: loc.session_id,
            file_path: resolved.file_path,
            extractor_kind: resolved.extractor_kind,
        });
    }
    const summaries = await deps.service.summaries(resolved_locs, {
        mode: request.mode === "last" ? "last" : "first",
    });
    const result: SessionHistorySummariesResponse = { summaries };
    json_response(res, 200, result);
}

/** t279/t414: web 会话实时订阅——复用 subscription-service watcher，经持有订阅的 SSE 客户端推 `messagesUpdated`。
 * t414: body.connection_id 定位页级共享 SSE；无 connection_id 时回退 subscriber_id 查询参数映射（旧客户端）。 */
async function handle_web_session_history_subscribe(
    req: IncomingMessage,
    res: ServerResponse,
    deps: SessionHistoryDeps,
    ctx: {
        readonly subs: Map<string, WebSessionSub>;
        readonly sse_clients_by_sub: Map<string, ServerResponse>;
        readonly sse_connections: Map<string, ServerResponse>;
        readonly write_event: (
            client: ServerResponse,
            event: string | undefined,
            data: unknown,
        ) => void;
    },
): Promise<void> {
    const parsed = await read_json_body(req, res);
    if (!parsed.ok) return;
    const body = is_record(parsed.value) ? parsed.value : {};
    const source = body["source"];
    const env = body["env"];
    const session_id = body["session_id"];
    const subscriber_id = body["subscriber_id"];
    const connection_id = body["connection_id"];
    if (
        typeof source !== "string" ||
        typeof env !== "string" ||
        typeof session_id !== "string" ||
        typeof subscriber_id !== "string" ||
        !subscriber_id
    ) {
        json_response(res, 400, { error: "source, env, session_id and subscriber_id required" });
        return;
    }
    const resolved = resolve_session_file(
        source as HistorySource,
        env as Env,
        session_id,
        deps.locator_paths,
    );
    if (!resolved) {
        json_response(res, 404, { error: "SESSION_NOT_FOUND", code: "SESSION_NOT_FOUND" });
        return;
    }
    // 订阅必须挂在真实 SSE 客户端上：on_update 只发给该 client，
    // client 断开（SSE close）时统一注销，杜绝 watcher 泄漏。
    // t414: 优先 connection_id（一页多会话共享连接）；否则按 subscriber_id 查专属流（旧客户端）。
    const sse_client =
        typeof connection_id === "string" && connection_id
            ? ctx.sse_connections.get(connection_id)
            : ctx.sse_clients_by_sub.get(subscriber_id);
    if (!sse_client) {
        json_response(res, 409, {
            error:
                typeof connection_id === "string" && connection_id
                    ? "connection_id not connected via /v1/events"
                    : "subscriber_id not connected via /v1/events",
        });
        return;
    }
    const loc = { source, env: env as Env, session_id };
    // t355 AC-002: 同一 subscriber_id 重复 subscribe 时先注销旧 watcher，避免
    // 旧 on_update 错路由推送 + watcher 泄漏。
    const previous_sub = ctx.subs.get(subscriber_id);
    if (previous_sub) {
        deps.service.unsubscribe(
            previous_sub.source,
            previous_sub.env,
            previous_sub.session_id,
            subscriber_id,
        );
    }
    ctx.sse_clients_by_sub.set(subscriber_id, sse_client);
    ctx.subs.set(subscriber_id, { ...loc, client: sse_client });
    deps.service.subscribe({
        ...loc,
        file_path: resolved.file_path,
        extractor_kind: resolved.extractor_kind,
        subscriber_id,
        on_update: (messages) => {
            const sub = ctx.subs.get(subscriber_id);
            if (!sub) return;
            ctx.write_event(sub.client, "messagesUpdated", {
                source: loc.source,
                env: loc.env,
                session_id: loc.session_id,
                messages,
            });
        },
    });
    json_response(res, 200, { subscribed: true, subscriber_id });
}

/** t279: web 会话订阅注销（按 subscriber_id，只移除该订阅方）。 */
async function handle_web_session_history_unsubscribe(
    req: IncomingMessage,
    res: ServerResponse,
    deps: SessionHistoryDeps,
    subs: Map<string, WebSessionSub>,
): Promise<void> {
    const parsed = await read_json_body(req, res);
    if (!parsed.ok) return;
    const body = is_record(parsed.value) ? parsed.value : {};
    const subscriber_id = body["subscriber_id"];
    if (typeof subscriber_id !== "string" || !subscriber_id) {
        json_response(res, 400, { error: "subscriber_id required" });
        return;
    }
    const sub = subs.get(subscriber_id);
    subs.delete(subscriber_id);
    if (sub) {
        deps.service.unsubscribe(sub.source, sub.env, sub.session_id, subscriber_id);
    }
    json_response(res, 200, { unsubscribed: true });
}

/** t259: 会话历史 HTTP 端点（GET query + POST searchContent/summaries + t279 subscribe/unsubscribe）。 */
export async function handle_web_session_history(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    deps: SessionHistoryDeps,
    ctx: {
        readonly subs: Map<string, WebSessionSub>;
        readonly sse_clients_by_sub: Map<string, ServerResponse>;
        readonly sse_connections: Map<string, ServerResponse>;
        readonly write_event: (
            client: ServerResponse,
            event: string | undefined,
            data: unknown,
        ) => void;
    },
): Promise<boolean> {
    if (
        (url.pathname === "/v1/sessionHistory" || url.pathname === "/v1/sessionHistory/query") &&
        req.method === "GET"
    ) {
        handle_session_history_query(res, deps, url.searchParams);
        return true;
    }
    if (url.pathname === "/v1/sessionHistory/recent" && req.method === "GET") {
        handle_session_history_recent(res, deps, url.searchParams);
        return true;
    }
    if (req.method !== "POST") return false;
    if (url.pathname === "/v1/sessionHistory/resume") {
        await handle_session_history_resume(req, res, deps);
        return true;
    }
    if (url.pathname === "/v1/sessionHistory/subscribe") {
        await handle_web_session_history_subscribe(req, res, deps, ctx);
        return true;
    }
    if (url.pathname === "/v1/sessionHistory/unsubscribe") {
        await handle_web_session_history_unsubscribe(req, res, deps, ctx.subs);
        return true;
    }
    if (url.pathname === "/v1/sessionHistory/searchContent") {
        const parsed = await read_json_body(req, res);
        if (!parsed.ok) return true;
        await handle_session_history_search_content(res, deps, parsed.value);
        return true;
    }
    if (url.pathname === "/v1/sessionHistory/summaries") {
        const parsed = await read_json_body(req, res);
        if (!parsed.ok) return true;
        await handle_session_history_summaries(res, deps, parsed.value);
        return true;
    }
    return false;
}
