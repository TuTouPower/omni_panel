import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { request as undici_request } from "undici";
import { createLogger } from "../../../shared/lib/logger";
import { writeJsonAtomic } from "../storage/write-json";
import {
    MODEL_ROUTING_SLOTS,
    type DevPanelModelRoutingChannel,
    type DevPanelModelRoutingChange,
    type DevPanelModelRoutingChannels,
    type DevPanelModelRoutingConfig,
    type DevPanelModelRoutingSaveRequest,
    type DevPanelModelRoutingSaveResult,
    type DevPanelModelRoutingSnapshot,
    type DevPanelModelRoutingSnapshotInfo,
    type DevPanelModelRoutingTestRequest,
    type DevPanelModelRoutingTestResult,
} from "../../../shared/types/dev-panel-model-routing";

const DEFAULT_CONFIG_PATH = "~/kar/code/my_file/config/files/new_api.yaml";
const DEFAULT_SETTINGS_PATH = "~/.claude/settings.json";
const DEFAULT_TEST_PATH = "/v1/chat/completions";
const HTTP_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const SLOT_SET = new Set<string>(MODEL_ROUTING_SLOTS);

const log = createLogger("dev-panel-model-routing");

/** 携带 HTTP 状态码的 New API 传输错误：上层据此给出可操作文案（p244）。 */
class NewApiRequestError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = "NewApiRequestError";
        this.status = status;
    }
}

type JsonRecord = Record<string, unknown>;

interface ExternalConfig {
    readonly config_path: string;
    readonly settings_path: string;
    readonly base_url: string;
    readonly session_token: string;
    readonly models: readonly string[];
    readonly aliases: Readonly<Record<string, readonly string[]>>;
    readonly expanded_slots: readonly string[];
    readonly settings_present: boolean;
    readonly test_path: string;
}

export interface NewApiTransport {
    get(path: string): Promise<unknown>;
    put(path: string, body: unknown): Promise<unknown>;
    post(path: string, body: unknown): Promise<unknown>;
}

export interface ModelRoutingManagerOptions {
    readonly config_path?: string;
    readonly settings_path?: string;
    readonly snapshot_path?: string;
    readonly transport_factory?: (
        config: Pick<ExternalConfig, "base_url" | "session_token" | "test_path">,
    ) => NewApiTransport;
}

export interface DevPanelModelRoutingManager {
    get_config(): Promise<DevPanelModelRoutingConfig>;
    get_channels(): Promise<DevPanelModelRoutingChannels>;
    save(request: DevPanelModelRoutingSaveRequest): Promise<DevPanelModelRoutingSaveResult>;
    test(request: DevPanelModelRoutingTestRequest): Promise<DevPanelModelRoutingTestResult>;
    get_snapshot_info(): Promise<DevPanelModelRoutingSnapshotInfo | null>;
}

interface StoredSnapshot extends DevPanelModelRoutingSnapshot {
    readonly saved_at: string;
}

function as_record(value: unknown): JsonRecord {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as JsonRecord)
        : {};
}

function expand_home(value: string): string {
    const trimmed = value.trim();
    if (trimmed === "~") return homedir();
    if (trimmed.startsWith("~/")) return join(homedir(), trimmed.slice(2));
    return resolve(trimmed);
}

function string_value(value: unknown): string | undefined {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function scalar_value(raw: string): unknown {
    const value = raw.trim();
    if (!value) return "";
    if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
    ) {
        return value.slice(1, -1);
    }
    if (value === "true") return true;
    if (value === "false") return false;
    if (value === "null" || value === "~") return null;
    if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
    if (value.startsWith("[") && value.endsWith("]")) {
        try {
            return JSON.parse(value.replaceAll("'", '"')) as unknown;
        } catch {
            return value
                .slice(1, -1)
                .split(",")
                .map((item) => String(scalar_value(item)))
                .filter((item) => item.length > 0);
        }
    }
    if (value.startsWith("{") && value.endsWith("}")) {
        try {
            return JSON.parse(value.replaceAll("'", '"')) as unknown;
        } catch {
            return value;
        }
    }
    return value;
}

