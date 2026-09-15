/**
 * s039 探针三：
 *  A. refresh token 轮换语义——旧 refresh token 刷新后是否仍可用（决定实现是否必须落盘新值）
 *  B. 新 access token 能否直接打 apiv2 quota 口；是否必须带 cookie / x-msh-session-id / x-msh-device-id
 *  C. access/refresh JWT 里是否自带 ssid / device_id（若自带，实现可少依赖请求头捕获）
 *
 * 用法：node docs/spikes/s039_kimi_web_bearer_mint_probe/code/quota_probe.mjs
 * 只打印状态码与字段名，不打印令牌明文。
 */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const OUT = process.env.SPIKE_OUT ?? join(process.cwd(), ".scratch/kimi-spike");
const REFRESH_URL = "https://auth.kimi.com/api/account.gateway.v1.AuthService/RefreshToken";
const QUOTA_URL =
    "https://www.kimi.com/apiv2/kimi.gateway.membership.v2.MembershipService/GetSubscriptionStats";

const sha8 = (value) => createHash("sha256").update(String(value)).digest("hex").slice(0, 8);

function decode_jwt(token) {
    try {
        return JSON.parse(
            Buffer.from(
                token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"),
                "base64",
            ).toString("utf8"),
        );
    } catch {
        return null;
    }
}

async function refresh(refresh_token) {
    const response = await fetch(REFRESH_URL, {
        method: "POST",
        headers: {
            "connect-protocol-version": "1",
            "content-type": "application/json",
            Accept: "application/json",
            Origin: "https://www.kimi.com",
            Referer: "https://www.kimi.com/",
        },
        body: JSON.stringify({ refreshToken: refresh_token }),
    });
    const text = await response.text();
    let parsed = null;
    try {
        parsed = JSON.parse(text);
    } catch {
        parsed = null;
    }
    return { status: response.status, parsed, text_len: text.length };
}

async function quota(label, token, extra_headers = {}) {
    const response = await fetch(QUOTA_URL, {
        method: "POST",
        headers: {
            "connect-protocol-version": "1",
            "content-type": "application/json",
            Accept: "application/json",
            Origin: "https://www.kimi.com",
            Referer: "https://www.kimi.com/settings/subscription?tab=quota",
            Authorization: `Bearer ${token}`,
            ...extra_headers,
        },
        body: "{}",
    });
    const text = await response.text();
    let parsed = null;
    try {
        parsed = JSON.parse(text);
    } catch {
        parsed = null;
    }
    console.log(
        JSON.stringify(
            {
                label,
                status: response.status,
                body_bytes: text.length,
                body_keys:
                    parsed && typeof parsed === "object" ? Object.keys(parsed).slice(0, 12) : null,
                has_5h: Boolean(parsed?.ratelimitCode5h),
                has_7d: Boolean(parsed?.ratelimitCode7d),
                has_balance: Boolean(parsed?.subscriptionBalance),
                error_code: parsed?.code ?? null,
                error_reason: parsed?.reason ?? parsed?.message ?? null,
            },
            null,
            2,
        ),
    );
    return response.status;
}

async function main() {
    const secrets = JSON.parse(await readFile(join(OUT, "secrets.json"), "utf8"));
    const original_refresh = secrets.refresh_token;

    // A. 轮换语义：旧 refresh token 是否已失效
    const reuse = await refresh(original_refresh);
    console.log(
        JSON.stringify(
            {
                case: "A 旧 refresh token 复用",
                status: reuse.status,
                body_keys: reuse.parsed ? Object.keys(reuse.parsed) : null,
                error: reuse.parsed?.code ?? reuse.parsed?.message ?? null,
                new_access_sha8: reuse.parsed?.accessToken ? sha8(reuse.parsed.accessToken) : null,
            },
            null,
            2,
        ),
    );

    // 用一次刷新拿到新鲜 access token
    const fresh = await refresh(original_refresh);
    if (!fresh.parsed?.accessToken) throw new Error(`刷新失败: HTTP ${String(fresh.status)}`);
    const access_token = fresh.parsed.accessToken;
    const access_claims = decode_jwt(access_token) ?? {};
    const refresh_claims = decode_jwt(fresh.parsed.refreshToken ?? "") ?? {};
    await writeFile(
        join(OUT, "quota_probe_tokens.json"),
        JSON.stringify(
            {
                obtained_at: new Date().toISOString(),
                access_token,
                refresh_token: fresh.parsed.refreshToken ?? null,
                access_claims,
                refresh_claims,
            },
            null,
            4,
        ),
    );

    // C. JWT 是否自带 ssid / device_id
    console.log(
        JSON.stringify(
            {
                case: "C JWT claims",
                access_has_ssid:
                    typeof access_claims.ssid === "string" && access_claims.ssid.length > 0,
                access_has_device_id:
                    typeof access_claims.device_id === "string" &&
                    access_claims.device_id.length > 0,
                refresh_has_ssid:
                    typeof refresh_claims.ssid === "string" && refresh_claims.ssid.length > 0,
                refresh_has_device_id:
                    typeof refresh_claims.device_id === "string" &&
                    refresh_claims.device_id.length > 0,
                access_ssid_len: String(access_claims.ssid ?? "").length,
                access_device_id_len: String(access_claims.device_id ?? "").length,
            },
            null,
            2,
        ),
    );

    // B. quota 口认证需求
    await quota("B1 bearer only", access_token);
    await quota("B2 bearer + ssid/device from JWT", access_token, {
        "x-msh-session-id": String(access_claims.ssid ?? ""),
        "x-msh-device-id": String(access_claims.device_id ?? ""),
    });
    await quota("B3 expired access token（负样本）", secrets.access_token);
}

await main();
