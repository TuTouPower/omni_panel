export interface HttpOpts {
    readonly headers?: Record<string, string>;
    readonly timeout_ms?: number;
}

export interface RawHttpResponse {
    readonly status: number;
    readonly headers: Record<string, string>;
    readonly body: string;
}

export interface ConnectorContext {
    readonly log: {
        debug(message: string, meta?: unknown): void;
        info(message: string, meta?: unknown): void;
        warn(message: string, meta?: unknown): void;
        error(message: string, meta?: unknown): void;
    };
    readonly http: {
        get_json(endpoint_key: string, path: string, opts?: HttpOpts): Promise<unknown>;
        post_json(
            endpoint_key: string,
            path: string,
            body: unknown,
            opts?: HttpOpts,
        ): Promise<unknown>;
        get_raw(endpoint_key: string, path: string, opts?: HttpOpts): Promise<RawHttpResponse>;
    };
    readonly files: {
        read(path_pattern: string): Promise<string>;
        list(path_pattern: string): Promise<readonly string[]>;
    };
    readonly params: Record<string, string>;
}
