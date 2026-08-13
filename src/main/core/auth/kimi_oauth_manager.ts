import { randomUUID } from "node:crypto";
import { promises as fsp } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createLogger } from "../../../shared/lib/logger";
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
import { to_error } from "./oauth_helpers";
import type { VaultBackend } from "../vault/vault-backend";

const log = createLogger("kimi-oauth");

/**
 * Public Kimi Code CLI OAuth constants — pulled from the KimiCodeBar reference
 * (`KimiOAuthService.swift`). These are *public* client identifiers/endpoints
 * and the device-authorization request shape, never secrets.
 */
export const KIMI_DEVICE_AUTH_URL = "https://auth.kimi.com/api/oauth/device_authorization";
export const KIMI_TOKEN_URL = "https://auth.kimi.com/api/oauth/token";
export const KIMI_CLIENT_ID = "17e5f671-d194-4dfb-9706-5516cb48c098";

export type {
    HttpPost,
    DeviceCodeStart,
    OAuthLoginResult,
    LoginStatus,
    RefreshResult,
    AutoRefreshOptions,
};

export type GetDeviceId = () => Promise<string | null>;

/** Grok 与 Kimi 共用同一参数化 manager 接口（t339）。 */
export type KimiOAuthManager = DeviceCodeOAuthManager;

export interface KimiOAuthManagerDeps {
    readonly vault: VaultBackend;
    readonly get_proxy_url?: () => string | undefined;
    /** Injectable HTTP transport for testing. Defaults to undici with optional proxy. */
    readonly http_post?: HttpPost;
    /**
     * Injectable device-id resolver for testing. Defaults to reading (or creating)
     * `~/.kimi-code/device_id` with 0600 permissions. Return null to omit the header.
     */
    readonly get_device_id?: GetDeviceId;
}

// t340: device_id 进程内缓存。undefined=未读；string=已成功读到（缓存）；
// 失败返回 null 且不缓存，下次请求重读文件。
let cached_device_id: string | null | undefined;

/**
 * Default device-id resolver: read `~/.kimi-code/device_id`; if absent, generate a
 * UUID and persist it with 0600 permissions. Returns null only if persistence
 * fails (header then omitted, matching KimiOAuthService.swift loadOrCreateDeviceID).
 * Successful value is cached for the process lifetime; failures are re-read on
 * the next call.
 */
export function make_default_get_device_id(): GetDeviceId {
    return async () => {
        if (cached_device_id !== undefined) return cached_device_id;
        const dir = path.join(os.homedir(), ".kimi-code");
        const file = path.join(dir, "device_id");
        try {
            const existing = await fsp.readFile(file, "utf8");
            const id = existing.trim();
            if (id) {
                cached_device_id = id;
                return id;
            }
        } catch {
            // fall through to generation
        }
        try {
            const id = randomUUID();
            await fsp.mkdir(dir, { recursive: true });
            await fsp.writeFile(file, id, { mode: 0o600 });
            cached_device_id = id;
            return id;
        } catch (error) {
            log.warn(`get_device_id: failed to persist device id: ${to_error(error).message}`);
            return null;
        }
    };
}

export function create_kimi_oauth_manager(deps: KimiOAuthManagerDeps): KimiOAuthManager {
    const get_device_id: GetDeviceId = deps.get_device_id ?? make_default_get_device_id();
    return create_device_code_oauth_manager(
        {
            log_name: "kimi-oauth",
            provider_label: "Kimi",
            device_auth_url: KIMI_DEVICE_AUTH_URL,
            token_url: KIMI_TOKEN_URL,
            client_id: KIMI_CLIENT_ID,
            build_headers: async () => {
                const headers: Record<string, string> = {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Accept: "application/json",
                    "X-Msh-Platform": "kimi_code_cli",
                };
                const device_id = await get_device_id();
                if (device_id) headers["X-Msh-Device-Id"] = device_id;
                return headers;
            },
        },
        deps,
    );
}
