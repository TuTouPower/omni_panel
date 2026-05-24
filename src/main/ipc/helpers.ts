import type { IpcError } from "../../shared/types/ipc";

export type IpcResult<T> =
    | { readonly ok: true; readonly data: T }
    | { readonly ok: false; readonly error: IpcError };

export function ok<T>(data: T): IpcResult<T> {
    return { ok: true, data };
}

export function fail(code: string, message: string): IpcResult<never> {
    return { ok: false, error: { code, message } };
}
