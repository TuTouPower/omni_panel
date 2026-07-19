export function isFiniteNonNegativeNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function isFiniteNonNegativeNumberWithMax(value: unknown, max: number): value is number {
    return isFiniteNonNegativeNumber(value) && value <= max;
}

export function parseSizeReport(
    value: unknown,
    fields: readonly string[],
    max?: number,
): Record<string, number> | null {
    if (typeof value !== "object" || value === null) return null;
    const obj = value as Record<string, unknown>;
    const result: Record<string, number> = {};
    for (const field of fields) {
        const v = obj[field];
        if (max !== undefined) {
            if (!isFiniteNonNegativeNumberWithMax(v, max)) return null;
        } else {
            if (!isFiniteNonNegativeNumber(v)) return null;
        }
        result[field] = v;
    }
    return result;
}
