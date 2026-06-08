export function redact_config_raw(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(redact_config_raw);
    if (value !== null && typeof value === "object") {
        const redacted: Record<string, unknown> = {};
        for (const [key, entry] of Object.entries(value)) {
            redacted[key] =
                key === "usageLabelMap" || key === "providerLabelMaps"
                    ? "[redacted]"
                    : redact_config_raw(entry);
        }
        return redacted;
    }
    return value;
}

export function redact_config_json(raw: string): unknown {
    try {
        return redact_config_raw(JSON.parse(raw) as unknown);
    } catch {
        return { bytes: raw.length, parseable: false };
    }
}
