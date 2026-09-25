import {
    status_for_pct,
    status_for_ratio,
    status_for_balance,
} from "../../../src/shared/lib/connector-thresholds";

/** 测试用共享 ctx.status（注入 ConnectorContext mock，t066）。 */
export const ctx_status = {
    for_pct: status_for_pct,
    for_ratio: status_for_ratio,
    for_balance: status_for_balance,
} as const;

/** 测试用共享 ctx.util（注入 ConnectorContext mock，t514）。 */
export const ctx_util = {
    to_number: (value: unknown, fallback = 0): number => {
        const parsed = typeof value === "number" ? value : Number(value ?? fallback);
        return Number.isFinite(parsed) ? parsed : fallback;
    },
    to_pct: (value: unknown): number => {
        const raw = typeof value === "number" ? value : Number(value ?? 0);
        const pct = raw <= 1 && raw > 0 ? raw * 100 : raw;
        return Math.round(Math.max(0, Math.min(pct, 100)) * 10) / 10;
    },
    to_reset_at: (value: unknown): number | null => {
        if (typeof value !== "string" || !value) return null;
        const ts = Date.parse(value);
        return Number.isFinite(ts) ? ts : null;
    },
    clamp: (value: number, min: number, max: number): number => {
        return Math.max(min, Math.min(value, max));
    },
} as const;
