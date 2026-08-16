import type { UsageBarColorScheme } from "../../shared/types/config";
import { createLogger } from "../../shared/lib/logger";

export const DEFAULT_USAGE_BAR_COLOR_SCHEME: UsageBarColorScheme = "risk-current";

const log = createLogger("renderer:usage-colors");
const should_log_raw = import.meta.env.DEV;

/** nine-cycle 九色：仅引用 token，hex 定义在 globals.css / DESIGN.md。 */
export const USAGE_COLOR_TOKENS = [
    "var(--color-usage-1)",
    "var(--color-usage-2)",
    "var(--color-usage-3)",
    "var(--color-usage-4)",
    "var(--color-usage-5)",
    "var(--color-usage-6)",
    "var(--color-usage-7)",
    "var(--color-usage-8)",
    "var(--color-usage-9)",
] as const;

export function usage_color(idx: number): string {
    const n = USAGE_COLOR_TOKENS.length;
    return USAGE_COLOR_TOKENS[((idx % n) + n) % n] ?? "var(--color-usage-1)";
}

function risk_current_level(pct: number): "green" | "yellow" | "orange" | "red" {
    if (pct >= 95) return "red";
    if (pct > 85) return "orange";
    if (pct > 60) return "yellow";
    return "green";
}

function risk_projected_level(
    pct: number,
    elapsed?: number,
): "green" | "yellow" | "orange" | "red" {
    if (!(elapsed !== undefined && elapsed > 0)) return risk_current_level(pct);
    const projected = pct / 100 / elapsed;
    if (pct >= 95 || projected >= 1) return "red";
    if (pct > 85 || projected >= 0.9) return "orange";
    if (pct > 60 || projected >= 0.75) return "yellow";
    return "green";
}

/* t274: 风险色档位 → 语义 token（旧 --risk-* 兼容桥已删除）。 */
const RISK_TOKENS: Record<"green" | "yellow" | "orange" | "red", string> = {
    green: "var(--color-success)",
    yellow: "var(--color-risk-mid)",
    orange: "var(--color-risk-high)",
    red: "var(--color-risk-critical)",
};

export function bar_fill_color(
    scheme: UsageBarColorScheme | undefined,
    { pct, idx, elapsed }: { pct: number; idx: number; elapsed?: number | undefined },
): string {
    const result =
        scheme === "nine-cycle"
            ? usage_color(idx)
            : scheme === "risk-projected"
              ? RISK_TOKENS[risk_projected_level(pct, elapsed)]
              : RISK_TOKENS[risk_current_level(pct)];
    if (should_log_raw) {
        log.debug("bar fill color raw", { scheme, pct, idx, elapsed, result });
    }
    return result;
}
