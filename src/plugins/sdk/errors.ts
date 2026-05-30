export type HttpError =
    | { readonly kind: "network"; readonly message: string }
    | { readonly kind: "timeout"; readonly timeoutMs: number }
    | { readonly kind: "http"; readonly status: number; readonly body: unknown }
    | { readonly kind: "invalid_json"; readonly status: number; readonly raw: string }
    | { readonly kind: "missing_endpoint"; readonly key: string };

export type Result<T, E = HttpError> =
    | { readonly ok: true; readonly value: T }
    | { readonly ok: false; readonly error: E };
