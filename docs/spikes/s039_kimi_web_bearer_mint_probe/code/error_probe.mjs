/**
 * s039 探针五：刷新接口的错误形态与最小协议要求（供 t492 做错误映射与最小请求实现）。
 * 用法：node docs/spikes/s039_kimi_web_bearer_mint_probe/code/error_probe.mjs
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const OUT = process.env.SPIKE_OUT ?? join(process.cwd(), ".scratch/kimi-spike");
const REFRESH_URL = "https://auth.kimi.com/api/account.gateway.v1.AuthService/RefreshToken";

const CONNECT_HEADERS = {
    "connect-protocol-version": "1",
    "content-type": "application/json",
    Accept: "application/json",
    Origin: "https://www.kimi.com",
    Referer: "https://www.kimi.com/",
};

async function attempt(label, { method = "POST", headers = CONNECT_HEADERS, body } = {}) {
    const response = await fetch(REFRESH_URL, {
        method,
        headers,
        ...(body === undefined ? {} : { body }),
    });
    const text = await response.text();
    let parsed = null;
    try {
        parsed = JSON.parse(text);
    } catch {
        parsed = null;
    }
    console.log(
        JSON.stringify({
            label,
            status: response.status,
            content_type: response.headers.get("content-type"),
            body_bytes: text.length,
            keys: parsed && typeof parsed === "object" ? Object.keys(parsed) : null,
            code: parsed?.code ?? null,
            message: typeof parsed?.message === "string" ? parsed.message.slice(0, 120) : null,
            got_access: Boolean(parsed?.accessToken),
        }),
    );
}

async function main() {
    const secrets = JSON.parse(await readFile(join(OUT, "secrets.json"), "utf8"));
    const good = secrets.refresh_token;

    await attempt("E1 无效 refresh token", { body: JSON.stringify({ refreshToken: "not-a-jwt" }) });
    await attempt("E2 空 refresh token", { body: JSON.stringify({ refreshToken: "" }) });
    await attempt("E3 字段名用 snake_case", {
        body: JSON.stringify({ refresh_token: good }),
    });
    await attempt("E4 无 connect-protocol-version / 无 content-type", {
        headers: { Origin: "https://www.kimi.com" },
        body: JSON.stringify({ refreshToken: good }),
    });
    await attempt("E5 无任何自定义头（纯 fetch POST）", {
        headers: {},
        body: JSON.stringify({ refreshToken: good }),
    });
    await attempt("E6 无 Origin/Referer，保留 connect 头", {
        headers: { "connect-protocol-version": "1", "content-type": "application/json" },
        body: JSON.stringify({ refreshToken: good }),
    });
    await attempt("E7 只带 content-type", {
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken: good }),
    });
    await attempt("E8 只带 connect-protocol-version", {
        headers: { "connect-protocol-version": "1" },
        body: JSON.stringify({ refreshToken: good }),
    });
}

await main();
