import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import { createLogger } from "../../../shared/lib/logger";
import { observation_ingest_schema } from "../../../shared/schemas/observation";
import type { Observation } from "../../../shared/types/observation";
import type { ObservationStore } from "../observation/observation-store";
import { build_trend_series, type TrendPoint } from "../../../shared/lib/trend";
import type { TokenStatsStore } from "../token-stats/token-stats-store";
import type { TokenStatsQueryDispatcher } from "../token-stats/query-dispatcher";
import {
    tokenStatsDashboardDtoSchema,
    tokenStatsDashboardQuerySchema,
    tokenStatsDashboardSessionsDtoSchema,
    tokenStatsDashboardSessionsQuerySchema,
    type TokenStatsSessionFilters,
} from "../../../shared/types/token-stats";
import { is_test_build, get_logs_dir } from "../paths";
import {
    handleConfigGet,
    handleConfigGetSecrets,
    handleConfigSave,
    handleConfigSaveSecrets,
    handleConfigDuplicate,
    handleConfigCreateInstance,
    handleConfigExportData,
    handleConfigImportData,
} from "../../ipc/config-ipc";
import type { ConfigIpcDeps } from "../../ipc/config-ipc";
import { handleCookieLoginStatus, startCookieLogin, type AuthIpcDeps } from "../../ipc/auth-ipc";
import { handleSessionLogin, type SessionIpcDeps } from "../../ipc/session-ipc";
import {
    handle_grok_login_cancel,
    handle_grok_login_poll,
    handle_grok_login_start,
    handle_grok_login_status,
    handle_grok_logout,
    handle_grok_refresh,
    type GrokAuthIpcDeps,
} from "../../ipc/grok_auth_ipc";
import {
    handle_kimi_login_cancel,
    handle_kimi_login_poll,
    handle_kimi_login_start,
    handle_kimi_login_status,
    handle_kimi_logout,
    handle_kimi_refresh,
    type KimiAuthIpcDeps,
} from "../../ipc/kimi_auth_ipc";
import {
    handleConnectorGetState,
    handleConnectorList,
    handleConnectorRefresh,
    handleConnectorRefreshAll,
} from "../../ipc/connector-ipc";
import type { ConnectorIpcDeps } from "../../ipc/connector-ipc";
import { state_to_snapshot_dto } from "../../ipc/helpers";
import type { ConnectorSnapshotState } from "../scheduler/types";
import type { IpcResult, SessionLoginRequest } from "../../../shared/types/ipc";
import { handleRendererLog } from "../../ipc/log-ipc";
import type { AppConfiguration } from "../../../shared/types/config";
import { resolve_session_file } from "../session-history/session-locator";
import type { HistorySource, LocatorPaths } from "../session-history/session-locator";
import type {
    Env,
    QueryOptions,
    ResolvedSessionLoc,
    SessionHistorySubscriptionService,
    SessionQueryFilters,
    SessionRow,
    SessionsProvider,
} from "../session-history/subscription-service";
import type {
    SessionHistorySearchContentLegacyRequest,
    SessionHistorySearchContentRequest,
    SessionHistorySearchContentResponse,
    SessionHistorySummariesRequest,
    SessionHistorySummariesResponse,
} from "../../../shared/types/ipc";
import type { TokenStatsSession } from "../../../shared/types/token-stats";
import { clamp_search_content_range } from "../session-history/search_content_range";

const log = createLogger("local-api");
// 不得使用 17863：那是 CPA（CLIProxyAPI）本机管理 API 的知名端口，
// CPA 连接器默认 base URL 指向它。曾撞车：OmniPanel 先启动抢占 17863，
// CPA 连接器打到 OmniPanel 自身 web 面板，返回 HTML 报 "Received HTML response"。
const DEFAULT_PORT = 18263;
const TEST_DEFAULT_PORT = 17864;
const MAX_BODY_BYTES = 1024 * 1024;

const MIME: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".json": "application/json; charset=utf-8",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
};

class RequestBodyTooLargeError extends Error {}

export interface LocalAPIServer {
    start(): Promise<{ port: number; token: string }>;
    stop(): Promise<void>;
    get_port(): number;
    get_token(): string;
    publish_config_change(config: AppConfiguration): void;
    publish_theme_change(is_dark: boolean): void;
}

/** t259: 会话历史 HTTP 桥依赖（映射桌面 session-history-ipc 的 deps）。 */
export interface SessionHistoryDeps {
    readonly service: SessionHistorySubscriptionService;
    /** 供候选/反查会话：由 main 从 token-stats store 映射注入。 */
    readonly sessions_provider: SessionsProvider;
    readonly locator_paths?: LocatorPaths;
}

/** t279/t414: web 会话订阅表（subscriber_id → loc + 持有它的 SSE client）。
 * t414: 一页一条 SSE（connectionId），多 subscriber_id 挂同一 client；
 * 兼容旧客户端仍可经 `?subscriberId=` 开专属流。on_update 只发给该 client；
 * SSE 连接关闭时逐条注销该连接上全部订阅，防 watcher 膨胀。 */
interface WebSessionSub {
    readonly source: string;
    readonly env: Env;
    readonly session_id: string;
    readonly client: ServerResponse;
}

/**
 * t279 f005：SSE 连接 cleanup 的竞态防护。旧连接 close 可能晚于新连接（同
 * subscriber_id 重连）注册到达：此时订阅表与 SSE 映射都已指向新 res，旧 res 的
 * cleanup 必须放弃注销，否则会把新注册的订阅误删或把重挂中的订阅注销。
 * 返回 true 表示应当继续注销（映射仍指向 closing res）。
 */
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

/** web 订阅方身份：t279 用自增 id 区分同一页面的多个会话订阅（无窗口 webContents 可借）。 */

/**
 * t276: 控制端点依赖（映射 tray 纯 main 动作）。瘦客户端经 local-api 触发，
 * 复用 main 侧既有能力（refreshService / orchestrator / app）。
 */
