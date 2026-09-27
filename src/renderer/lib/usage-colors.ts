import type { UsageBarColorScheme } from "../../shared/types/config";
import { createLogger } from "../../shared/lib/logger";
import type { OverviewColorMember } from "./provider-usage";

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

/** 与 UsageBarRow 同口径的聚合前单账号 pct（四舍五入 + clamp）。 */
export function usage_pct(used: number | null, limit: number | null): number {
    if (used === null || limit === null || limit <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round((used / limit) * 100)));
}

/** 与 UsageBarRow 同口径的 elapsed（周期进度 0~1，无周期信息时 undefined）。 */
export function usage_elapsed(
    resetAt: number | null | undefined,
    cycleDurationMs: number | null | undefined,
    now: number = Date.now(),
): number | undefined {
    if (resetAt && cycleDurationMs) {
        return Math.min(1, Math.max(0, 1 - (resetAt - now) / cycleDurationMs));
    }
    return undefined;
}

/**
 * 多个风险色 token 的 RGB 平均。
 * 用嵌套 `color-mix(in srgb, …)` 表达，浏览器在渲染期按当前主题解析
 * `var(--color-*)` 后再平均（浅/暗主题自动生效），避免在 renderer
 * 维护 hex 副本（d044 单源约束）。同色直接复用原 token，不包 mix。
 */
export function average_fill_colors(colors: readonly string[]): string {
    const first = colors[0];
    if (first === undefined) return "var(--color-success)";
    if (colors.every((c) => c === first)) return first;
    let acc = first;
    for (let i = 1; i < colors.length; i += 1) {
        const next = colors[i];
        if (next === undefined) continue;
        const weight = Number(((i / (i + 1)) * 100).toFixed(4)).toString();
        acc = `color-mix(in srgb, ${acc} ${weight}%, ${next})`;
    }
    return acc;
}

/**
 * 概览条填充色：风险色模式下取各子账号风险色的平均值，
 * 宽度仍用 sum(used)/sum(limit) 的聚合 pct（由调用方渲染）。
 * nine-cycle / 无成员时回退到聚合 pct 的常规取色。
 */
export function overview_fill_color(
    scheme: UsageBarColorScheme | undefined,
    aggregated: { pct: number; idx: number; elapsed?: number | undefined },
    members: readonly OverviewColorMember[] | undefined,
    now: number = Date.now(),
): string {
    if (scheme === "nine-cycle" || !members || members.length === 0) {
        return bar_fill_color(scheme, aggregated);
    }
    const member_colors = members.map((m) =>
        bar_fill_color(scheme, {
            pct: usage_pct(m.used, m.limit),
            idx: 0,
            elapsed: usage_elapsed(m.resetAt, m.cycleDurationMs, now),
        }),
    );
    const result = average_fill_colors(member_colors);
    if (should_log_raw) {
        log.debug("overview fill color averaged", {
            scheme,
            aggregated,
            member_colors,
            result,
        });
    }
    return result;
}