function remove_yaml_comment(line: string): string {
    let quote: string | null = null;
    for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        if ((char === '"' || char === "'") && line[index - 1] !== "\\") {
            if (quote === char) quote = null;
            else quote ??= char;
        }
        if (char === "#" && quote === null && (index === 0 || /\s/.test(line[index - 1] ?? ""))) {
            return line.slice(0, index);
        }
    }
    return line;
}

/** Dependency-free YAML subset for the user-owned routing file. */
function parse_yaml(text: string): unknown {
    const root: JsonRecord = {};
    const stack: { indent: number; value: JsonRecord | unknown[] }[] = [
        { indent: -1, value: root },
    ];
    const lines = text.split(/\r?\n/);
    for (let line_index = 0; line_index < lines.length; line_index += 1) {
        const source = remove_yaml_comment(lines[line_index] ?? "");
        if (source.trim().length === 0) continue;
        const indent = source.length - source.trimStart().length;
        const content = source.trim();
        while (stack.length > 1 && indent <= (stack.at(-1)?.indent ?? -1)) stack.pop();
        const parent = stack.at(-1)?.value ?? root;
        if (content.startsWith("- ") || content === "-") {
            if (!Array.isArray(parent)) continue;
            const item = content.slice(1).trim();
            const separator = item.indexOf(":");
            if (separator > 0) {
                const object: JsonRecord = {};
                parent.push(object);
                const key = item.slice(0, separator).trim();
                const raw = item.slice(separator + 1).trim();
                object[key] = raw.length > 0 ? scalar_value(raw) : {};
                const child = object[key];
                if (child && typeof child === "object" && !Array.isArray(child)) {
                    stack.push({ indent, value: object });
                }
            } else {
                parent.push(scalar_value(item));
            }
            continue;
        }
        const separator = content.indexOf(":");
        if (separator <= 0 || Array.isArray(parent)) continue;
        const key = content.slice(0, separator).trim();
        const raw = content.slice(separator + 1).trim();
        if (raw.length > 0) {
            parent[key] = scalar_value(raw);
            continue;
        }
        const next = lines.slice(line_index + 1).find((candidate) => candidate.trim().length > 0);
        const next_content = next?.trim() ?? "";
        const child: JsonRecord | unknown[] = next_content.startsWith("-") ? [] : {};
        parent[key] = child;
        stack.push({ indent, value: child });
    }
    return root;
}

function as_string_list(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.map(string_value).filter((item): item is string => item !== undefined);
    }
    if (typeof value === "string") return [value];
    if (typeof value === "object" && value !== null) {
        return Object.keys(value);
    }
    return [];
}

function parse_aliases(value: unknown): Record<string, readonly string[]> {
    const aliases: Record<string, readonly string[]> = {};
    if (Array.isArray(value)) {
        for (const item of value) {
            const record = as_record(item);
            const canonical = string_value(
                record["model"] ?? record["canonical"] ?? record["name"],
            );
            const alias_values = as_string_list(record["aliases"] ?? record["alias"]);
            if (canonical && alias_values.length > 0) aliases[canonical] = alias_values;
        }
        return aliases;
    }
    for (const [key, raw] of Object.entries(as_record(value))) {
        const values = as_string_list(raw);
        if (values.length > 0) aliases[key] = values;
    }
    return aliases;
}

function first_string(source: JsonRecord, keys: readonly string[]): string | undefined {
    for (const key of keys) {
        const value = string_value(source[key]);
        if (value) return value;
    }
    return undefined;
}

function extract_models(source: JsonRecord): string[] {
    const values = source["models"] ?? source["model_presets"] ?? source["presets"];
    if (Array.isArray(values)) {
        return values
            .map((value) =>
                typeof value === "string" ? value : string_value(as_record(value)["name"]),
            )
            .filter((value): value is string => value !== undefined);
    }
    return Object.keys(as_record(values));
}

