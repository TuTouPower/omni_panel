import type { Observation } from "../types/observation";

export interface TrendPoint {
    readonly date: string;
    readonly percent: number;
}

/**
 * 把 observation-store.query_trend_series 返回的观测序列(可含 null)
 * 归一为 `({ date, percent } | null)[]`。
 *
 * - `observed_at` 转 UTC `YYYY-MM-DD`
 * - `percent = clamp(round(used/limit*100), 0, 100)`
 * - **`display_style` 不影响 percent**:无论 percent 型(used=30, limit=100)
 *   还是 ratio 型(used=0.3, limit=1.0)都按 `used/limit*100` 归一。
 *   存储约定 ratio 型 `used`/`limit` 同比例(如 30/100 或 0.3/1.0)得出相同 percent。
 * - `used null` / `limit null` / `limit<=0` / 非有限数 → 该点返回 null
 *
 * 返回长度与输入一致(不足 days 时按实际点数)。空输入返回空数组。
 */
export function build_trend_series(
    records: readonly (Pick<Observation, "used" | "limit" | "observed_at"> | null)[],
): (TrendPoint | null)[] {
    if (records.length === 0) return [];
    return records.map((obs) => {
        if (obs === null) return null;
        const used = obs.used;
        const limit = obs.limit;
        if (
            used === null ||
            limit === null ||
            limit <= 0 ||
            !Number.isFinite(used) ||
            !Number.isFinite(limit)
        ) {
            return null;
        }
        const ratio = used / limit;
        const percent = Math.min(100, Math.max(0, Math.round(ratio * 100)));
        return { date: format_utc_date(new Date(obs.observed_at)), percent };
    });
}

export function format_utc_date(d: Date): string {
    return `${String(d.getUTCFullYear())}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
        d.getUTCDate(),
    ).padStart(2, "0")}`;
}
