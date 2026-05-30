// 子进程启动时一次性读 env。OMNI_PLUGIN_ENDPOINTS 形如 {"default":"http://127.0.0.1:1234"}
// RefreshService 已经把 "用户 override overlay 在 metadata 默认上" 的结果整体写进 env (Phase D),
// 所以 SDK 这里只看两层：env > metadata 兜底。
export function resolveEndpoint(key: string, fallbackFromMetadata?: string | null): string | null {
    const envRaw = process.env["OMNI_PLUGIN_ENDPOINTS"];
    if (envRaw) {
        try {
            const map = JSON.parse(envRaw) as Record<string, unknown>;
            const value = map[key];
            if (typeof value === "string" && value.length > 0) return value;
        } catch {
            // 静默 — 注入错就回落到 metadata 默认
        }
    }
    return fallbackFromMetadata ?? null;
}
