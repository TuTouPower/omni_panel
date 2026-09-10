import type { TokenStatsSession } from "../../../shared/types/token-stats";

/** t227 会话库数据层纯函数：过滤/排序/统计/内容匹配。 */

export interface LibraryFilters {
    readonly agents?: readonly string[];
    readonly search?: string;
    /** 目录精确匹配列表（OR，区分大小写）；内容搜索命中集的客户端补过滤用，口径同后端 directories[]。 */
    readonly directories?: readonly string[];
    readonly start_at?: number;
    readonly end_at?: number;
    /** 总 tokens（四列之和）区间下限/上限（含边界）；内容搜索命中集的客户端补过滤用。 */
    readonly min_tokens?: number;
    readonly max_tokens?: number;
    /** 轮次区间下限/上限（含边界）。 */
    readonly min_calls?: number;
    readonly max_calls?: number;
}

/** 排序字段（对齐 demo：时间/Token/轮次/标题）；direction 独立，点同字段切换升降。 */
export type LibrarySortField = "ended_at" | "tokens" | "calls" | "title";
export type LibrarySortDirection = "asc" | "desc";

/** 时间筛选预设：全部 / 最近 24h / 最近 7 天 / 最近 30 天 / 自定义（弹层选区间）。 */
export type TimePreset = "all" | "24h" | "7d" | "30d" | "custom";

/** 各预设的回看窗口毫秒数；all/custom 不走窗口。 */
export const TIME_PRESET_WINDOW_MS: Record<Exclude<TimePreset, "all" | "custom">, number> = {
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
};

/**
 * 由预设算后端查询区间。预设以「点击时刻的 now」冻结，避免每次渲染漂移导致
 * 重复拉取；custom 直接用用户所选区间；all/未就绪的 custom 返回空（不限时间）。
 */
export function time_filter_range(
    preset: TimePreset,
    custom_range: { start_at?: number; end_at?: number } | null,
    now: number,
): { start_at?: number; end_at?: number } {
    if (preset === "all") return {};
    if (preset === "custom") {
        if (custom_range?.start_at === undefined) return {};
        return {
            start_at: custom_range.start_at,
            ...(custom_range.end_at !== undefined ? { end_at: custom_range.end_at } : {}),
        };
    }
    return { start_at: now - TIME_PRESET_WINDOW_MS[preset] };
}

export function session_tokens(s: TokenStatsSession): number {
    return s.input_tokens + s.output_tokens + s.cache_read_tokens + s.cache_write_tokens;
}

/** 元信息搜索：标题/cwd/文件路径/id。 */
export function filter_sessions(
    sessions: readonly TokenStatsSession[],
    filters: LibraryFilters,
): TokenStatsSession[] {
    return sessions.filter((s) => {
        if (filters.agents && filters.agents.length > 0 && !filters.agents.includes(s.source)) {
            return false;
        }
        if (
            filters.directories &&
            filters.directories.length > 0 &&
            (s.directory === null || !filters.directories.includes(s.directory))
        ) {
            return false;
        }
        if (filters.start_at !== undefined && s.ended_at < filters.start_at) return false;
        if (filters.end_at !== undefined && s.started_at > filters.end_at) return false;
        if (
            filters.min_tokens !== undefined ||
            filters.max_tokens !== undefined ||
            filters.min_calls !== undefined ||
            filters.max_calls !== undefined
        ) {
            const tokens = session_tokens(s);
            if (filters.min_tokens !== undefined && tokens < filters.min_tokens) return false;
            if (filters.max_tokens !== undefined && tokens > filters.max_tokens) return false;
            if (filters.min_calls !== undefined && s.calls < filters.min_calls) return false;
            if (filters.max_calls !== undefined && s.calls > filters.max_calls) return false;
        }
        if (filters.search) {
            const q = filters.search.toLowerCase();
            const hay = [s.title ?? "", s.directory ?? "", s.id].join(" ").toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    });
}

/** 正文包含关键词（忽略大小写）。 */
export function match_content(text: string, keyword: string): boolean {
    return text.toLowerCase().includes(keyword.toLowerCase());
}

export function sort_sessions(
    sessions: readonly TokenStatsSession[],
    field: LibrarySortField,
    direction: LibrarySortDirection,
): TokenStatsSession[] {
    const sign = direction === "asc" ? 1 : -1;
    const copy = [...sessions];
    switch (field) {
        case "ended_at":
            return copy.sort((a, b) => sign * (a.ended_at - b.ended_at));
        case "tokens":
            return copy.sort((a, b) => sign * (session_tokens(a) - session_tokens(b)));
        case "calls":
            return copy.sort((a, b) => sign * (a.calls - b.calls));
        case "title":
            // 无标题排最后（与后端 COALESCE(title,'') 口径一致：空串最小）。
            return copy.sort((a, b) => {
                const ta = (a.title ?? "").toLowerCase();
                const tb = (b.title ?? "").toLowerCase();
                if (ta === tb) return 0;
                return (ta < tb ? -1 : 1) * sign;
            });
    }
}

export function count_stats(sessions: readonly TokenStatsSession[]): {
    sessions: number;
    agents: number;
    tokens: number;
} {
    const agents = new Set(sessions.map((s) => s.source)).size;
    const tokens = sessions.reduce((acc, s) => acc + session_tokens(s), 0);
    return { sessions: sessions.length, agents, tokens };
}
