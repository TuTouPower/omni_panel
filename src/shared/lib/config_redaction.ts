const REDACTED_VALUE = "***";
const SECRET_KEY_PATTERNS = [
    /[_-]key\b|^key\b/i,
    /secret/i,
    /cookie/i,
    /token/i,
    /password/i,
    /passwd/i,
    /credential/i,
    /^auth$|auth_token|auth_key/i,
    /private_key|private_token/i,
    /certificate/i,
    /passphrase/i,
    /refresh_token/i,
    /access_key/i,
    /secret_key/i,
];

function is_secret_param_name(name: string): boolean {
    return SECRET_KEY_PATTERNS.some((pattern) => pattern.test(name));
}

function redact_secret_record(value: Record<string, unknown>): Record<string, unknown> {
    const redacted: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
        redacted[k] = v === null || v === undefined ? v : REDACTED_VALUE;
    }
    return redacted;
}

function redact_parameter_values(value: Record<string, unknown>): Record<string, unknown> {
    const redacted: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
        redacted[k] =
            is_secret_param_name(k) && v !== null && v !== undefined
                ? REDACTED_VALUE
                : redact_config_raw(v);
    }
    return redacted;
}

export function redact_config_raw(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(redact_config_raw);
    if (value !== null && typeof value === "object") {
        const redacted: Record<string, unknown> = {};
        for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
            if (key === "providerLabelMaps") {
                redacted[key] = "[redacted]";
            } else if (
                key === "secrets" &&
                entry !== null &&
                typeof entry === "object" &&
                !Array.isArray(entry)
            ) {
                redacted[key] = redact_secret_record(entry as Record<string, unknown>);
            } else if (
                key === "parameterValues" &&
                entry !== null &&
                typeof entry === "object" &&
                !Array.isArray(entry)
            ) {
                redacted[key] = redact_parameter_values(entry as Record<string, unknown>);
            } else {
                redacted[key] = redact_config_raw(entry);
            }
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
