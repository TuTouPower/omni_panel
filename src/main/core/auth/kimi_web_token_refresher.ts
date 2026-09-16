import { createLogger } from "../../../shared/lib/logger";
import { make_default_http_post, to_error, type HttpPost } from "./oauth_helpers";

const log = createLogger("kimi-web-refresh");

/**
 * t492 / d060：kimi_web（Kimi 网页版）Bearer 续期。
 *
 * 网页登录态是 refresh-token 型会话：登录响应下发 accessToken（900 秒）
 * + refreshToken（90 天，每次刷新轮换）。续期端点为 ConnectRPC JSON，
 * 最小请求只需 `content-type: application/json` + `{"refreshToken":"…"}`，
 * 不需要 cookie、`x-msh-*`、`Origin`/`Referer`（s039 实测，见
 * `docs/spikes/s039_kimi_web_bearer_mint_probe/report.md`）。
 */
export const KIMI_WEB_REFRESH_URL =
    "https://auth.kimi.com/api/account.gateway.v1.AuthService/RefreshToken";

/** 判定 access token 是否仍可用时预留的余量：快到期的令牌等同于不可用。 */
export const ACCESS_TOKEN_MARGIN_MS = 60_000;

export interface KimiWebTokenPair {
    readonly access_token: string;
    readonly refresh_token: string;
}

export type KimiWebRefreshResult =
    | { readonly ok: true; readonly tokens: KimiWebTokenPair }
    | {
          readonly ok: false;
          /** true 表示 refresh token 已被服务端拒绝（只能重新登录）。 */
          readonly unauthenticated: boolean;
          readonly error: string;
      };

export interface KimiWebRefreshDeps {
    /** 注入 HTTP 传输（测试用）；缺省走 undici。 */
    readonly http_post?: HttpPost;
    readonly get_proxy_url?: () => string | undefined;
}

function is_record(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decode_jwt_payload(token: string): Record<string, unknown> | null {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    try {
        const payload: unknown = JSON.parse(
            Buffer.from(parts[1] ?? "", "base64url").toString("utf8"),
        );
        return is_record(payload) ? payload : null;
    } catch {
        return null;
    }
}

/** 取 JWT 的 `exp`（秒）并转为毫秒；非 JWT 或字段缺失返回 null。 */
export function decode_jwt_exp_ms(token: string): number | null {
    const payload = decode_jwt_payload(token);
    const exp = payload?.["exp"];
    if (typeof exp !== "number" || !Number.isFinite(exp)) return null;
    return exp * 1000;
}

/**
 * 判断已保存的 `Authorization` 头是否仍可用（用于没有 refresh token 的旧凭据）。
 * 无法解析 JWT 或已过期（含余量）都算不可用——宁可让用户重新登录，也不要用
 * 无效令牌继续采集（t492 AC-002）。
 */
export function is_bearer_usable(
    authorization: unknown,
    options?: { now?: number; margin_ms?: number },
): boolean {
    if (typeof authorization !== "string") return false;
    const token = authorization.replace(/^Bearer\s+/i, "").trim();
    if (!token) return false;
    const exp_ms = decode_jwt_exp_ms(token);
    if (exp_ms === null) return false;
    const now = options?.now ?? Date.now();
    const margin = options?.margin_ms ?? ACCESS_TOKEN_MARGIN_MS;
    return exp_ms > now + margin;
}

/**
 * 用 refresh token 换新 access token。失败分类：
 * - `unauthenticated`：refresh token 被拒（401 `code:"unauthenticated"`）或请求体被拒
 *   （400 `invalid_argument`），只能重新登录；
 * - 其它失败（网络、5xx、响应形状异常）为可重试错误，调用方不应把凭据判为失效。
 */
export async function refresh_kimi_web_tokens(
    refresh_token: string,
    deps: KimiWebRefreshDeps = {},
): Promise<KimiWebRefreshResult> {
    const token = refresh_token.trim();
    if (!token) {
        return { ok: false, unauthenticated: true, error: "missing refresh token" };
    }
    const http_post = deps.http_post ?? make_default_http_post();
    let response: unknown;
    try {
        response = await http_post(
            KIMI_WEB_REFRESH_URL,
            JSON.stringify({ refreshToken: token }),
            {
                // Connect 协议要求 content-type；其余头（connect-protocol-version、
                // Origin/Referer、cookie）实测非必需。
                "content-type": "application/json",
                "connect-protocol-version": "1",
            },
            deps.get_proxy_url?.(),
        );
    } catch (error) {
        return { ok: false, unauthenticated: false, error: to_error(error).message };
    }

    if (is_record(response)) {
        const access_token = response["accessToken"];
        const next_refresh_token = response["refreshToken"];
        if (typeof access_token === "string" && access_token) {
            return {
                ok: true,
                tokens: {
                    access_token,
                    // 轮换：响应通常带回新 refresh token；缺失时保守沿用旧值
                    // （s039 实测旧 refresh token 在轮换后仍可用，不会把凭据写坏）。
                    refresh_token:
                        typeof next_refresh_token === "string" && next_refresh_token
                            ? next_refresh_token
                            : token,
                },
            };
        }
        const code = response["code"];
        if (typeof code === "string") {
            return {
                ok: false,
                unauthenticated: code === "unauthenticated" || code === "invalid_argument",
                error: `kimi refresh rejected: ${code}`,
            };
        }
    }
    log.warn("kimi refresh returned an unexpected response shape");
    return { ok: false, unauthenticated: false, error: "unexpected refresh response shape" };
}
