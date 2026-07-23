import type { ConnectorContext } from "../../src/main/core/connector/host-io";
import type { ScriptObservation } from "../../src/shared/types/observation";

declare const ctx: ConnectorContext;

interface BaseModel {
    readonly model_name?: string;
    readonly end_time?: number;
    readonly start_time?: number;
    readonly weekly_end_time?: number;
    readonly weekly_start_time?: number;
    readonly current_interval_total_count?: number;
    readonly current_interval_usage_count?: number;
    readonly current_weekly_total_count?: number;
    readonly current_weekly_usage_count?: number;
    readonly remains_time?: number;
    readonly weekly_remains_time?: number;
}

interface RemainsResponse {
    readonly base_resp?: { readonly status_code?: number; readonly status_msg?: string };
    readonly model_remains?: BaseModel[];
}

const MODEL_LABEL: Record<string, string> = {
    model_text_generation: "文本",
    model_vision: "视觉",
    model_search: "搜索",
    model_image: "图像",
    model_speech: "语音",
    model_fast_video: "快速视频",
    model_video: "视频",
    model_cover_song: "翻唱",
    model_lyrics: "歌词",
    model_music: "音乐",
};

const MODEL_SORT: Record<string, number> = {
    model_text_generation: 0,
    model_vision: 1,
    model_search: 2,
    model_image: 3,
    model_speech: 4,
    model_video: 5,
    model_fast_video: 6,
    model_music: 7,
    model_cover_song: 8,
    model_lyrics: 9,
};

const PERIOD_SORT: Record<string, number> = {
    period_5h: 0,
    period_day: 1,
    period_week: 2,
    period_generic: 3,
};

