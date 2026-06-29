export interface RendererLogThrottleOptions {
    readonly limit: number;
    readonly window_ms: number;
}

export interface RendererLogThrottleAcceptResult {
    readonly accepted: boolean;
}

export interface RendererLogThrottleNotice {
    readonly dropped_count: number;
}

export interface RendererLogThrottle {
    accept(now_ms: number): RendererLogThrottleAcceptResult;
    flush_notice(now_ms: number): RendererLogThrottleNotice | null;
}

export function create_renderer_log_throttle(
    options: RendererLogThrottleOptions,
): RendererLogThrottle {
    let window_started_ms = 0;
    let accepted_count = 0;
    let dropped_count = 0;

    const roll_window = (now_ms: number): boolean => {
        if (now_ms - window_started_ms < options.window_ms) return false;
        window_started_ms = now_ms;
        accepted_count = 0;
        return true;
    };

    return {
        accept(now_ms) {
            roll_window(now_ms);
            if (accepted_count >= options.limit) {
                dropped_count += 1;
                return { accepted: false };
            }
            accepted_count += 1;
            return { accepted: true };
        },
        flush_notice(now_ms) {
            if (!roll_window(now_ms)) return null;
            if (dropped_count === 0) return null;
            const notice = { dropped_count };
            dropped_count = 0;
            return notice;
        },
    };
}
