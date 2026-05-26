export type AppLanguage = "zh-Hans" | "en";

export function statusFor(used: number, total: number): "normal" | "warning" | "critical" {
    const pct = total > 0 ? (used / total) * 100 : 0;
    if (pct >= 90) return "critical";
    if (pct >= 75) return "warning";
    return "normal";
}

export function colorFor(
    used: number,
    total: number,
): "blue" | "green" | "yellow" | "orange" | "red" {
    const pct = total > 0 ? (used / total) * 100 : 0;
    if (pct >= 90) return "red";
    if (pct >= 80) return "orange";
    if (pct >= 60) return "yellow";
    return "blue";
}

export function colorForPct(pct: number): "blue" | "green" | "yellow" | "orange" | "red" {
    if (pct >= 90) return "red";
    if (pct >= 80) return "orange";
    if (pct >= 60) return "yellow";
    return "blue";
}

const COMMON_TRANSLATIONS: Record<string, Record<string, string>> = {
    missing_api_key: {
        "zh-Hans": "请在插件设置中配置 API Key",
        en: "Configure API Key in plugin settings",
    },
    request_timeout: {
        "zh-Hans": "请求超时，请检查网络",
        en: "Request timed out. Check your network.",
    },
    network_error: {
        "zh-Hans": "网络连接失败，请检查网络",
        en: "Network error. Check your connection.",
    },
    usage_parse_failed: { "zh-Hans": "用量数据解析失败", en: "Failed to parse usage data" },
};

export type TranslateFn = (
    language: AppLanguage,
    key: string,
    kwargs?: Record<string, string | number>,
) => string;

export function makeTranslator(translations: Record<string, Record<string, string>>): TranslateFn {
    const merged = { ...COMMON_TRANSLATIONS, ...translations };
    return (language, key, kwargs) => {
        const values = merged[key] ?? {};
        const text = values[language] ?? values["zh-Hans"] ?? key;
        if (!kwargs) return text;
        return Object.entries(kwargs).reduce(
            (acc, [k, v]) => acc.replace(`{${k}}`, String(v)),
            text,
        );
    };
}

export function appLanguage(params: Record<string, string>): AppLanguage {
    return params["USAGEBOARD_LANGUAGE"] === "en" ? "en" : "zh-Hans";
}

export function numeric(value: unknown): number {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
        const n = Number(value);
        return Number.isNaN(n) ? 0 : n;
    }
    return 0;
}
