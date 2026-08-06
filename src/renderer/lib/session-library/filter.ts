import type { TokenStatsSession } from "../../../shared/types/token-stats";

/** t227 会话库数据层纯函数：过滤/排序/统计/内容匹配。 */

export interface LibraryFilters {
    readonly agents?: readonly string[];
    readonly search?: string;
    readonly start_at?: number;
    readonly end_at?: number;
}

export type LibrarySort = "recent" | "tokens" | "calls" | "earliest";

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
        if (filters.start_at !== undefined && s.ended_at < filters.start_at) return false;
        if (filters.end_at !== undefined && s.started_at > filters.end_at) return false;
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
    sort: LibrarySort,
): TokenStatsSession[] {
    const copy = [...sessions];
    switch (sort) {
        case "recent":
            return copy.sort((a, b) => b.ended_at - a.ended_at);
        case "earliest":
            return copy.sort((a, b) => a.started_at - b.started_at);
        case "tokens":
            return copy.sort((a, b) => session_tokens(b) - session_tokens(a));
        case "calls":
            return copy.sort((a, b) => b.calls - a.calls);
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