function settings_has_slot_variant(text: string, slot: string): boolean {
    const escaped = slot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`${escaped}[^\\n]{0,200}\\[1m\\]`).test(text);
}

function expand_slots(settings_text: string): string[] {
    const expanded: string[] = [...MODEL_ROUTING_SLOTS];
    for (const slot of MODEL_ROUTING_SLOTS) {
        if (settings_has_slot_variant(settings_text, slot)) expanded.push(`${slot}[1m]`);
    }
    return expanded;
}

function canonical_model(
    value: string,
    aliases: Readonly<Record<string, readonly string[]>>,
): string {
    for (const [canonical, values] of Object.entries(aliases)) {
        if (value === canonical || values.includes(value)) return canonical;
    }
    return value;
}

function models_equal(
    left: string,
    right: string,
    aliases: Readonly<Record<string, readonly string[]>>,
): boolean {
    return canonical_model(left, aliases) === canonical_model(right, aliases);
}

function parse_json_record(value: unknown): JsonRecord {
    if (typeof value === "string") {
        try {
            return as_record(JSON.parse(value) as unknown);
        } catch {
            return {};
        }
    }
    return as_record(value);
}

function parse_string_list(value: unknown): string[] {
    if (typeof value === "string") {
        try {
            return as_string_list(JSON.parse(value) as unknown);
        } catch {
            return value
                .split(",")
                .map((item) => item.trim())
                .filter((item) => item.length > 0);
        }
    }
    return as_string_list(value);
}

function channel_from_raw(value: unknown): DevPanelModelRoutingChannel | null {
    const source = as_record(value);
    const id = string_value(source["id"] ?? source["channel_id"] ?? source["key"]);
    if (!id) return null;
    const status = string_value(source["status"]) ?? "enabled";
    const group = string_value(source["group"] ?? source["channel_group"]) ?? "";
    const disabled =
        source["enabled"] === false ||
        source["status"] === false ||
        source["status"] === 0 ||
        /disabled|inactive|off/i.test(status);
    const mapping = parse_json_record(source["model_mapping"] ?? source["modelMapping"]);
    const priority_raw = source["priority"];
    const priority =
        typeof priority_raw === "number" && Number.isFinite(priority_raw) ? priority_raw : null;
    return {
        id,
        name: string_value(source["name"] ?? source["channel_name"]) ?? id,
        group,
        status,
        enabled: !disabled,
        models: parse_string_list(source["models"]),
        model_mapping: Object.fromEntries(
            Object.entries(mapping).flatMap(([key, raw]) => {
                const value = string_value(raw);
                return value ? [[key, value]] : [];
            }),
        ),
        priority,
    };
}

function extract_channel_items(payload: unknown): unknown[] {
    const record = as_record(payload);
    const data = as_record(record["data"]);
    const items = data["items"] ?? record["items"];
    return Array.isArray(items) ? items : [];
}

function extract_success(payload: unknown): boolean | undefined {
    const record = as_record(payload);
    return typeof record["success"] === "boolean" ? record["success"] : undefined;
}

function extract_model_name(payload: unknown): string | null {
    const record = as_record(payload);
    const choice = Array.isArray(record["choices"]) ? as_record(record["choices"][0]) : {};
    const message = as_record(choice["message"]);
    const reasoning = as_record(message["reasoning_content"] ?? choice["reasoning_content"]);
    const candidates = [
        record["model"],
        record["id"],
        choice["model"],
        message["model"],
        reasoning["model"],
    ];
    return (
        candidates.find(
            (value): value is string => typeof value === "string" && value.length > 0,
        ) ?? null
    );
}

async function read_response_body(body: AsyncIterable<Uint8Array | string>): Promise<string> {
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of body) {
        const buffer = typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk);
        total += buffer.byteLength;
        if (total > MAX_RESPONSE_BYTES) throw new Error("New API response is too large");
        chunks.push(buffer);
    }
    return Buffer.concat(chunks).toString("utf8");
}

