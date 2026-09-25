import type { Manifest } from "../../../shared/schemas/manifest";
import type { ScriptObservation } from "../../../shared/types/observation";
import type { ConnectorContext } from "./host-io";
import { build_single_observation } from "./observation-factory";

function extract_numeric_headers(
    headers: Record<string, string | string[]>,
    header_names: readonly string[],
): Map<string, number> {
    const result = new Map<string, number>();
    for (const name of header_names) {
        const raw_val = headers[name.toLowerCase()];
        const value = Array.isArray(raw_val) ? raw_val[0] : raw_val;
        if (value !== undefined) {
            const num = Number(value);
            if (Number.isFinite(num)) {
                result.set(name.toLowerCase(), num);
            }
        }
    }
    return result;
}

// NOTE: detect_metric_type uses simple substring matching on header names.
// This is intentionally fragile — it may misclassify headers with ambiguous
// names (e.g. "x-rate-limit-remaining" could match "remaining" or "limit").
// The trade-off is acceptable because probe manifests explicitly list the
// headers they care about, and the heuristic only classifies those.
function detect_metric_type(header_name: string): "remaining" | "used" | "limit" | "unknown" {
    const lower = header_name.toLowerCase();
    // Check for "remaining" first (more specific than "limit")
    if (lower.includes("remaining")) {
        return "remaining";
    }
    // Check for "limit" but not as part of "ratelimit"
    if (lower.endsWith("-limit") || lower.endsWith("_limit") || lower === "limit") {
        return "limit";
    }
    if (lower.includes("quota") || lower.includes("total")) {
        return "limit";
    }
    if (lower.includes("used") || lower.includes("count")) {
        return "used";
    }
    return "unknown";
}

export async function execute_probe(
    manifest: Manifest,
    ctx: ConnectorContext,
): Promise<ScriptObservation[]> {
    if (!manifest.observe?.probe) {
        throw new Error(`Manifest ${manifest.id} has no observe.probe config`);
    }

    const { probe, headers: header_names } = manifest.observe;
    let response_headers: Record<string, string | string[]>;

    try {
        ctx.log.debug(`Probing ${manifest.id}: ${probe.endpoint}${probe.path}`);
        const response = await ctx.http.get_raw(probe.endpoint, probe.path);
        response_headers = response.headers;
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.log.error(`Probe failed for ${manifest.id}: ${message}`);
        throw error;
    }

    const numeric_headers = extract_numeric_headers(response_headers, header_names);
    if (numeric_headers.size === 0) {
        ctx.log.warn(`No numeric headers found for ${manifest.id}`);
        // A30: 抛明确错误并上报失败账号，不再静默返回 []
        ctx.report_failed_account(
            manifest.provider,
            "default",
            manifest.provider,
            `Probe 无可用 metric: manifest ${manifest.id} 未能从响应头解析出任何有效数值指标`,
        );
        throw new Error(
            `Probe 无可用 metric: manifest ${manifest.id} 未能从响应头解析出任何有效数值指标`,
        );
    }

    let used: number | null = null;
    let limit: number | null = null;
    let remaining: number | null = null;

    // A44: 同类型多头首胜记 debug 日志
    for (const [name, value] of numeric_headers) {
        const type = detect_metric_type(name);
        if (type === "remaining") {
            if (remaining === null) {
                remaining = value;
            } else {
                ctx.log.debug(
                    `Probe ${manifest.id}: header "${name}" duplicate for "remaining", using first match`,
                );
            }
        } else if (type === "used") {
            if (used === null) {
                used = value;
            } else {
                ctx.log.debug(
                    `Probe ${manifest.id}: header "${name}" duplicate for "used", using first match`,
                );
            }
        } else if (type === "limit") {
            if (limit === null) {
                limit = value;
            } else {
                ctx.log.debug(
                    `Probe ${manifest.id}: header "${name}" duplicate for "limit", using first match`,
                );
            }
        }
    }

    // remaining means "left", not "used"; derive used from the two
    if (used === null && remaining !== null && limit !== null) {
        used = limit - remaining;
    }

    if (used === null && limit === null) {
        // A30: 推导失败抛明确错误并上报失败账号
        ctx.report_failed_account(
            manifest.provider,
            "default",
            manifest.provider,
            `Probe 无可用 metric: manifest ${manifest.id} 未能推导出 used 或 limit 指标`,
        );
        throw new Error(
            `Probe 无可用 metric: manifest ${manifest.id} 未能推导出 used 或 limit 指标`,
        );
    }

    ctx.log.debug(`Probe for ${manifest.id}: used=${String(used)}, limit=${String(limit)}`);
    return [
        build_single_observation(manifest, {
            window: "month",
            source: "probe",
            used,
            limit,
        }),
    ];
}
