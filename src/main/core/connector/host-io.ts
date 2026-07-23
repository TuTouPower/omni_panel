export interface HttpOpts {
    readonly headers?: Record<string, string>;
    readonly timeout_ms?: number;
    /** 跳过连接池，强制新建 TCP+TLS 连接。重试连接级错误时使用。 */
    readonly reset?: boolean;
}

export interface RawHttpResponse {
    readonly status: number;
    readonly headers: Record<string, string>;
    readonly body: string;
}

export interface ConnectorContext {
    readonly trace_id?: string;
    readonly log: {
        debug(message: string, meta?: unknown): void;
        info(message: string, meta?: unknown): void;
        warn(message: string, meta?: unknown): void;
        error(message: string, meta?: unknown): void;
    };
    /**
     * 阈值 helper（t066 集中化）。连接器脚本用 ctx.status.for_pct / for_ratio /
     * for_balance 替代各内联 helper，统一 conventions.md 阈值约定。
     */
    readonly status: {
        for_pct(pct: number): "normal" | "warning" | "critical" | "unknown";
        for_ratio(used: number, limit: number): "normal" | "warning" | "critical" | "unknown";
        for_balance(balance: number, limit: number): "normal" | "warning" | "critical" | "unknown";
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
    /**
     * 脚本在 per-account 循环里 catch 到错误时调此方法上报失败账号。
     * runtime 收集后交给 refresh-service，由后者从 observation-store 取
     * 该账号上次成功观测并复制为 stale 副本（domain.md 不变量 5）。
     */
    readonly report_failed_account: (
        provider: string,
        account_id: string,
        account_label: string,
        error: string,
    ) => void;
}
