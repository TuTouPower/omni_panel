export interface ParsedCookieText {
    readonly header: string;
    readonly names: readonly string[];
}

const COOKIE_FORMAT_ERROR = "无法识别 Cookie 格式";
const INVALID_COOKIE_NAME_PATTERN = /[;=\s]/;
const INVALID_COOKIE_VALUE_PATTERN = /[;\x00-\x1f\x7f]/;

interface CookiePair {
    readonly name: string;
    readonly value: string;
}

function build_parsed_cookie_text(pairs: readonly CookiePair[]): ParsedCookieText {
    if (pairs.length === 0) throw new Error(COOKIE_FORMAT_ERROR);

    return {
        header: pairs.map((pair) => `${pair.name}=${pair.value}`).join("; "),
        names: pairs.map((pair) => pair.name),
    };
}

function is_valid_cookie_name(name: string): boolean {
    return name.length > 0 && !INVALID_COOKIE_NAME_PATTERN.test(name);
}

function is_valid_cookie_value(value: string): boolean {
    return !INVALID_COOKIE_VALUE_PATTERN.test(value);
}

function create_cookie_pair(name: unknown, value: unknown): CookiePair | null {
    if (typeof name !== "string" || !is_valid_cookie_name(name)) {
        throw new Error(COOKIE_FORMAT_ERROR);
    }
    if (value === undefined || value === null) return null;

    let string_value: string;
    if (typeof value === "string") {
        string_value = value;
    } else if (typeof value === "number" || typeof value === "boolean") {
        string_value = String(value);
    } else {
        throw new Error(COOKIE_FORMAT_ERROR);
    }
    if (!is_valid_cookie_value(string_value)) {
        throw new Error(COOKIE_FORMAT_ERROR);
    }

    return {
        name,
        value: string_value,
    };
}

function parse_json_cookie_text(raw: string): ParsedCookieText | null {
    try {
        const parsed = JSON.parse(raw) as unknown;
        const entries = Array.isArray(parsed) ? parsed : [parsed];
        const pairs = entries.flatMap((entry) => {
            if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return [];
            const record = entry as Record<string, unknown>;
            const pair = create_cookie_pair(record["name"], record["value"]);
            return pair ? [pair] : [];
        });
        return build_parsed_cookie_text(pairs);
    } catch (error) {
        if (error instanceof SyntaxError) return null;
        throw error;
    }
}

function parse_netscape_cookie_text(raw: string): ParsedCookieText | null {
    const pairs: CookiePair[] = [];
    let saw_netscape_line = false;

    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed.length === 0 || trimmed.startsWith("#")) continue;

        const columns = line.split("\t");
        if (columns.length < 7) continue;

        saw_netscape_line = true;
        const pair = create_cookie_pair(columns[5], columns.slice(6).join("\t"));
        if (pair) pairs.push(pair);
    }

    if (!saw_netscape_line) return null;
    return build_parsed_cookie_text(pairs);
}

function parse_cookie_header_text(raw: string): ParsedCookieText {
    const pairs = raw
        .split(";")
        .map((part) => part.trim())
        .flatMap((part) => {
            if (part.length === 0) return [];
            const equals_index = part.indexOf("=");
            if (equals_index <= 0) return [];

            const pair = create_cookie_pair(
                part.slice(0, equals_index).trim(),
                part.slice(equals_index + 1).trim(),
            );
            return pair ? [pair] : [];
        });

    return build_parsed_cookie_text(pairs);
}

export function parse_cookie_text(raw: string): ParsedCookieText {
    const trimmed = raw.trim();
    if (trimmed.length === 0) throw new Error(COOKIE_FORMAT_ERROR);

    const json_result = parse_json_cookie_text(trimmed);
    if (json_result) return json_result;

    const netscape_result = parse_netscape_cookie_text(trimmed);
    if (netscape_result) return netscape_result;

    return parse_cookie_header_text(trimmed);
}