function assert_safe_host(url: URL): void {
    const host = url.hostname.toLowerCase();
    if (
        host === "169.254.169.254" ||
        host === "metadata.google.internal" ||
        host === "metadata.azure.com"
    ) {
        throw new Error(`Refusing New API request to metadata host: ${host}`);
    }
}

function create_transport(
    base_url: string,
    session_token: string,
    test_path: string,
): NewApiTransport {
    const base = new URL(base_url);
    const request_json = async (method: "GET" | "PUT" | "POST", path: string, body?: unknown) => {
        const url = new URL(path, base);
        if (url.origin !== base.origin)
            throw new Error("New API endpoint must stay on the configured origin");
        assert_safe_host(url);
        const controller = new AbortController();
        const timer = setTimeout(() => {
            controller.abort();
        }, HTTP_TIMEOUT_MS);
        try {
            const response = await undici_request(url, {
                method,
                headers: {
                    Accept: "application/json",
                    Authorization: `Bearer ${session_token}`,
                    ...(body === undefined ? {} : { "Content-Type": "application/json" }),
                },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
                signal: controller.signal,
            });
            const raw = await read_response_body(response.body);
            let payload: unknown = null;
            if (raw.trim().length > 0) {
                try {
                    payload = JSON.parse(raw) as unknown;
                } catch {
                    throw new Error(
                        `New API returned invalid JSON (HTTP ${String(response.statusCode)})`,
                    );
                }
            }
            if (response.statusCode < 200 || response.statusCode >= 300) {
                throw new NewApiRequestError(
                    response.statusCode,
                    `New API request failed (HTTP ${String(response.statusCode)})`,
                );
            }
            if (extract_success(payload) === false) {
                throw new Error("New API rejected the request");
            }
            return payload;
        } catch (error: unknown) {
            if (error instanceof Error && error.message.includes("New API")) throw error;
            throw new Error("New API request failed");
        } finally {
            clearTimeout(timer);
        }
    };
    return {
        get: (path) => request_json("GET", path),
        put: (path, body) => request_json("PUT", path, body),
        post: (path, body) => request_json("POST", path === "" ? test_path : path, body),
    };
}

async function load_external_config(
    config_path: string,
    settings_path: string,
): Promise<ExternalConfig> {
    let config_text: string;
    try {
        config_text = await readFile(config_path, "utf8");
    } catch {
        throw new Error(`New API 配置文件不可读：${config_path}`);
    }
    let parsed: JsonRecord;
    try {
        parsed = as_record(parse_yaml(config_text));
    } catch {
        throw new Error(`New API 配置文件格式无效：${config_path}`);
    }
    const source = as_record(parsed["new_api"] ?? parsed["newApi"] ?? parsed);
    const base_url = first_string(source, [
        "base_url",
        "baseUrl",
        "api_url",
        "apiUrl",
        "endpoint",
        "url",
    ]);
    const session_token = first_string(source, ["session", "token", "api_key", "apiKey", "key"]);
    if (!base_url || !session_token) {
        throw new Error(`New API 配置缺少 base_url 或 session：${config_path}`);
    }
    const models = extract_models(source);
    if (models.length === 0) throw new Error(`New API 配置缺少 models：${config_path}`);
    let settings_text = "";
    let settings_present = false;
    try {
        settings_text = await readFile(settings_path, "utf8");
        settings_present = true;
    } catch {
        settings_present = false;
    }
    const test_path =
        first_string(source, ["test_path", "testPath", "completion_path"]) ?? DEFAULT_TEST_PATH;
    return {
        config_path,
        settings_path,
        base_url,
        session_token,
        models,
        aliases: parse_aliases(
            source["aliases"] ?? source["model_aliases"] ?? source["modelAliases"],
        ),
        expanded_slots: expand_slots(settings_text),
        settings_present,
        test_path,
    };
}

function to_public_config(config: ExternalConfig): DevPanelModelRoutingConfig {
    return {
        config_path: config.config_path,
        settings_path: config.settings_path,
        models: config.models,
        aliases: config.aliases,
        expanded_slots: config.expanded_slots,
        settings_present: config.settings_present,
    };
}

