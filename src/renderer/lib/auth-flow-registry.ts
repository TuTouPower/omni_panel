import type { ConnectorInfo } from "../../shared/types/ipc";
import type { AuthDescriptor, AuthMethod } from "../../shared/schemas/auth";

/**
 * Auth method actually rendered by the add-account dialog.
 *
 * - `session` is NOT a manifest-declared method; it is inferred from connector
 *   capabilities/source for legacy/session cookie connectors (e.g. MiMo).
 * - `local_cli` is the manifest descriptor name for local CLI authorization.
 */
export type ResolvedAuthMethod = AuthMethod | "session";

/**
 * Resolve the auth method for a connector.
 *
 * Priority:
 * 1. Manifest-declared `metadata.auth.method`.
 * 2. Fallback from connector source: `session` -> "session", `local` -> "local_cli".
 * 3. Default to `"apikey"`.
 */
export function resolve_auth_method(connector: ConnectorInfo | undefined): ResolvedAuthMethod {
    if (connector?.metadata?.auth) {
        return connector.metadata.auth.method;
    }
    switch (connector?.source) {
        case "session":
            return "session";
        case "local":
            return "local_cli";
        case "poll":
        case "probe":
        case "wrapper":
        case "gateway":
            return "apikey";
        case undefined:
            return "apikey";
        default:
            return "apikey";
    }
}

/** Return the manifest auth descriptor, if any. */
export function resolve_auth_descriptor(
    connector: ConnectorInfo | undefined,
): AuthDescriptor | null {
    return connector?.metadata?.auth ?? null;
}

/**
 * Fallback secret key name when there is no auth descriptor.
 *
 * Uses the first `type: "secret"` parameter from the manifest, otherwise
 * defaults to `"API_KEY"`.
 */
export function fallback_secret_name(connector: ConnectorInfo | undefined): string {
    const param = connector?.metadata?.parameters?.find((p) => p.type === "secret");
    return param?.name ?? "API_KEY";
}