export interface ControlDeps {
    readonly refresh_all: () => void;
    readonly pause: () => void;
    readonly resume: () => void;
    readonly restart: () => void;
    readonly quit: () => void;
}

/** t278: web 认证 HTTP 桥复用桌面 IPC handler 与 main 侧 manager。 */
export interface AuthDeps {
    readonly cookie: AuthIpcDeps;
    readonly session: SessionIpcDeps;
    readonly grok: GrokAuthIpcDeps;
    readonly kimi: KimiAuthIpcDeps;
}

/** 会话历史批量内容搜索请求（新 `{filters,keyword}` + legacy `{locs,keyword}`）。 */
type SessionHistorySearchRequest =
    | SessionHistorySearchContentRequest
    | SessionHistorySearchContentLegacyRequest;

const CONTENT_SEARCH_PAGE_SIZE = 100;
/** t354 AC-003: 搜索分页枚举总量上限，超出即停（避免会话库无界时全量枚举）。 */
const SEARCH_ENUM_CAP = 100_000;

function generate_token(): string {
    return randomBytes(32).toString("hex");
}

function parse_body(req: IncomingMessage): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let total_size = 0;
        let too_large = false;
        req.on("data", (chunk: Buffer) => {
            if (too_large) return;
            total_size += chunk.byteLength;
            if (total_size > MAX_BODY_BYTES) {
                too_large = true;
                req.pause();
                // t355 AC-001: 丢弃剩余 body，避免 keep-alive 连接悬死；reject 后
                // 调用方响应 413，连接可继续复用。
                req.resume();
                reject(new RequestBodyTooLargeError("Request body too large"));
                return;
            }
            chunks.push(chunk);
        });
        req.on("end", () => {
            if (!too_large) resolve(Buffer.concat(chunks));
        });
        req.on("error", reject);
    });
}

type JsonBodyResult = { ok: true; value: unknown } | { ok: false };

async function read_json_body(req: IncomingMessage, res: ServerResponse): Promise<JsonBodyResult> {
    try {
        return { ok: true, value: JSON.parse((await parse_body(req)).toString("utf8")) };
    } catch (err) {
        if (err instanceof RequestBodyTooLargeError) {
            json_response(res, 413, { error: "Request body too large" });
        } else {
            json_response(res, 400, { error: "Invalid JSON" });
        }
        return { ok: false };
    }
}

function send_result<T>(res: ServerResponse, result: IpcResult<T>): void {
    if (result.ok) {
        json_response(res, 200, result.data ?? {});
    } else {
        json_response(res, 400, result.error);
    }
}

// --- t259: 会话历史 HTTP 桥（映射桌面 session-history-ipc 的 QUERY/SEARCH_CONTENT/SUMMARIES） ---

function session_history_key_of(row: SessionRow): string {
    return `${row.source}|${row.env}|${row.id}`;
}

