/**
 * 连接器阈值 helper（t066 集中化）。
 * conventions.md 阈值约定：percent 90/75、ratio 0.9/0.75（正向）、余额反向 0.1/0.2。
 * limit<=0 时返回 unknown（无法判阈值）。
 */
export type ThresholdStatus = "normal" | "warning" | "critical" | "unknown";

/** 正向百分比（pct 0-100）：>=90 critical / >=75 warning。 */
export function status_for_pct(pct: number): ThresholdStatus {
    if (pct >= 90) return "critical";
    if (pct >= 75) return "warning";
    return "normal";
}

/** 正向 ratio（used/limit）：limit<=0 unknown / >=0.9 critical / >=0.75 warning。 */
export function status_for_ratio(used: number, limit: number): ThresholdStatus {
    if (limit <= 0) return "unknown";
    const ratio = used / limit;
    if (ratio >= 0.9) return "critical";
    if (ratio >= 0.75) return "warning";
    return "normal";
}

/** 余额反向 ratio（balance/limit）：limit<=0 unknown / <=0.1 critical / <=0.2 warning。 */
export function status_for_balance(balance: number, limit: number): ThresholdStatus {
    if (limit <= 0) return "unknown";
    const ratio = balance / limit;
    if (ratio <= 0.1) return "critical";
    if (ratio <= 0.2) return "warning";
    return "normal";
}
