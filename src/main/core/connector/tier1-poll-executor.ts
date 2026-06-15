import { createLogger } from "../../../shared/lib/logger";
import type { Manifest } from "../../../shared/schemas/manifest";
import type { Observation, ObservationWindow } from "../../../shared/types/observation";
import type { ConnectorContext } from "./host-io";

const log = createLogger("tier1-poll");

function resolve_json_path(data: unknown, path: string): unknown {
    if (!path.startsWith("$")) return path;

    const parts = path.replace(/^\$\.?/, "").split(".");
    let current = data;
    for (const part of parts) {
        if (typeof current !== "object" || current === null) return undefined;
        current = (current as Record<string, unknown>)[part];
    }
    return current;
}

function to_number(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function to_window(value: unknown): ObservationWindow {
    if (value === "second" || value === "day" || value === "month" || value === "total") {
        return value;
    }
    return "month";
}

export async function execute_poll(
    manifest: Manifest,
    instance_id: string,
    ctx: ConnectorContext,
): Promise<Observation[]> {
    if (!manifest.poll) {
        throw new Error(`Manifest ${manifest.id} has no poll config`);
    }

    const { request, map } = manifest.poll;
    let response: unknown;
    try {
        response =
            request.method === "POST"
                ? await ctx.http.post_json(request.endpoint, request.path, request.body)
                : await ctx.http.get_json(request.endpoint, request.path);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        log.error(`Poll failed for ${manifest.id}: ${message}`);
        throw error;
    }

    const used = to_number(resolve_json_path(response, map["used"] ?? ""));
    const limit = to_number(resolve_json_path(response, map["limit"] ?? ""));
    if (used === null && limit === null) return [];

    const window = to_window(resolve_json_path(response, map["window"] ?? "month"));

    return [
        {
            provider: manifest.provider,
            source_instance_id: instance_id,
            account_id: "default",
            account_label: manifest.provider,
            metric_id: `${manifest.id}:usage`,
            name: "Usage",
            raw_label: "usage",
            normalized_label: "Usage",
            window,
            used,
            limit,
            display_style: "ratio",
            reset_at: null,
            status: "normal",
            observed_at: Date.now(),
            source: "poll",
            stale: false,
            last_error: null,
        },
    ];
}
