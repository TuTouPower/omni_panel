import type { ConnectorContext } from "../../src/main/core/connector/host-io";
import type { Observation } from "../../src/shared/types/observation";

declare const ctx: ConnectorContext;

const SESSION_DIRS = ["~/.codex/sessions", "~/.codex/archived_sessions"];

function is_record(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function to_number(value: unknown): number {
    const parsed = typeof value === "number" ? value : Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

function parse_timestamp(value: unknown): number | null {
    if (typeof value !== "string") return null;
    const ts = Date.parse(value);
    return Number.isFinite(ts) ? ts : null;
}

function day_key(ts_ms: number): string {
    const d = new Date(ts_ms);
    return `${String(d.getUTCFullYear())}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function extract_model(event: Record<string, unknown>): string | null {
    const payload = event["payload"];
    if (!is_record(payload)) return null;
    const model = payload["model"];
    return typeof model === "string" ? model : null;
}

function extract_token_total(event: Record<string, unknown>): number | null {
    const payload = event["payload"];
    if (!is_record(payload)) return null;
    if (payload["type"] !== "token_count") return null;
    const info = payload["info"];
    if (!is_record(info)) return null;
    const usage = info["total_token_usage"];
    if (!is_record(usage)) return null;
    const total = to_number(usage["total_tokens"]);
    return Number.isFinite(total) ? total : null;
}

async function main(): Promise<Observation[]> {
    const all_files: string[] = [];
    for (const dir of SESSION_DIRS) {
        try {
            const files = await ctx.files.list(dir);
            for (const f of files) all_files.push(f);
        } catch {
            continue;
        }
    }

    const aggregates = new Map<string, number>();

    for (const file_path of all_files) {
        let content: string;
        try {
            content = await ctx.files.read(file_path);
        } catch {
            continue;
        }

        let current_model = "unknown";
        let prev_total: number | null = null;

        for (const line of content.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            let parsed: unknown;
            try {
                parsed = JSON.parse(trimmed);
            } catch {
                continue;
            }
            if (!is_record(parsed)) continue;

            if (parsed["type"] === "turn_context") {
                const model = extract_model(parsed);
                if (model) current_model = model;
                continue;
            }

            if (parsed["type"] !== "response.completed") continue;
            const total = extract_token_total(parsed);
            if (total === null) continue;

            const delta = prev_total === null ? total : Math.max(total - prev_total, 0);
            prev_total = total;

            const ts = parse_timestamp(parsed["timestamp"]);
            if (ts === null) continue;

            const key = `${current_model}|${day_key(ts)}`;
            aggregates.set(key, (aggregates.get(key) ?? 0) + delta);
        }
    }

    if (aggregates.size === 0) return [];

    const now = Date.now();
    const observations: Observation[] = [];
    for (const [key, used] of aggregates) {
        const model = key.split("|", 1)[0] ?? "unknown";
        observations.push({
            provider: "codex",
            source_instance_id: "codex",
            account_id: "codex",
            account_label: "Codex",
            metric_id: `codex:${model}`,
            raw_label: model,
            normalized_label: model,
            window: "day",
            used,
            limit: null,
            display_style: "ratio",
            reset_at: null,
            status: "normal",
            observed_at: now,
            source: "local",
            stale: false,
            last_error: null,
        });
    }

    return observations;
}

void main;
