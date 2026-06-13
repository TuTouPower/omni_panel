import { createLogger } from "../../../shared/lib/logger";
import type { Manifest } from "../../../shared/schemas/manifest";
import type { Observation } from "../../../shared/types/observation";
import type { ConnectorContext } from "./host-io";

const log = createLogger("probe-executor");

function extract_numeric_headers(
    headers: Record<string, string>,
    header_names: readonly string[],
): Map<string, number> {
    const result = new Map<string, number>();
    for (const name of header_names) {
        const value = headers[name.toLowerCase()];
        if (value !== undefined) {
            const num = Number(value);
            if (Number.isFinite(num)) {
                result.set(name.toLowerCase(), num);
            }
        }
    }
    return result;
}

function detect_metric_type(header_name: string): "used" | "limit" | "unknown" {
    const lower = header_name.toLowerCase();
    // Check for "remaining" first (more specific than "limit")
    if (lower.includes("remaining")) {
        return "used";
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
    instance_id: string,
    ctx: ConnectorContext,
): Promise<Observation[]> {
    if (!manifest.observe?.probe) {
        throw new Error(`Manifest ${manifest.id} has no observe.probe config`);
    }

    const { probe, headers: header_names } = manifest.observe;
    let response_headers: Record<string, string>;

    try {
        log.debug(`Probing ${manifest.id}: ${probe.endpoint}${probe.path}`);
        const response = await ctx.http.get_raw(probe.endpoint, probe.path);
        response_headers = response.headers;
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        log.error(`Probe failed for ${manifest.id}: ${message}`);
        throw error;
    }

    const numeric_headers = extract_numeric_headers(response_headers, header_names);
    if (numeric_headers.size === 0) {
        log.warn(`No numeric headers found for ${manifest.id}`);
        return [];
    }

    let used: number | null = null;
    let limit: number | null = null;

    for (const [name, value] of numeric_headers) {
        const type = detect_metric_type(name);
        if (type === "used" && used === null) {
            used = value;
        } else if (type === "limit" && limit === null) {
            limit = value;
        }
    }

    if (used === null && limit === null) {
        const first = numeric_headers.entries().next().value;
        if (first) {
            used = first[1];
        }
    }

    if (used === null && limit === null) {
        return [];
    }

    return [
        {
            provider: manifest.provider,
            source_instance_id: instance_id,
            account_id: "default",
            account_label: manifest.provider,
            metric_id: `${manifest.id}:usage`,
            name: "Usage",
            window: "month",
            used,
            limit,
            display_style: "ratio",
            reset_at: null,
            status: "normal",
            observed_at: Date.now(),
            source: "probe",
            stale: false,
            last_error: null,
        },
    ];
}
