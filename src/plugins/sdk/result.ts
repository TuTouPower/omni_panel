const SCHEMA_VERSION = 1;

export interface UsageItem {
    id: string;
    name: string;
    used: number;
    limit: number;
    displayStyle: "percent" | "ratio";
    resetAt?: string | null;
    status: "normal" | "warning" | "critical" | "unknown";
    color?: "blue" | "green" | "yellow" | "orange" | "red";
}

export interface PluginChart {
    kind: string;
    period: string;
    bucketUnit: "hour" | "day";
    buckets: {
        id?: string;
        label: string;
        segments: { model: string; tokens: number }[];
    }[];
    message?: string | null;
}

export interface PluginSuccessOutput {
    success: true;
    schemaVersion: number;
    updatedAt: string;
    items: UsageItem[];
    badge?: string;
    chart?: PluginChart;
}

export interface PluginFailureOutput {
    success: false;
    error: { code: string; message: string };
}

export type PluginOutput = PluginSuccessOutput | PluginFailureOutput;

function utcNowIso(): string {
    return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function ok(
    payload: Omit<PluginSuccessOutput, "success" | "schemaVersion" | "updatedAt"> & {
        updatedAt?: string;
    },
): PluginSuccessOutput {
    return {
        success: true,
        schemaVersion: SCHEMA_VERSION,
        updatedAt: payload.updatedAt ?? utcNowIso(),
        items: payload.items,
        ...(payload.badge !== undefined && { badge: payload.badge }),
        ...(payload.chart !== undefined && { chart: payload.chart }),
    };
}

export function fail(code: string, message: string): PluginFailureOutput {
    return { success: false, error: { code, message } };
}
