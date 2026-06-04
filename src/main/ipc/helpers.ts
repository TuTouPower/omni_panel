import type { IpcResult } from "../../shared/types/ipc";

export type { IpcResult };

export function ok<T>(data: T): IpcResult<T> {
    return { ok: true, data };
}

export function fail(code: string, message: string): IpcResult<never> {
    return { ok: false, error: { code, message } };
}
