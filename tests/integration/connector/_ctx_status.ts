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
