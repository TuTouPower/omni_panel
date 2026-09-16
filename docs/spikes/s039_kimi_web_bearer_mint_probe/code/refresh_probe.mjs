/**
 * s039 探针二：用真实 refresh token 直接打 HTTP 刷新接口，验证离线续期可行性。
 *
 * 用法：
 *   node docs/spikes/s039_kimi_web_bearer_mint_probe/code/refresh_probe.mjs
 *
 * 输入：`.scratch/kimi-spike/secrets.json`（由 extract_secrets.mjs 从抓包产物提取，含真实凭据，禁止入库）
 * 输出：stdout 只打印状态码、令牌 sha256 前 8 位与 exp；完整响应写 `.scratch/kimi-spike/refresh_*.json`
 */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const OUT = process.env.SPIKE_OUT ?? join(process.cwd(), ".scratch/kimi-spike");
const BASE = "https://auth.kimi.com";
const METHOD = "/api/account.gateway.v1.AuthService/RefreshToken";

const sha8 = (value) => createHash("sha256").update(String(value)).digest("hex").slice(0, 8);

function decode_jwt(token) {
    try {
        const payload = JSON.parse(
            Buffer.from(
                token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"),
                "base64",
            ).toString("utf8"),
        );
        return {
            exp: payload.exp,
            iat: payload.iat,
            exp_in_s:
                typeof payload.exp === "number"
                    ? payload.exp - Math.floor(Date.now() / 1000)
                    : null,
            keys: Object.keys(payload),
        };
    } catch {
        return null;
    }
}

async function try_refresh(label, refresh_token, extra_headers, body_shape) {
    const body = body_shape === "camel" ? { refreshToken: refresh_token } : { refresh_token };
    const headers = {
        "connect-protocol-version": "1",
        "content-type": "application/json",
        Accept: "application/json",
        Origin: "https://www.kimi.com",
        Referer: "https://www.kimi.com/",
        ...extra_headers,
    };
    const response = await fetch(`${BASE}${METHOD}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
    });
    const text = await response.text();
    let parsed = null;
    try {
        parsed = JSON.parse(text);
    } catch {
        parsed = null;
    }
    const out = {
        label,
        status: response.status,
        content_type: response.headers.get("content-type"),
        body_bytes: text.length,
        body_keys: parsed && typeof parsed === "object" ? Object.keys(parsed) : null,
        error_code: parsed?.code ?? null,
        error_message: typeof parsed?.message === "string" ? parsed.message.slice(0, 200) : null,
        access: parsed?.accessToken
            ? { sha8: sha8(parsed.accessToken), ...decode_jwt(parsed.accessToken) }
            : null,
        refresh: parsed?.refreshToken
            ? { sha8: sha8(parsed.refreshToken), ...decode_jwt(parsed.refreshToken) }
            : null,
        refresh_rotated:
            parsed?.refreshToken && parsed.refreshToken !== refresh_token
                ? true
                : parsed?.refreshToken
                  ? false
                  : null,
    };
    await writeFile(
        join(OUT, `refresh_${label}.json`),
        JSON.stringify({ request_headers: Object.keys(headers), response: parsed }, null, 4),
    );
    console.log(JSON.stringify(out, null, 2));
    return out;
}

async function main() {
    const secrets = JSON.parse(await readFile(join(OUT, "secrets.json"), "utf8"));
    const refresh_token = secrets.refresh_token;
    if (!refresh_token) throw new Error("secrets.json 缺少 refresh_token");
    console.log(
        `refresh token sha8=${sha8(refresh_token)} ${JSON.stringify(decode_jwt(refresh_token))}`,
    );
    console.log(
        `原始 access token sha8=${sha8(secrets.access_token ?? "")} ${JSON.stringify(decode_jwt(secrets.access_token ?? ""))}`,
    );
    console.log("");

    await try_refresh("minimal_camel", refresh_token, {}, "camel");
    await try_refresh("with_headers_camel", refresh_token, secrets.headers ?? {}, "camel");
    await try_refresh("with_headers_snake", refresh_token, secrets.headers ?? {}, "snake");
}

await main();
