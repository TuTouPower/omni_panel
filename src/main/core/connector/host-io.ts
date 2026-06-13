export interface HttpOpts {
    readonly headers?: Record<string, string>;
    readonly timeout_ms?: number;
}

export interface ConnectorContext {
    readonly http: {
        get_json(endpoint_key: string, path: string, opts?: HttpOpts): Promise<unknown>;
        post_json(
            endpoint_key: string,
            path: string,
            body: unknown,
            opts?: HttpOpts,
        ): Promise<unknown>;
    };
    readonly files: {
        read(path_pattern: string): Promise<string>;
        list(dir_pattern: string): Promise<readonly string[]>;
    };
    readonly params: Record<string, string>;
}
