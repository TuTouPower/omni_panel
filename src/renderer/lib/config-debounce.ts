import type { AppConfiguration } from "../../shared/types/config";

export interface ConfigGetResult {
    readonly config: AppConfiguration;
}

export interface DebouncedConfigPatcher {
    /**
     * Merge a partial config patch into the pending set and (re)schedule the
     * debounced flush. Local UI already applied the change optimistically; this
     * only owns persistence (t195 AC4).
     */
    patch(patch: Partial<AppConfiguration>): void;
    /** Flush any pending patch immediately, awaiting the save chain. */
    flush(): Promise<void>;
    /**
     * Unmount cleanup: cancel the pending debounce timer but flush any pending
     * patch (fire-and-forget) so in-flight preference toggles are not lost
     * (t195 f001 — AC7 配置不丢)。清 timer 避免卸载后延迟触发；队列闭包继续持有
     * 完成本次 flush。
     */
    dispose(): void;
}

export interface DebouncedConfigPatcherOptions {
    get(): Promise<ConfigGetResult>;
    save(config: AppConfiguration): Promise<void>;
    on_error?: (err: unknown) => void;
    delay_ms?: number;
}

/**
 * Debounce-and-merge persistence for high-frequency UI preference toggles
 * (collapse/expand/reorder…). Rapid successive patches coalesce into one
 * read-modify-write save after `delay_ms` of quiet; the last merged patch wins.
 * Saves serialize on an internal queue so concurrent flushes cannot interleave
 * get/save or lose the final state.
 */
export function create_debounced_config_patcher(
    opts: DebouncedConfigPatcherOptions,
): DebouncedConfigPatcher {
    const delay_ms = opts.delay_ms ?? 500;
    let pending: Partial<AppConfiguration> = {};
    let timer: ReturnType<typeof setTimeout> | null = null;
    let queue: Promise<void> = Promise.resolve();

    function flush_pending(): Promise<void> {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        const patch = pending;
        pending = {};
        if (Object.keys(patch).length === 0) return queue;
        queue = queue
            .then(async () => {
                const result = await opts.get();
                await opts.save({ ...result.config, ...patch });
            })
            .catch((err: unknown) => {
                opts.on_error?.(err);
            });
        return queue;
    }

    return {
        patch(patch: Partial<AppConfiguration>): void {
            Object.assign(pending, patch);
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                timer = null;
                void flush_pending();
            }, delay_ms);
        },
        flush: () => flush_pending(),
        dispose() {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            // 有 pending 时 fire-and-forget 触发一次 flush，避免卸载丢失偏好
            // （f001）。flush_pending 判空幂等，queue 闭包在 patcher 丢弃后仍
            // 会完成写盘。
            void flush_pending();
        },
    };
}
