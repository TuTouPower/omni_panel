import {
    create_device_code_oauth_manager,
    type DeviceCodeOAuthManager,
} from "./device_code_oauth_manager";
import type {
    HttpPost,
    DeviceCodeStart,
    OAuthLoginResult,
    LoginStatus,
    RefreshResult,
    AutoRefreshOptions,
} from "./oauth_helpers";
import type { VaultBackend } from "../vault/vault-backend";

/**
 * Public Grok CLI OAuth constants — pulled from the multi-provider-usage-widget
 * reference (Rust) and the xAI OIDC discovery document. These are *public*
 * client identifiers/endpoints, never secrets.
 */
export const GROK_DEVICE_AUTH_URL = "https://auth.x.ai/oauth2/device/code";
export const GROK_TOKEN_URL = "https://auth.x.ai/oauth2/token";
export const GROK_CLIENT_ID = "b1a00492-073a-47ea-816f-4c329264a828";
export const GROK_SCOPE = "offline_access grok-cli:access";

export type {
    HttpPost,
    DeviceCodeStart,
    OAuthLoginResult,
    LoginStatus,
    RefreshResult,
    AutoRefreshOptions,
};

/** Grok 与 Kimi 共用同一参数化 manager 接口（t339）。 */
export type GrokOAuthManager = DeviceCodeOAuthManager;

export interface GrokOAuthManagerDeps {
    readonly vault: VaultBackend;
    readonly get_proxy_url?: () => string | undefined;
    /** Injectable HTTP transport for testing. Defaults to undici with optional proxy. */
    readonly http_post?: HttpPost;
}

export function create_grok_oauth_manager(deps: GrokOAuthManagerDeps): GrokOAuthManager {
    return create_device_code_oauth_manager(
        {
            log_name: "grok-oauth",
            provider_label: "Grok",
            device_auth_url: GROK_DEVICE_AUTH_URL,
            token_url: GROK_TOKEN_URL,
            client_id: GROK_CLIENT_ID,
            scope: GROK_SCOPE,
            build_headers: () =>
                Promise.resolve({ "Content-Type": "application/x-www-form-urlencoded" }),
        },
        deps,
    );
}
