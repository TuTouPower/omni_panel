export class PluginHttpError extends Error {
    constructor(
        public readonly statusCode: number,
        message: string,
        public readonly body?: unknown,
    ) {
        super(message);
        this.name = "PluginHttpError";
    }
}

export async function fetchJson<T = unknown>(url: string, options?: RequestInit): Promise<T> {
    let response: Response;
    try {
        response = await fetch(url, options);
    } catch (err) {
        throw new PluginHttpError(0, err instanceof Error ? err.message : String(err));
    }

    const text = await response.text();
    let data: unknown = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        throw new PluginHttpError(response.status, `Invalid JSON response from ${url}`);
    }

    if (!response.ok) {
        throw new PluginHttpError(
            response.status,
            `HTTP ${String(response.status)} from ${url}`,
            data,
        );
    }

    return data as T;
}
