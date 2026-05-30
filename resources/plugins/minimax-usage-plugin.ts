// UsageBoardPlugin:
// {
//   "schemaVersion": 1,
//   "name": "MiniMax",
//   "name@zh-Hans": "MiniMax",
//   "name@en": "MiniMax",
//   "icon": "https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-png/light/minimax-color.png",
//   "description": "查询 MiniMax Coding Plan 用量",
//   "description@zh-Hans": "查询 MiniMax Coding Plan 用量",
//   "description@en": "Query MiniMax Coding Plan usage",
//   "parameters": [
//     {
//       "name": "API_KEY",
//       "label": "Api Key",
//       "label@zh-Hans": "Api Key",
//       "label@en": "API Key",
//       "type": "secret",
//       "required": true,
//       "placeholder": "MiniMax API Key"
//     }
//   ]
// }
// /UsageBoardPlugin

import {
    definePlugin,
    requireParam,
    ok,
    failFromHttp,
    numeric,
    statusFor,
    colorFor,
} from "@omni-usage/plugin-sdk";

const METADATA_ENDPOINTS = { default: "https://www.minimaxi.com" };

const MODEL_SORT_ORDER: Record<string, number> = {
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

const PERIOD_ORDER: Record<string, number> = {
    period_5h: 0,
    period_day: 1,
    period_week: 2,
    period_generic: 3,
};

const IMAGE_PLAN_BADGES: Record<number, string> = {
    50: "Plus",
    120: "Max",
    100: "Plus High",
    200: "Max High",
    800: "Ultra High",
};

const translations = {
    model_text_generation: { "zh-Hans": "文本", en: "Text" },
    model_vision: { "zh-Hans": "视觉", en: "Vision" },
    model_search: { "zh-Hans": "搜索", en: "Search" },
    model_image: { "zh-Hans": "图像", en: "Image" },
    model_speech: { "zh-Hans": "语音", en: "Speech" },
    model_fast_video: { "zh-Hans": "快速视频", en: "Fast video" },
    model_video: { "zh-Hans": "视频", en: "Video" },
    model_cover_song: { "zh-Hans": "翻唱", en: "Cover song" },
    model_lyrics: { "zh-Hans": "歌词", en: "Lyrics" },
    model_music: { "zh-Hans": "音乐", en: "Music" },
    period_5h: { "zh-Hans": "5小时", en: "5 hours" },
    period_day: { "zh-Hans": "天", en: "day" },
    period_week: { "zh-Hans": "周", en: "week" },
    period_generic: { "zh-Hans": "周期", en: "period" },
    no_quota_items: { "zh-Hans": "未获取到配额数据", en: "No quota data found." },
    invalid_api_key: {
        "zh-Hans": "API Key 无效，请检查配置",
        en: "Invalid API Key. Check your settings.",
    },
};

interface BaseModel {
    model_name?: string;
    end_time?: number;
    start_time?: number;
    weekly_end_time?: number;
    weekly_start_time?: number;
    current_interval_total_count?: number;
    current_interval_usage_count?: number;
    current_weekly_total_count?: number;
    current_weekly_usage_count?: number;
    remains_time?: number;
    weekly_remains_time?: number;
}

interface RemainsResponse {
    base_resp?: { status_code?: number; status_msg?: string };
    model_remains?: BaseModel[];
}

interface SortableItem {
    id: string;
    name: string;
    used: number;
    limit: number;
    displayStyle: "ratio";
    resetAt?: string;
    status: string;
    color?: string;
    _sort_model_key?: string;
    _sort_period_key?: string;
}

function modelDisplayKey(modelName: string): string | null {
    if (modelName === "MiniMax-M*") return "model_text_generation";
    if (modelName === "coding-plan-vlm") return "model_vision";
    if (modelName === "coding-plan-search") return "model_search";
    if (modelName.startsWith("image-")) return "model_image";
    if (modelName === "speech-hd") return "model_speech";
    if (modelName.startsWith("MiniMax-Hailuo-") && modelName.includes("Fast"))
        return "model_fast_video";
    if (modelName.startsWith("MiniMax-Hailuo-")) return "model_video";
    if (modelName === "music-cover") return "model_cover_song";
    if (modelName === "lyrics_generation") return "model_lyrics";
    if (modelName.startsWith("music-")) return "model_music";
    return null;
}

function intervalLabelKey(model: BaseModel): string {
    const timeDiffMs = numeric(model.end_time) - numeric(model.start_time);
    const hoursDiff = timeDiffMs / 1000 / 3600;
    if (hoursDiff <= 5.1) return "period_5h";
    if (hoursDiff <= 24.1) return "period_day";
    if (hoursDiff <= 168.1) return "period_week";
    return "period_generic";
}

function resetAtFromRemainingMs(value: unknown): string | undefined {
    const remainingMs = numeric(value);
    if (remainingMs <= 0) return undefined;
    return new Date(Date.now() + remainingMs).toISOString();
}

function buildItem(
    itemId: string,
    name: string,
    used: number,
    total: number,
    resetAt: string | undefined,
): SortableItem {
    return {
        id: itemId,
        name,
        used: Math.max(used, 0),
        limit: Math.max(total, 0),
        displayStyle: "ratio",
        resetAt,
        status: statusFor(used, total),
        color: colorFor(used, total),
    };
}

function isWeeklyRedundant(model: BaseModel, intervalTotal: number, weeklyTotal: number): boolean {
    if (intervalTotal <= 0) return false;
    const intervalMs = numeric(model.end_time) - numeric(model.start_time);
    const weeklyMs = numeric(model.weekly_end_time) - numeric(model.weekly_start_time);
    if (intervalMs <= 0 || weeklyMs <= 0) return false;
    return weeklyMs / intervalMs <= weeklyTotal / intervalTotal;
}

function buildItems(
    payload: RemainsResponse,
    translate: (key: string) => string,
): { items: SortableItem[]; badge: string | null } {
    const models = payload.model_remains;
    if (!Array.isArray(models)) return { items: [], badge: null };

    let badge: string | null = null;
    const output: SortableItem[] = [];

    for (const model of models) {
        const rawName = model.model_name ?? "unknown";
        const modelKey = modelDisplayKey(rawName);
        const name = modelKey ? translate(modelKey) : rawName;
        const slug = rawName.replace(/ /g, "-").replace(/\//g, "-").toLowerCase();

        const intervalTotal = numeric(model.current_interval_total_count);
        const intervalUsed = numeric(model.current_interval_usage_count);
        const weeklyTotal = numeric(model.current_weekly_total_count);
        const weeklyUsed = numeric(model.current_weekly_usage_count);

        if (rawName === "image-01" && badge === null && intervalTotal > 0) {
            if (intervalTotal === Math.floor(intervalTotal)) {
                badge = IMAGE_PLAN_BADGES[intervalTotal] ?? null;
            }
        }

        if (intervalTotal > 0) {
            const periodKey = intervalLabelKey(model);
            const entry = buildItem(
                `minimax-${slug}-interval`,
                `${name} (${translate(periodKey)})`,
                intervalUsed,
                intervalTotal,
                resetAtFromRemainingMs(model.remains_time),
            );
            entry._sort_model_key = modelKey ?? undefined;
            entry._sort_period_key = periodKey;
            output.push(entry);
        }

        if (weeklyTotal > 0 && !isWeeklyRedundant(model, intervalTotal, weeklyTotal)) {
            const periodKey = "period_week";
            const entry = buildItem(
                `minimax-${slug}-week`,
                `${name} (${translate(periodKey)})`,
                weeklyUsed,
                weeklyTotal,
                resetAtFromRemainingMs(model.weekly_remains_time),
            );
            entry._sort_model_key = modelKey ?? undefined;
            entry._sort_period_key = periodKey;
            output.push(entry);
        }
    }

    badge ??= "Starter";

    output.sort((a, b) => {
        const aModel =
            MODEL_SORT_ORDER[a._sort_model_key ?? ""] ?? Object.keys(MODEL_SORT_ORDER).length;
        const bModel =
            MODEL_SORT_ORDER[b._sort_model_key ?? ""] ?? Object.keys(MODEL_SORT_ORDER).length;
        if (aModel !== bModel) return aModel - bModel;
        const aPeriod = PERIOD_ORDER[a._sort_period_key ?? ""] ?? 99;
        const bPeriod = PERIOD_ORDER[b._sort_period_key ?? ""] ?? 99;
        return aPeriod - bPeriod;
    });

    for (const entry of output) {
        delete entry._sort_model_key;
        delete entry._sort_period_key;
    }

    return { items: output, badge };
}

definePlugin(
    async (ctx) => {
        const apiKey = requireParam(ctx.params, "API_KEY");

        const result = await ctx.http.getJson<RemainsResponse>(
            "default",
            "/v1/token_plan/remains",
            {
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`,
                },
            },
        );
        if (!result.ok) return failFromHttp(result.error, "minimax");

        try {
            const statusCode = result.value.base_resp?.status_code ?? 0;
            if (statusCode !== 0) {
                if (statusCode === 2049)
                    return failFromHttp(
                        { kind: "http", status: 401, body: result.value },
                        "minimax",
                    );
                const statusMsg = result.value.base_resp?.status_msg ?? "";
                return failFromHttp(
                    {
                        kind: "http",
                        status: 200,
                        body: statusMsg
                            ? `${statusMsg} (${String(statusCode)})`
                            : String(statusCode),
                    },
                    "minimax",
                );
            }
            const { items, badge } = buildItems(result.value, ctx.t);
            if (items.length === 0)
                return failFromHttp({ kind: "invalid_json", status: 200, raw: "" }, "minimax");
            return ok({ items, ...(badge !== null && { badge }) });
        } catch {
            return failFromHttp({ kind: "invalid_json", status: 200, raw: "" }, "minimax");
        }
    },
    { metadata: { endpoints: METADATA_ENDPOINTS }, translations },
);
