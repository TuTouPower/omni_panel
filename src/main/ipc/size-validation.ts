export function isFinitePositiveNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function isFinitePositiveNumberWithMax(value: unknown, max: number): value is number {
    return isFinitePositiveNumber(value) && value <= max;
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
            if (!isFinitePositiveNumberWithMax(v, max)) return null;
        } else {
            if (!isFinitePositiveNumber(v)) return null;
        }
        result[field] = v;
    }
    return result;
}
