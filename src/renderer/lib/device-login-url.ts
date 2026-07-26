import type { DeviceCodeDisplay } from "../hooks/use-device-login";

/**
 * Build the user-facing authorization URL for OAuth device-code login.
 * Prefer the server-provided complete URI; fall back to appending the
 * user_code query parameter so the link is always self-contained.
 */
export function build_device_login_url(device_code: DeviceCodeDisplay): string {
    if (device_code.verification_uri_complete) {
        return device_code.verification_uri_complete;
    }
    const separator = device_code.verification_uri.includes("?") ? "&" : "?";
    return `${device_code.verification_uri}${separator}user_code=${encodeURIComponent(device_code.user_code)}`;
}
