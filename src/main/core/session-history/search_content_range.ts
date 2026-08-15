/**
 * t404: searchContent 候选分块区间计算。
 * offset/limit 以候选行下标计；省略 limit 表示扫到末尾（兼容旧全量一次调用）。
 */

export interface SearchContentRange {
    readonly offset: number;
    readonly end: number;
    readonly scanned: number;
    readonly total: number;
    readonly done: boolean;
    readonly next_offset: number;
}

export function clamp_search_content_range(
    total: number,
    offset?: number,
    limit?: number,
): SearchContentRange {
    const safe_total = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
    const raw_offset =
        typeof offset === "number" && Number.isFinite(offset) && offset > 0
            ? Math.floor(offset)
            : 0;
    const clamped_offset = Math.min(Math.max(0, raw_offset), safe_total);
    let end = safe_total;
    if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
        end = Math.min(clamped_offset + Math.floor(limit), safe_total);
    }
    return {
        offset: clamped_offset,
        end,
        scanned: end,
        total: safe_total,
        done: end >= safe_total,
        next_offset: end,
    };
}