async function fetch_channels(transport: NewApiTransport): Promise<DevPanelModelRoutingChannel[]> {
    const channels: DevPanelModelRoutingChannel[] = [];
    for (let page = 1; page <= 100; page += 1) {
        const payload = await transport.get(`/api/channel/?p=${String(page)}`);
        const items = extract_channel_items(payload);
        if (items.length === 0) break;
        for (const item of items) {
            const channel = channel_from_raw(item);
            if (channel) channels.push(channel);
        }
    }
    return channels;
}

function is_default_enabled(channel: DevPanelModelRoutingChannel): boolean {
    return channel.enabled && channel.group.toLowerCase() === "default";
}

function mapping_change_text(
    slot: string,
    before: string | undefined,
    after: string | undefined,
): string {
    if (before === after) return "";
    if (before === undefined && after !== undefined) return `${slot}: +${after}`;
    if (before !== undefined && after === undefined) return `${slot}: -${before}`;
    return `${slot}: ${before ?? "—"} → ${after ?? "—"}`;
}

interface ChannelDraft {
    readonly channel: DevPanelModelRoutingChannel;
    readonly models: string[];
    readonly mapping: JsonRecord;
    priority: number | null;
    readonly added_models: string[];
    readonly removed_models: string[];
    readonly mapping_changes: string[];
    priority_changed: boolean;
}

function make_draft(
    channel: DevPanelModelRoutingChannel,
    selections: Readonly<Record<string, string>>,
    expanded_slots: readonly string[],
    aliases: Readonly<Record<string, readonly string[]>>,
): ChannelDraft {
    const models = [...channel.models];
    let mapping: JsonRecord = { ...channel.model_mapping };
    const added_models: string[] = [];
    const removed_models: string[] = [];
    const mapping_changes: string[] = [];
    for (const slot of expanded_slots) {
        const base_slot = slot.replace(/\[1m\]$/, "");
        if (!SLOT_SET.has(base_slot)) continue;
        const selected = selections[base_slot];
        if (!selected) continue;
        const actual = models.find(
            (model) =>
                !SLOT_SET.has(model.replace(/\[1m\]$/, "")) &&
                models_equal(model, selected, aliases),
        );
        const previous = string_value(mapping[slot]);
        const next = actual;
        if (next) {
            if (!models.includes(slot)) {
                models.push(slot);
                added_models.push(slot);
            }
            mapping[slot] = next;
        } else {
            const index = models.indexOf(slot);
            if (index >= 0) {
                models.splice(index, 1);
                removed_models.push(slot);
            }
            mapping = Object.fromEntries(Object.entries(mapping).filter(([key]) => key !== slot));
        }
        const change = mapping_change_text(slot, previous, next);
        if (change) mapping_changes.push(change);
    }
    return {
        channel,
        models,
        mapping,
        priority: channel.priority,
        added_models,
        removed_models,
        mapping_changes,
        priority_changed: false,
    };
}

function resolve_priorities(
    drafts: readonly ChannelDraft[],
    selections: Readonly<Record<string, string>>,
    aliases: Readonly<Record<string, readonly string[]>>,
): void {
    const target = selections["default_model"];
    if (!target) return;
    const relevant = drafts.filter((draft) => {
        const mapped = string_value(draft.mapping["default_model"]);
        return mapped !== undefined && models_equal(mapped, target, aliases);
    });
    const by_priority = new Set<number>();
    let next_priority = Math.max(0, ...relevant.map((draft) => draft.priority ?? 0)) + 1;
    for (const draft of relevant) {
        if (draft.priority !== null && !by_priority.has(draft.priority)) {
            by_priority.add(draft.priority);
            continue;
        }
        while (by_priority.has(next_priority)) next_priority += 1;
        draft.priority = next_priority;
        draft.priority_changed = draft.priority !== draft.channel.priority;
        by_priority.add(next_priority);
        next_priority += 1;
    }
}