function session_history_legacy_row_of(loc: {
    readonly source: string;
    readonly env: string;
    readonly session_id: string;
}): SessionRow {
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

/** 逐页取全量会话行（与 IPC 层 CONTENT_SEARCH_PAGE_SIZE 分页一致）。
 *  t354 AC-003: 总量上限 SEARCH_ENUM_CAP，避免会话库无界时搜索全量枚举。
 *  t388 AC-001: 达上限截断时 truncated=true。 */
function session_history_query_all_sessions(
    deps: SessionHistoryDeps,
    filters: SessionQueryFilters,
): { rows: SessionRow[]; truncated: boolean } {
    const rows: SessionRow[] = [];
    let offset = 0;
    let page = deps.sessions_provider({ ...filters, limit: CONTENT_SEARCH_PAGE_SIZE, offset });
    rows.push(...page);
    while (page.length === CONTENT_SEARCH_PAGE_SIZE && rows.length < SEARCH_ENUM_CAP) {
        offset += CONTENT_SEARCH_PAGE_SIZE;
        page = deps.sessions_provider({ ...filters, limit: CONTENT_SEARCH_PAGE_SIZE, offset });
        rows.push(...page);
    }
    // t388 AC-001: 达 SEARCH_ENUM_CAP 截断（仍可能有更多页）→ truncated=true。
    // 边界：总数恰等于 CAP 且最后页满时误报 true（循环因 rows.length<CAP 失配
    // 退出、cap 之后那页未 fetch 无法区分）——仅误报、无数据丢失、极罕见。
    return {
        rows,
        truncated: rows.length >= SEARCH_ENUM_CAP && page.length === CONTENT_SEARCH_PAGE_SIZE,
    };
}

function is_legacy_search_request(
    request: SessionHistorySearchRequest,
): request is SessionHistorySearchContentLegacyRequest {
    return "locs" in request;
}

function content_search_candidates(
    deps: SessionHistoryDeps,
    request: SessionHistorySearchRequest,
): { rows: SessionRow[]; truncated: boolean } {
    if (is_legacy_search_request(request)) {
        return { rows: request.locs.map(session_history_legacy_row_of), truncated: false };
    }
    const filters: SessionQueryFilters = {
        ...(request.filters.sources ? { sources: [...request.filters.sources] } : {}),
        ...(request.filters.start_at !== undefined ? { start_at: request.filters.start_at } : {}),
        ...(request.filters.end_at !== undefined ? { end_at: request.filters.end_at } : {}),
    };
    return session_history_query_all_sessions(deps, filters);
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
    const session_id = params.get("id");
    if (!session_id) {
        json_response(res, 400, { error: "id required" });
        return;
    }
    const source = params.get("source");
    const env = params.get("env");
    if (!source || !env) {
        json_response(res, 400, { error: "source and env required" });
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
    const options: QueryOptions = {};
    // t353 AC-002: limit 必须为正整数（0/负/非数字统一 400），不再静默忽略或传 0。
    // InvalidParamError 在此捕获（本函数非 handle_web_read 路径，无外层 400 catch）。
    try {
        const limit_raw = params.get("limit");
        if (limit_raw !== null) {
            const limit = parse_int_param(params, "limit", { min: 1 });
            if (limit !== null) Object.assign(options, { limit });
        }
        const before_raw = params.get("before_cursor");
        if (before_raw !== null && before_raw !== "") {
            const end_index = Number(before_raw);
            if (Number.isFinite(end_index)) {
                Object.assign(options, { before_cursor: { kind: "pagination", end_index } });
            }
        }
    } catch (err) {
        if (
            err instanceof InvalidParamError ||
            (err instanceof Error && err.name === "InvalidParamError")
        ) {
            json_response(res, 400, { error: err.message });
            return;
        }
        throw err;
    }
    const result = deps.service.query(
        {
            source,
            env: env as Env,
            session_id,
            file_path: resolved.file_path,
            extractor_kind: resolved.extractor_kind,
        },
        options,
    );
    const next_cursor =
        result.next_cursor?.kind === "pagination" ? String(result.next_cursor.end_index) : null;
    json_response(res, 200, { messages: result.messages, next_cursor });
}

function is_record(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

async function handle_session_history_search_content(
    res: ServerResponse,
    deps: SessionHistoryDeps,
    body: unknown,
): Promise<void> {
    // t259 f001: 无 auth 端点须对畸形入参回 400（非 500）。
    if (!is_record(body) || typeof body["keyword"] !== "string") {
        json_response(res, 400, { error: "Invalid searchContent request" });
        return;
    }
    const legacy = "locs" in body;
    if (legacy) {
        if (
            !Array.isArray(body["locs"]) ||
            !body["locs"].every(
                (loc) =>
                    is_record(loc) &&
                    typeof loc["source"] === "string" &&
                    typeof loc["env"] === "string" &&
                    typeof loc["session_id"] === "string",
            )
        ) {
            json_response(res, 400, { error: "Invalid searchContent request" });
            return;
        }
    } else {
        const filters = body["filters"];
        if (!is_record(filters)) {
            json_response(res, 400, { error: "Invalid searchContent request" });
            return;
        }
        if (filters["sources"] !== undefined && !Array.isArray(filters["sources"])) {
            json_response(res, 400, { error: "Invalid searchContent request" });
            return;
        }
        if (filters["search"] !== undefined && typeof filters["search"] !== "string") {
            json_response(res, 400, { error: "Invalid searchContent request" });
            return;
        }
    }
    const request = body as unknown as SessionHistorySearchRequest;
    const candidates = content_search_candidates(deps, request);
    const candidate_rows = candidates.rows;
    // t404: 仅 resolve/extract 本批候选 slice；省略 limit 时 end=total（全量兼容）。
    const range = clamp_search_content_range(
        candidate_rows.length,
        typeof request.offset === "number" ? request.offset : undefined,
        typeof request.limit === "number" ? request.limit : undefined,
    );
    const batch_rows = candidate_rows.slice(range.offset, range.end);
    const metadata =
        range.offset > 0 || is_legacy_search_request(request) || !request.filters.search
            ? { rows: [] as SessionRow[], truncated: false }
            : session_history_query_all_sessions(deps, {
                  ...(request.filters.sources ? { sources: [...request.filters.sources] } : {}),
                  search: request.filters.search,
                  ...(request.filters.start_at !== undefined
                      ? { start_at: request.filters.start_at }
                      : {}),
                  ...(request.filters.end_at !== undefined
                      ? { end_at: request.filters.end_at }
                      : {}),
              });
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
    if (!is_record(body) || !Array.isArray(body["locs"])) {
        json_response(res, 400, { error: "Invalid summaries request" });
        return;
    }
    // t259 f001: 逐条校验 loc 形态，空/畸形条目跳过（与桌面 resolve 语义一致）。
    const request = body as unknown as SessionHistorySummariesRequest;
    const resolved_locs: ResolvedSessionLoc[] = [];
    for (const loc of request.locs) {
        if (
            !is_record(loc) ||
            typeof loc.source !== "string" ||
            typeof loc.env !== "string" ||
            typeof loc.session_id !== "string"
        ) {
            continue;
        }
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
    const summaries = await deps.service.summaries(resolved_locs);
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
async function handle_web_session_history(
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
    if (url.pathname === "/v1/sessionHistory" && req.method === "GET") {
        handle_session_history_query(res, deps, url.searchParams);
        return true;
    }
    if (req.method !== "POST") return false;
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

/**
 * Path-traversal guard for static file serving.
 *
 * `startsWith(web_root)` is a string prefix compare and is bypassable by a
 * sibling directory sharing the prefix (web_root=/app/web, target=/app/web-secret).
 * `path.relative` detects that as a leading ".." — and also catches unrelated
 * absolute paths (different drive on Windows → absolute relative result).
 */
export function is_within_web_root(web_root: string, resolved: string): boolean {
    const rel = path.relative(web_root, resolved);
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** Serve a static file from web_root, falling back to index.html (SPA). */
function serve_static(url: URL, res: ServerResponse, web_root: string): void {
    // t355 AC-004: 畸形 percent 编码抛 URIError，捕获回 400（否则落全局 catch → 500）。
    let requested: string;
    try {
        requested = decodeURIComponent(url.pathname);
    } catch {
        json_response(res, 400, { error: "Invalid URL encoding" });
        return;
    }
    const resolved = path.resolve(web_root, requested.replace(/^[/\\]+/, ""));
    if (!is_within_web_root(web_root, resolved)) {
        json_response(res, 403, { error: "Forbidden" });
        return;
    }
    fs.stat(resolved, (stat_err, stat) => {
        const file_path = stat_err || !stat.isFile() ? path.join(web_root, "index.html") : resolved;
        fs.readFile(file_path, (err, data) => {
            if (err) {
                json_response(res, 404, { error: "Not found" });
                return;
            }
            const content_type = MIME[path.extname(file_path)] ?? "application/octet-stream";
            const headers: Record<string, string> = { "Content-Type": content_type };
            // Never cache the SPA shell — assets use hashed filenames so they
            // cache safely, but index.html must always revalidate so new builds
            // appear on refresh instead of a stale bundle.
            if (file_path.endsWith(".html")) {
                headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
                // Web panel CSP（p124）：浏览器面板不走 Electron CSP，须自行声明。
                // script 严格 self；style 允许内联（React style 属性 + 组件内联）；
                // 数据源同源（SSE），拒绝 frame 嵌套。
                headers["Content-Security-Policy"] =
                    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
                    "img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws: wss:; " +
                    "frame-ancestors 'none'; base-uri 'self'";
                headers["X-Content-Type-Options"] = "nosniff";
            } else {
                // t355 AC-005: 非 .html 资产（哈希文件名）加 immutable 缓存头，
                // 避免每次全量读盘。
                headers["Cache-Control"] = "public, max-age=31536000, immutable";
            }
            res.writeHead(200, headers);
            res.end(data);
        });
    });
}

function check_auth(req: IncomingMessage, token: string): boolean {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return false;
    const actual = Buffer.from(auth.slice(7), "utf8");
    const expected = Buffer.from(token, "utf8");
    return actual.byteLength === expected.byteLength && timingSafeEqual(actual, expected);
}

function json_response(res: ServerResponse, status: number, data: unknown): void {
    // p124：JSON 响应加 nosniff 防 MIME 嗅探。
    res.writeHead(status, {
        "Content-Type": "application/json",
        "X-Content-Type-Options": "nosniff",
    });
    res.end(JSON.stringify(data));
}

/** t353: 读端点数值参数解析。缺省返回 null；非有限数（NaN/Infinity/abc）抛
 *  InvalidParamError，由调用侧捕获统一回 400（对齐 /v1/dashboard 的 zod 行为）。 */
class InvalidParamError extends Error {
    constructor(param: string) {
        super(`Invalid parameter: ${param}`);
        this.name = "InvalidParamError";
    }
}

export function parse_int_param(
    params: URLSearchParams,
    name: string,
    options?: { min?: number; require_present?: boolean },
): number | null {
    const raw = params.get(name);
    if (raw === null) {
        if (options?.require_present) throw new InvalidParamError(name);
        return null;
    }
    if (raw.trim() === "") {
        throw new InvalidParamError(name);
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) {
        throw new InvalidParamError(name);
    }
    if (options?.min !== undefined && value < options.min) {
        throw new InvalidParamError(name);
    }
    return value;
}

function is_address_in_use(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "EADDRINUSE"
    );
}

export function create_local_api_server(
    observation_store: ObservationStore,
    options?: {
        port?: number;
        token_stats_store?: TokenStatsStore;
        token_stats_running?: () => boolean;
        /** t193: optional isolated dashboard query dispatcher; when present the
         *  web dashboard endpoint reads through the worker instead of the main
         *  process store (keeps the sync store path as a fallback). */
        token_stats_query_dispatcher?: TokenStatsQueryDispatcher;
        config_deps?: ConfigIpcDeps;
        connector_deps?: ConnectorIpcDeps;
        session_history_deps?: SessionHistoryDeps;
        control_deps?: ControlDeps;
        auth_deps?: AuthDeps;
        web_root?: string;
        /** t279: web 日志导出取当前活跃日志段（对齐桌面 exportCurrentLog 的 userDataPath）。 */
        user_data_path?: string;
    },
): LocalAPIServer {
    const token = generate_token();
    const token_stats_store = options?.token_stats_store;
    const token_stats_running = options?.token_stats_running ?? (() => true);
    const token_stats_query_dispatcher = options?.token_stats_query_dispatcher;
    const config_deps = options?.config_deps;
    const connector_deps = options?.connector_deps;
    const session_history_deps = options?.session_history_deps;
    const control_deps = options?.control_deps;
    const auth_deps = options?.auth_deps;
    const web_root = options?.web_root;
    const user_data_path = options?.user_data_path;
    const env_port = Number(process.env["OMNI_PANEL_PORT"] ?? "");
    const default_port = is_test_build() ? TEST_DEFAULT_PORT : DEFAULT_PORT;
    let port =
        options?.port ?? (Number.isFinite(env_port) && env_port > 0 ? env_port : default_port);
    let server: ReturnType<typeof createServer> | null = null;
    const sse_clients = new Set<ServerResponse>();
    // t279/t414: web 会话订阅表 + 订阅 id → SSE client + 页级 connectionId → SSE client。
    // t414: 多 subscriber_id 可挂同一 connection；连接关闭时清该连接上全部订阅。
    const web_session_subs = new Map<string, WebSessionSub>();
    const sse_client_sub_ids = new Map<string, ServerResponse>();
    const sse_connections = new Map<string, ServerResponse>();

    async function handle_ingest(req: IncomingMessage, res: ServerResponse): Promise<void> {
        let parsed: unknown;
        try {
            parsed = JSON.parse((await parse_body(req)).toString("utf8"));
        } catch (error) {
            if (error instanceof RequestBodyTooLargeError) {
                json_response(res, 413, { error: "Request body too large" });
                return;
            }
            json_response(res, 400, { error: "Invalid JSON" });
            return;
        }

        const result = observation_ingest_schema.safeParse(parsed);
        if (!result.success) {
            json_response(res, 400, { error: result.error.message });
            return;
        }

        const observation: Observation = {
            ...(result.data as unknown as Observation),
            observed_at: Date.now(),
            stale: false,
            last_error: null,
        };
        observation_store.insert(observation);
        json_response(res, 200, { status: "ok" });
    }

    async function handle_web_auth(
        req: IncomingMessage,
        res: ServerResponse,
        url: URL,
        deps: AuthDeps,
    ): Promise<boolean> {
        if (url.pathname === "/v1/auth/cookieLogin") {
            if (req.method !== "POST") return false;
            const parsed = await read_json_body(req, res);
            if (!parsed.ok) return true;
            const instance_id = is_record(parsed.value) ? parsed.value["instanceId"] : undefined;
            if (typeof instance_id !== "string" || !instance_id) {
                json_response(res, 400, { error: "instanceId required" });
                return true;
            }
            send_result(res, startCookieLogin(deps.cookie, instance_id));
            return true;
        }

        if (url.pathname === "/v1/auth/cookieLogin/status") {
            if (req.method !== "GET") return false;
            const instance_id = url.searchParams.get("instanceId");
            if (!instance_id) {
                json_response(res, 400, { error: "instanceId required" });
                return true;
            }
            send_result(res, await handleCookieLoginStatus(deps.cookie, instance_id));
            return true;
        }

        if (
            (url.pathname === "/v1/session/login" || url.pathname === "/v1/session/refresh") &&
            req.method === "POST"
        ) {
            const parsed = await read_json_body(req, res);
            if (!parsed.ok) return true;
            if (!is_record(parsed.value)) {
                json_response(res, 400, { error: "Invalid session login request" });
                return true;
            }
            const request = parsed.value as unknown as SessionLoginRequest;
            send_result(res, await handleSessionLogin(deps.session, request));
            return true;
        }

        const oauth_match =
            /^\/v1\/auth\/(grok|kimi)\/(loginStart|loginPoll|loginCancel|loginStatus|logout|refresh)$/.exec(
                url.pathname,
            );
        if (!oauth_match) return false;
        const namespace = oauth_match[1];
        const action = oauth_match[2];

        if (action === "loginStatus" && req.method === "GET") {
            const instance_id = url.searchParams.get("instanceId");
            if (!instance_id) {
                json_response(res, 400, { error: "instanceId required" });
                return true;
            }
            if (namespace === "grok") {
                send_result(res, await handle_grok_login_status(deps.grok, instance_id));
            } else {
                send_result(res, await handle_kimi_login_status(deps.kimi, instance_id));
            }
            return true;
        }

        if (req.method !== "POST") return false;
        const parsed = await read_json_body(req, res);
        if (!parsed.ok) return true;
        if (!is_record(parsed.value)) {
            json_response(res, 400, { error: "Invalid OAuth request" });
            return true;
        }
        const body = parsed.value;

        if (action === "loginStart") {
            if (namespace === "grok") {
                send_result(res, await handle_grok_login_start(deps.grok));
            } else {
                send_result(res, await handle_kimi_login_start(deps.kimi));
            }
            return true;
        }

        const instance_id = body["instance_id"];
        if (typeof instance_id !== "string" || !instance_id) {
            json_response(res, 400, { error: "instance_id required" });
            return true;
        }

        if (action === "loginPoll") {
            const device_code = body["device_code"];
            const interval = body["interval"];
            const expires_at_epoch_ms = body["expires_at_epoch_ms"];
            if (
                typeof device_code !== "string" ||
                typeof interval !== "number" ||
                !Number.isFinite(interval) ||
                typeof expires_at_epoch_ms !== "number" ||
                !Number.isFinite(expires_at_epoch_ms)
            ) {
                json_response(res, 400, { error: "Invalid OAuth poll request" });
                return true;
            }
            if (namespace === "grok") {
                send_result(
                    res,
                    await handle_grok_login_poll(
                        deps.grok,
                        instance_id,
                        device_code,
                        interval,
                        expires_at_epoch_ms,
                    ),
                );
            } else {
                send_result(
                    res,
                    await handle_kimi_login_poll(
                        deps.kimi,
                        instance_id,
                        device_code,
                        interval,
                        expires_at_epoch_ms,
                    ),
                );
            }
            return true;
        }

        if (action === "loginCancel") {
            if (namespace === "grok") {
                send_result(res, await handle_grok_login_cancel(deps.grok, instance_id));
            } else {
                send_result(res, await handle_kimi_login_cancel(deps.kimi, instance_id));
            }
            return true;
        }
        if (action === "logout") {
            if (namespace === "grok") {
                send_result(res, await handle_grok_logout(deps.grok, instance_id));
            } else {
                send_result(res, await handle_kimi_logout(deps.kimi, instance_id));
            }
            return true;
        }
        if (action === "refresh") {
            if (namespace === "grok") {
                send_result(res, await handle_grok_refresh(deps.grok, instance_id));
            } else {
                send_result(res, await handle_kimi_refresh(deps.kimi, instance_id));
            }
            return true;
        }
        return false;
    }

    /**
     * t279: GET /v1/logs/export —— web 日志导出。流式输出当前活跃日志段
     * （对齐桌面 handleLogExport 的 exportCurrentLog：只导出当天 app-<date>.log），
     * Content-Disposition 触发浏览器下载；文件不存在输出空文件（桌面复制失败同样
     * 不改变导出语义，返回 200 空档）。
     */
    function handle_logs_export(res: ServerResponse): void {
        if (!user_data_path) {
            json_response(res, 503, { error: "logs export unavailable" });
            return;
        }
        const log_dir = get_logs_dir(user_data_path);
        const date = new Date().toISOString().slice(0, 10);
        const log_file = path.join(log_dir, `app-${date}.log`);
        const download_name = `omni-panel-log-${date}.log`;
        fs.stat(log_file, (stat_err, s) => {
            if (stat_err || !s.isFile()) {
                // 桌面语义：日志文件不存在也给出空导出（copyFile 会抛错，但此处
                // web 下载保持 200 空档，浏览器得到空文件不弹错误）。
                res.writeHead(200, {
                    "Content-Type": "text/plain; charset=utf-8",
                    "Content-Disposition": `attachment; filename="${download_name}"`,
                    "Content-Length": "0",
                });
                res.end();
                return;
            }
            // t279 f006：活跃日志段边写边增长，stat 时刻长度不可靠；用 chunked
            // 传输（不带 Content-Length），避免长度不符导致浏览器截断或报错。
            res.writeHead(200, {
                "Content-Type": "text/plain; charset=utf-8",
                "Content-Disposition": `attachment; filename="${download_name}"`,
            });
            const stream = fs.createReadStream(log_file);
            stream.on("error", () => {
                res.destroy();
            });
            stream.pipe(res);
        });
    }

    /**
     * t325: POST /v1/logs/renderer —— web 面板 renderer 日志接收。复用桌面
     * handleRendererLog（renderer:* 前缀 + 既有 logger scrub），非法 payload
     * 由 handleRendererLog 内部容错为 ok 不落盘不抛错；HTTP 层始终返回成功，
     * web log 桥 fire-and-forget 无需关心错误分支。
     */
    async function handle_renderer_log(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const parsed = await read_json_body(req, res);
        if (!parsed.ok) return;
        send_result(res, handleRendererLog(parsed.value));
    }

    function handle_request(req: IncomingMessage, res: ServerResponse): void {
        void (async () => {
            const url = new URL(req.url ?? "/", "http://local");
            const is_get = req.method === "GET";

            if (url.pathname === "/v1/health" && is_get) {
                json_response(res, 200, { status: "ok", uptime: process.uptime() });
                return;
            }

            // Static web UI assets (non-API GET), no auth — serves the panel.
            if (web_root && is_get && !url.pathname.startsWith("/v1/")) {
                serve_static(url, res, web_root);
                return;
            }

            // Web read endpoints serve the panel UI without auth (intranet use
            // per project decision). ingest stays token-gated below. Renderer
            // log ingest (/v1/logs/renderer) also sits pre-auth: the web
            // renderer has no token and must be able to POST logs regardless.
            if (
                is_get &&
                token_stats_store &&
                (await handle_web_read(url, res, token_stats_store))
            ) {
                return;
            }
            if (is_get && handle_web_trend(url, res, observation_store)) {
                return;
            }
            if (config_deps && (await handle_web_config(req, res, url, config_deps))) {
                return;
            }
            if (connector_deps && (await handle_web_connector(req, res, url, connector_deps))) {
                return;
            }
            if (
                session_history_deps &&
                (await handle_web_session_history(req, res, url, session_history_deps, {
                    subs: web_session_subs,
                    sse_clients_by_sub: sse_client_sub_ids,
                    sse_connections,
                    write_event: write_sse_event,
                }))
            ) {
                return;
            }
            if (control_deps && handle_web_control(req, res, url, control_deps)) {
                return;
            }
            if (auth_deps && (await handle_web_auth(req, res, url, auth_deps))) {
                return;
            }

            if (url.pathname === "/v1/events" && is_get) {
                handle_sse(req, res);
                return;
            }

            if (url.pathname === "/v1/logs/export" && is_get) {
                handle_logs_export(res);
                return;
            }

            // t325: web renderer 无 token，日志接收放 check_auth 之前（与 /v1/events、/v1/logs/export 同层）。
            if (url.pathname === "/v1/logs/renderer" && req.method === "POST") {
                await handle_renderer_log(req, res);
                return;
            }

            if (!check_auth(req, token)) {
                json_response(res, 401, { error: "Unauthorized" });
                return;
            }

            if (url.pathname === "/v1/ingest" && req.method === "POST") {
                await handle_ingest(req, res);
                return;
            }

            json_response(res, 404, { error: "Not found" });
        })().catch((err: unknown) => {
            log.error("request failed", err);
            // t355 AC-003: 响应头已发送后不能再写 500（会抛 ERR_HTTP_HEADERS_SENT），
            // 直接 destroy 连接。
            if (res.headersSent) {
                res.destroy();
                return;
            }
            json_response(res, 500, { error: "Internal server error" });
        });
    }

    async function handle_web_read(
        url: URL,
        res: ServerResponse,
        store: TokenStatsStore,
    ): Promise<boolean> {
        const params = url.searchParams;
        const env = params.get("env");
        const agent = params.get("agent");
        const model = params.get("model");
        try {
            // async inner 的 rejection 须 await 才能被本层 catch 捕获。
            return await handle_web_read_inner(url, res, store, params, env, agent, model);
        } catch (err) {
            // t353 AC-001/003: 非法数值参数统一 400（对齐 /v1/dashboard 错误分类），
            // 不落入外层 500。用 name 判断规避 ESM 跨模块 class 双实例 instanceof。
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
        store: TokenStatsStore,
        params: URLSearchParams,
        env: string | null,
        agent: string | null,
        model: string | null,
    ): Promise<boolean> {
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
                        running: token_stats_running(),
                        last_updated: store.last_updated(),
                    };
                    const dto = token_stats_query_dispatcher
                        ? await token_stats_query_dispatcher.request_dashboard(query, status)
                        : store.query_dashboard(query, status);
                    const parsed_dto = tokenStatsDashboardDtoSchema.safeParse(dto);
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
                json_response(
                    res,
                    200,
                    store.query_records({
                        ...(agent
                            ? { agent: agent as "claude-code" | "opencode" | "kimi-code" | "grok" }
                            : {}),
                        ...(env ? { env: env as "local" | "wsl" } : {}),
                        ...(rec_start !== null ? { start: rec_start } : {}),
                        ...(rec_end !== null ? { end: rec_end } : {}),
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
                            ? { agent: agent as "claude-code" | "opencode" | "kimi-code" | "grok" }
                            : {}),
                        ...(env ? { env: env as "local" | "wsl" } : {}),
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
                            ? { agent: agent as "claude-code" | "opencode" | "kimi-code" | "grok" }
                            : {}),
                        ...(env ? { env: env as "local" | "wsl" } : {}),
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
                            ? { agent: agent as "claude-code" | "opencode" | "kimi-code" | "grok" }
                            : {}),
                        ...(env ? { env: env as "local" | "wsl" } : {}),
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
                if (params.has("start_at")) {
                    const start_at = parse_int_param(params, "start_at", { require_present: true });
                    if (start_at !== null) filters.start_at = start_at;
                }
                if (params.has("end_at")) {
                    const end_at = parse_int_param(params, "end_at", { require_present: true });
                    if (end_at !== null) filters.end_at = end_at;
                }
                if (
                    order_by === "ended_at" ||
                    order_by === "tokens" ||
                    order_by === "calls" ||
                    order_by === "started_at"
                ) {
                    filters.order_by = order_by;
                }
                if (direction === "asc" || direction === "desc") filters.direction = direction;
                if (params.has("limit")) {
                    const limit = parse_int_param(params, "limit", {
                        require_present: true,
                        min: 0,
                    });
                    if (limit !== null) filters.limit = limit;
                }
                if (params.has("offset")) {
                    const offset = parse_int_param(params, "offset", { require_present: true });
                    if (offset !== null) filters.offset = offset;
                }
                json_response(res, 200, store.query_sessions(filters));
                return true;
            }
            case "/v1/sessionStats":
                json_response(res, 200, store.query_session_stats());
                return true;
            case "/v1/buckets":
                json_response(
                    res,
                    200,
                    store.query_buckets({
                        ...(env ? { env } : {}),
                    }),
                );
                return true;
            case "/v1/status":
                json_response(res, 200, {
                    running: token_stats_running(),
                    last_updated: store.last_updated(),
                });
                return true;
            default:
                return false;
        }
    }

    function handle_web_trend(url: URL, res: ServerResponse, store: ObservationStore): boolean {
        if (url.pathname !== "/v1/trend") return false;
        const provider = url.searchParams.get("provider");
        const accountId = url.searchParams.get("accountId");
        const metricId = url.searchParams.get("metricId");
        const sourceInstanceId = url.searchParams.get("sourceInstanceId");
        const days_raw = url.searchParams.get("days");
        if (!provider || !accountId || !metricId || !sourceInstanceId) {
            json_response(res, 400, {
                error: "provider, accountId, metricId, sourceInstanceId are required",
            });
            return true;
        }
        const days =
            days_raw !== null && Number.isFinite(Number(days_raw)) && Number(days_raw) > 0
                ? Math.floor(Number(days_raw))
                : 7;
        const records = store.query_trend_series(
            provider,
            accountId,
            metricId,
            sourceInstanceId,
            days,
        );
        const series: (TrendPoint | null)[] = build_trend_series(records);
        json_response(res, 200, series);
        return true;
    }

    async function handle_web_config(
        req: IncomingMessage,
        res: ServerResponse,
        url: URL,
        deps: ConfigIpcDeps,
    ): Promise<boolean> {
        if (url.pathname === "/v1/config/duplicate" && req.method === "POST") {
            const parsed = await read_json_body(req, res);
            if (!parsed.ok) return true;
            const instance_id = is_record(parsed.value) ? parsed.value["instanceId"] : undefined;
            send_result(res, await handleConfigDuplicate(deps, instance_id));
            return true;
        }
        if (url.pathname === "/v1/config/createInstance" && req.method === "POST") {
            const parsed = await read_json_body(req, res);
            if (!parsed.ok) return true;
            const manifest_id = is_record(parsed.value) ? parsed.value["manifestId"] : undefined;
            send_result(res, await handleConfigCreateInstance(deps, manifest_id));
            return true;
        }
        if (url.pathname === "/v1/config/export" && req.method === "GET") {
            send_result(
                res,
                await handleConfigExportData(deps, {
                    includeSecrets: url.searchParams.get("includeSecrets") === "true",
                }),
            );
            return true;
        }
        if (url.pathname === "/v1/config/import" && req.method === "POST") {
            const parsed = await read_json_body(req, res);
            if (!parsed.ok) return true;
            send_result(
                res,
                await handleConfigImportData(deps, parsed.value, {
                    allowEndpointOverrides: false,
                }),
            );
            return true;
        }
        if (url.pathname === "/v1/config") {
            if (req.method === "GET") {
                send_result(res, await handleConfigGet(deps));
                return true;
            }
            if (req.method === "POST") {
                const parsed = await read_json_body(req, res);
                if (!parsed.ok) return true;
                send_result(res, await handleConfigSave(deps, parsed.value));
                return true;
            }
            return false;
        }
        if (url.pathname === "/v1/secrets") {
            if (req.method === "GET") {
                const instance_id = url.searchParams.get("instanceId");
                if (!instance_id) {
                    json_response(res, 400, { error: "instanceId required" });
                    return true;
                }
                send_result(res, await handleConfigGetSecrets(deps, { instanceId: instance_id }));
                return true;
            }
            if (req.method === "POST") {
                const parsed = await read_json_body(req, res);
                if (!parsed.ok) return true;
                send_result(res, await handleConfigSaveSecrets(deps, parsed.value));
                return true;
            }
            return false;
        }
        return false;
    }

    async function handle_web_connector(
        req: IncomingMessage,
        res: ServerResponse,
        url: URL,
        deps: ConnectorIpcDeps,
    ): Promise<boolean> {
        if (url.pathname === "/v1/connectors") {
            if (req.method === "GET") {
                send_result(res, await handleConnectorList(deps));
                return true;
            }
            if (req.method === "POST") {
                // handleConnectorRefreshAll is synchronous (t196 fire-and-forget
                // ack); no await needed.
                send_result(res, handleConnectorRefreshAll(deps));
                return true;
            }
            return false;
        }
        const match = /^\/v1\/connectors\/([^/]+)\/(state|refresh)$/.exec(url.pathname);
        if (match) {
            const instance_id = decodeURIComponent(match[1] ?? "");
            const action = match[2];
            if (action === "state" && req.method === "GET") {
                let result: IpcResult<unknown>;
                try {
                    result = handleConnectorGetState(deps, instance_id);
                } catch (err: unknown) {
                    result = {
                        ok: false,
                        error: { code: "INTERNAL_ERROR", message: String(err) },
                    };
                }
                send_result(res, result);
                return true;
            }
            if (action === "refresh" && req.method === "POST") {
                send_result(res, await handleConnectorRefresh(deps, instance_id));
                return true;
            }
        }
        return false;
    }

    function handle_web_control(
        req: IncomingMessage,
        res: ServerResponse,
        url: URL,
        deps: ControlDeps,
    ): boolean {
        if (!url.pathname.startsWith("/v1/control/")) return false;
        if (req.method !== "POST") {
            json_response(res, 405, { error: "Method not allowed" });
            return true;
        }
        // t276: 控制端点为免认证（与现有读端点一致，用户确认自用场景）。
        switch (url.pathname) {
            case "/v1/control/refresh-all":
                deps.refresh_all();
                json_response(res, 200, { status: "ok" });
                return true;
            case "/v1/control/pause":
                deps.pause();
                json_response(res, 200, { status: "ok" });
                return true;
            case "/v1/control/resume":
                deps.resume();
                json_response(res, 200, { status: "ok" });
                return true;
            case "/v1/control/restart":
                deps.restart();
                json_response(res, 200, { status: "ok" });
                return true;
            case "/v1/control/quit":
                deps.quit();
                json_response(res, 200, { status: "ok" });
                return true;
            default:
                return false;
        }
    }

    function write_sse_event(res: ServerResponse, event: string | undefined, data: unknown): void {
        if (res.destroyed || res.writableEnded) return;
        const event_line = event ? `event: ${event}\n` : "";
        res.write(`${event_line}data: ${JSON.stringify(data)}\n\n`);
    }

    function publish_sse_event(event: string, data: unknown): void {
        for (const client of sse_clients) {
            write_sse_event(client, event, data);
        }
    }

    function handle_sse(req: IncomingMessage, res: ServerResponse): void {
        const store = connector_deps?.runtimeStore;
        if (!store) {
            json_response(res, 503, { error: "events unavailable" });
            return;
        }
        // t414: 页级共享流用 connectionId；t279 旧客户端仍可用 subscriberId 专属流。
        // 连接关闭时清该 res 上全部会话订阅（一连接多 sub），防 watcher 泄漏。
        const params = new URL(req.url ?? "/", "http://local").searchParams;
        const connection_id = params.get("connectionId");
        const subscriber_id = params.get("subscriberId");
        res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
        });
        res.flushHeaders();
        sse_clients.add(res);
        if (connection_id) {
            sse_connections.set(connection_id, res);
        }
        if (subscriber_id) {
            sse_client_sub_ids.set(subscriber_id, res);
        }
        const unsub = store.subscribe({
            onStateChange(instanceId: string, state: ConnectorSnapshotState): void {
                write_sse_event(res, undefined, {
                    instanceId,
                    state: state_to_snapshot_dto(state),
                });
            },
        });
        let cleaned = false;
        const cleanup = (): void => {
            if (cleaned) return;
            cleaned = true;
            sse_clients.delete(res);
            unsub();
            // 该 SSE 连接关闭时清理其持有的全部会话订阅（不依赖 unload 信号）。
            // t279 f005 / t414：重连竞态防护——旧连接 cleanup 可能晚于新连接注册到达，
            // 必须校验当前映射仍指向本 res，否则会误删新注册的订阅。
            if (connection_id && sse_connections.get(connection_id) === res) {
                sse_connections.delete(connection_id);
            }
            for (const [sid, mapped] of [...sse_client_sub_ids.entries()]) {
                if (mapped !== res) continue;
                if (
                    !sse_cleanup_should_unsubscribe(
                        sid,
                        res,
                        web_session_subs,
                        sse_client_sub_ids,
                    )
                ) {
                    continue;
                }
                const sub = web_session_subs.get(sid);
                web_session_subs.delete(sid);
                sse_client_sub_ids.delete(sid);
                if (sub) {
                    session_history_deps?.service.unsubscribe(
                        sub.source,
                        sub.env,
                        sub.session_id,
                        sid,
                    );
                }
            }
        };
        req.on("close", cleanup);
        res.on("close", cleanup);
    }

    function listen(target_port: number): Promise<number> {
        const active_server = server;
        if (!active_server) return Promise.reject(new Error("LocalAPI server is not initialized"));

        return new Promise((resolve, reject) => {
            const on_error = (error: Error) => {
                active_server.off("listening", on_listening);
                reject(error);
            };
            const on_listening = () => {
                active_server.off("error", on_error);
                const addr = active_server.address();
                if (addr && typeof addr === "object") {
                    resolve(addr.port);
                    return;
                }
                reject(new Error("LocalAPI server did not bind to a TCP port"));
            };
            active_server.once("error", on_error);
            active_server.once("listening", on_listening);
            active_server.listen(target_port, "0.0.0.0");
        });
    }

    return {
        async start() {
            if (server) return { port, token };
            server = createServer(handle_request);
            try {
                port = await listen(port);
            } catch (error) {
                if (!is_address_in_use(error)) throw error;
                port = await listen(0);
            }
            log.info(`LocalAPI listening on 0.0.0.0:${String(port)}`);
            return { port, token };
        },

        async stop() {
            const active_server = server;
            if (!active_server) return;
            for (const client of sse_clients) client.end();
            sse_clients.clear();
            await new Promise<void>((resolve, reject) => {
                active_server.close((error?: Error) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve();
                });
            });
            server = null;
        },

        get_port() {
            return port;
        },

        // DESIGN: get_token() returns plaintext by necessity — callers (e.g. IPC
        // to renderer, bearer-token validation) need the raw value.  Callers must
        // redact before logging or persisting.
        get_token() {
            return token;
        },

        publish_config_change(config) {
            publish_sse_event("config", config);
        },

        publish_theme_change(is_dark) {
            publish_sse_event("theme", is_dark);
        },
    };
}