function to_number(value: unknown): number {
    const parsed = typeof value === "number" ? value : Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

function model_key(name: string | undefined): string | null {
    if (!name) return null;
    if (name === "MiniMax-M*") return "model_text_generation";
    if (name === "coding-plan-vlm") return "model_vision";
    if (name === "coding-plan-search") return "model_search";
    if (name.startsWith("image-")) return "model_image";
    if (name === "speech-hd") return "model_speech";
    if (name.startsWith("MiniMax-Hailuo-") && name.includes("Fast")) return "model_fast_video";
    if (name.startsWith("MiniMax-Hailuo-")) return "model_video";
    if (name === "music-cover") return "model_cover_song";
    if (name === "lyrics_generation") return "model_lyrics";
    if (name.startsWith("music-")) return "model_music";
    return null;
}

function period_key(model: BaseModel): string {
    const hours = (to_number(model.end_time) - to_number(model.start_time)) / 3_600_000;
    if (hours <= 5.1) return "period_5h";
    if (hours <= 24.1) return "period_day";
    if (hours <= 168.1) return "period_week";
    return "period_generic";
}

function period_label(key: string): string {
    if (key === "period_5h") return "5小时";
    if (key === "period_day") return "天";
    if (key === "period_week") return "周";
    return "周期";
}

function status_for(used: number, limit: number): ScriptObservation["status"] {
    if (limit <= 0) return "normal";
    const ratio = used / limit;
    if (ratio >= 0.9) return "critical";
    if (ratio >= 0.75) return "warning";
    return "normal";
}

// Assumes `remains_time` is remaining milliseconds until reset.
// If the API actually returns seconds or another unit, reset_at will be wildly wrong.
// Sanity check: if reset_at would be more than 1 year in the future, treat it as
// a misinterpreted value and return null instead.
const ONE_YEAR_MS = 365 * 24 * 3600 * 1000;

function reset_from_ms(value: unknown): number | null {
    const ms = to_number(value);
    if (ms <= 0) return null;
    const reset_at = Date.now() + ms;
    return reset_at - Date.now() > ONE_YEAR_MS ? null : reset_at;
}

function slug(name: string): string {
    return name.replace(/ /g, "-").replace(/\//g, "-").toLowerCase();
}

function is_weekly_redundant(
    model: BaseModel,
    interval_total: number,
    weekly_total: number,
): boolean {
    if (interval_total <= 0) return false;
    const interval_ms = to_number(model.end_time) - to_number(model.start_time);
    const weekly_ms = to_number(model.weekly_end_time) - to_number(model.weekly_start_time);
    if (interval_ms <= 0 || weekly_ms <= 0) return false;
    return weekly_ms / interval_ms <= weekly_total / interval_total;
}

interface Intermediate extends ScriptObservation {
    readonly _model_sort: number;
    readonly _period_sort: number;
}

async function main(): Promise<ScriptObservation[]> {
    const api_key = (ctx.params["API_KEY"] ?? "").trim();
    if (!api_key) return [];

    const response = (await ctx.http.get_json("default", "/v1/token_plan/remains", {
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${api_key}` },
    })) as RemainsResponse | null;

    const status_code = response?.base_resp?.status_code ?? 0;
    if (status_code !== 0) {
        const msg = response?.base_resp?.status_msg ?? String(status_code);
        throw new Error(`MiniMax API error: ${msg}`);
    }

    const models = response?.model_remains;
    if (!Array.isArray(models) || models.length === 0) {
        ctx.report_failed_account(
            "minimax",
            "minimax",
            "MiniMax",
            "MiniMax 返回空用量（model_remains 空）",
        );
        return [];
    }

    const now = Date.now();
    const base = {
        provider: "minimax",
        account_id: "minimax",
        account_label: "MiniMax",
        window: "total" as const,
        cycleDurationMs: null,
        display_style: "ratio" as const,
        observed_at: now,
        source: "poll" as const,
        stale: false,
        last_error: null,
    };

    const intermediate: Intermediate[] = [];

    for (const model of models) {
        const raw_name = model.model_name ?? "unknown";
        const key = model_key(raw_name);
        const label = key ? (MODEL_LABEL[key] ?? raw_name) : raw_name;
        const model_slug = slug(raw_name);

        const interval_total = to_number(model.current_interval_total_count);
        const interval_used = to_number(model.current_interval_usage_count);
        const weekly_total = to_number(model.current_weekly_total_count);
        const weekly_used = to_number(model.current_weekly_usage_count);

        if (interval_total > 0) {
            const pk = period_key(model);
            intermediate.push({
                ...base,
                metric_id: `minimax:${model_slug}-interval`,
                raw_label: `${model_slug}-interval`,
                normalized_label: `${label} (${period_label(pk)})`,
                used: Math.max(interval_used, 0),
                limit: Math.max(interval_total, 0),
                reset_at: reset_from_ms(model.remains_time),
                cycleDurationMs: Math.max(
                    0,
                    to_number(model.end_time) - to_number(model.start_time),
                ),
                status: status_for(interval_used, interval_total),
                _model_sort: key ? (MODEL_SORT[key] ?? 99) : 99,
                _period_sort: PERIOD_SORT[pk] ?? 99,
            });
        }

        if (weekly_total > 0 && !is_weekly_redundant(model, interval_total, weekly_total)) {
            intermediate.push({
                ...base,
                metric_id: `minimax:${model_slug}-week`,
                raw_label: `${model_slug}-week`,
                normalized_label: `${label} (${period_label("period_week")})`,
                used: Math.max(weekly_used, 0),
                limit: Math.max(weekly_total, 0),
                reset_at: reset_from_ms(model.weekly_remains_time),
                cycleDurationMs: 7 * 24 * 3_600_000,
                status: status_for(weekly_used, weekly_total),
                _model_sort: key ? (MODEL_SORT[key] ?? 99) : 99,
                _period_sort: PERIOD_SORT["period_week"] ?? 99,
            });
        }
    }

    intermediate.sort((a, b) => {
        if (a._model_sort !== b._model_sort) return a._model_sort - b._model_sort;
        return a._period_sort - b._period_sort;
    });

    return intermediate.map((item) => {
        const { _model_sort: _m, _period_sort: _p, ...rest } = item;
        void _m;
        void _p;
        return rest;
    });
}

void main;