function to_snapshot(
    channels: readonly DevPanelModelRoutingChannel[],
    info: DevPanelModelRoutingSnapshotInfo,
): StoredSnapshot {
    return {
        info,
        saved_at: info.created_at,
        channels: channels.map((channel) => ({
            channel_id: channel.id,
            channel_name: channel.name,
            models: channel.models,
            model_mapping: channel.model_mapping,
            priority: channel.priority,
        })),
    };
}

/**
 * 出站错误文案：只脱敏凭据本身（Bearer 值），保留配置路径等可操作信息——
 * 原先「含 session/token 字样就整条替换」会连 `New API 配置缺少 models：<path>`
 * 一起吃掉（p244）。鉴权失败单独给可操作指引，其它 HTTP 失败给状态码。
 */
function public_error(error: unknown, config_path: string, fallback: string): string {
    if (error instanceof NewApiRequestError) {
        if (error.status === 401 || error.status === 403) {
            return `New API 鉴权失败（HTTP ${String(error.status)}）：请更新 ${config_path} 里的 session（需为控制台「个人设置 → 安全设置」的系统令牌）`;
        }
        return `New API 请求失败（HTTP ${String(error.status)}）`;
    }
    if (!(error instanceof Error)) return fallback;
    const message = error.message.replace(/(Bearer)\s+\S+/gi, "$1 [redacted]");
    return message.trim().length > 0 ? message : fallback;
}

