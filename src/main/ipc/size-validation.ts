export function isFinitePositiveNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function parseSizeReport(
    value: unknown,
    fields: readonly string[],
): Record<string, number> | null {
    if (typeof value !== "object" || value === null) return null;
    const obj = value as Record<string, unknown>;
    const result: Record<string, number> = {};
    for (const field of fields) {
        const v = obj[field];
        if (!isFinitePositiveNumber(v)) return null;
        result[field] = v;
    }
    return result;
}
