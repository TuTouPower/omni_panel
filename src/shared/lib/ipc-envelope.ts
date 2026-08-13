/**
 * IpcResult 信封形状守卫（t341）：preload `invoke` 用它校验 main 返回的
 * IpcResult 信封。移到共享层便于单测覆盖三种形状。
 */
export function is_ipc_result(
    val: unknown,
): val is { ok: boolean; data?: unknown; error?: { code: string; message: string } } {
    if (typeof val !== "object" || val === null) return false;
    const obj = val as Record<string, unknown>;
    if (typeof obj["ok"] !== "boolean") return false;
    if (!obj["ok"] && obj["error"]) {
        if (typeof obj["error"] !== "object") return false;
        const err = obj["error"] as Record<string, unknown>;
        if (typeof err["code"] !== "string") return false;
        if (typeof err["message"] !== "string") return false;
    }
    return true;
}