export function create_dev_panel_model_routing_manager(
    options: ModelRoutingManagerOptions = {},
): DevPanelModelRoutingManager {
    const config_path = expand_home(options.config_path ?? DEFAULT_CONFIG_PATH);
    const settings_path = expand_home(options.settings_path ?? DEFAULT_SETTINGS_PATH);
    const snapshot_path =
        options.snapshot_path ?? join(homedir(), ".omni-panel", "model-routing.snapshot.json");
    let last_snapshot: StoredSnapshot | null = null;

    async function load(): Promise<ExternalConfig> {
        return load_external_config(config_path, settings_path);
    }

    function get_transport(config: ExternalConfig): NewApiTransport {
        return (
            options.transport_factory?.(config) ??
            create_transport(config.base_url, config.session_token, config.test_path)
        );
    }

    async function fetch_channel_list(
        transport: NewApiTransport,
    ): Promise<DevPanelModelRoutingChannel[]> {
        try {
            return await fetch_channels(transport);
        } catch (error: unknown) {
            throw new Error(public_error(error, config_path, "New API 渠道读取失败"));
        }
    }

    async function get_channels(): Promise<DevPanelModelRoutingChannels> {
        const config = await load();
        const channels = await fetch_channel_list(get_transport(config));
        return { fetched_at: new Date().toISOString(), channels };
    }

    async function save_impl(
        request: DevPanelModelRoutingSaveRequest,
    ): Promise<DevPanelModelRoutingSaveResult> {
        if (!request.confirmed) throw new Error("保存模型路由前需要确认");
        const config = await load();
        const transport = get_transport(config);
        const channels = await fetch_channel_list(transport);
        const snapshot_info: DevPanelModelRoutingSnapshotInfo = {
            snapshot_id: randomUUID(),
            created_at: new Date().toISOString(),
            channel_count: channels.length,
        };
        const snapshot = to_snapshot(channels, snapshot_info);
        await writeJsonAtomic(snapshot_path, snapshot, { chmod: 0o600 });
        last_snapshot = snapshot;
        const drafts = channels
            .filter(is_default_enabled)
            .map((channel) =>
                make_draft(channel, request.selections, config.expanded_slots, config.aliases),
            );
        resolve_priorities(drafts, request.selections, config.aliases);
        const changes: DevPanelModelRoutingChange[] = [];
        let stopped = false;
        for (const draft of drafts) {
            if (stopped) {
                changes.push({
                    channel_id: draft.channel.id,
                    channel_name: draft.channel.name,
                    status: "skipped",
                    added_models: draft.added_models,
                    removed_models: draft.removed_models,
                    mapping_changes: draft.mapping_changes,
                    priority_changed: draft.priority_changed,
                });
                continue;
            }
            const changed =
                draft.added_models.length > 0 ||
                draft.removed_models.length > 0 ||
                draft.mapping_changes.length > 0 ||
                draft.priority_changed;
            if (!changed) {
                changes.push({
                    channel_id: draft.channel.id,
                    channel_name: draft.channel.name,
                    status: "success",
                    added_models: [],
                    removed_models: [],
                    mapping_changes: [],
                    priority_changed: false,
                });
                continue;
            }
            try {
                const response = await transport.put(
                    `/api/channel/${encodeURIComponent(draft.channel.id)}`,
                    {
                        models: JSON.stringify(draft.models),
                        model_mapping: JSON.stringify(draft.mapping),
                        ...(draft.priority === null ? {} : { priority: draft.priority }),
                    },
                );
                if (extract_success(response) === false)
                    throw new Error("New API rejected the channel update");
                changes.push({
                    channel_id: draft.channel.id,
                    channel_name: draft.channel.name,
                    status: "success",
                    added_models: draft.added_models,
                    removed_models: draft.removed_models,
                    mapping_changes: draft.mapping_changes,
                    priority_changed: draft.priority_changed,
                });
            } catch (error: unknown) {
                stopped = true;
                changes.push({
                    channel_id: draft.channel.id,
                    channel_name: draft.channel.name,
                    status: "failed",
                    added_models: draft.added_models,
                    removed_models: draft.removed_models,
                    mapping_changes: draft.mapping_changes,
                    priority_changed: draft.priority_changed,
                    error: public_error(error, config_path, "渠道写入失败"),
                });
            }
        }
        return {
            success: changes.every((change) => change.status === "success"),
            snapshot: snapshot_info,
            changes,
        };
    }

    let save_queue: Promise<void> = Promise.resolve();
    function save(
        request: DevPanelModelRoutingSaveRequest,
    ): Promise<DevPanelModelRoutingSaveResult> {
        const next = save_queue.then(() => save_impl(request));
        save_queue = next.then(
            () => undefined,
            () => undefined,
        );
        return next;
    }

    async function test(
        request: DevPanelModelRoutingTestRequest,
    ): Promise<DevPanelModelRoutingTestResult> {
        try {
            const config = await load();
            const response = await get_transport(config).post("", {
                model: request.model,
                messages: [{ role: "user", content: "ping" }],
                max_tokens: 1,
            });
            if (extract_success(response) === false)
                throw new Error("New API rejected the self-check");
            return { success: true, model_name: extract_model_name(response), error: null };
        } catch (error: unknown) {
            return {
                success: false,
                model_name: null,
                error: public_error(error, config_path, "模型自检失败"),
            };
        }
    }

    async function get_snapshot_info(): Promise<DevPanelModelRoutingSnapshotInfo | null> {
        if (last_snapshot) return last_snapshot.info;
        let raw: unknown;
        try {
            raw = JSON.parse(await readFile(snapshot_path, "utf8")) as unknown;
        } catch (error: unknown) {
            // p244: 文件不存在是正常状态（从未保存过），其余（权限/损坏 JSON）必须留痕，
            // 否则与「无快照」同形。
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
                log.warn(`Model routing snapshot unreadable: ${snapshot_path}`, {
                    error: error instanceof Error ? error.message : String(error),
                });
            }
            return null;
        }
        const info = as_record(as_record(raw)["info"]);
        const snapshot_id = string_value(info["snapshot_id"]);
        const created_at = string_value(info["created_at"]);
        const channel_count = info["channel_count"];
        if (!snapshot_id || !created_at || typeof channel_count !== "number") {
            log.warn(`Model routing snapshot shape invalid: ${snapshot_path}`);
            return null;
        }
        return { snapshot_id, created_at, channel_count };
    }

    return {
        get_config: async () => to_public_config(await load()),
        get_channels,
        save,
        test,
        get_snapshot_info,
    };
}
