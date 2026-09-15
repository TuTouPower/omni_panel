/**
 * s039 探针七：候选路径 3 的否定样本——只用登录 cookie（不带 refreshToken）能否换到新 Bearer / 取数。
 *
 * 复用探针一的持久化 Chrome profile 读取真实 cookie（不打印 cookie 值），然后：
 *   C1 POST RefreshToken，仅带 cookie（无 refreshToken 字段）
 *   C2 POST GetSubscriptionStats，仅带 cookie（无 Authorization）
 *   C3 POST RefreshToken，仅带 refreshToken（无 cookie）——对照，证明 cookie 非必需
 *
 * 用法（需先跑过 probe.mjs 且 profile 仍保留登录态）：
 *   SPIKE_OUT=$PWD/.scratch/kimi-spike node docs/spikes/s039_kimi_web_bearer_mint_probe/code/cookie_probe.mjs
 */
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const OUT = process.env.SPIKE_OUT ?? join(process.cwd(), ".scratch/kimi-spike");
const REFRESH_URL = "https://auth.kimi.com/api/account.gateway.v1.AuthService/RefreshToken";
const QUOTA_URL =
    "https://www.kimi.com/apiv2/kimi.gateway.membership.v2.MembershipService/GetSubscriptionStats";

const sha8 = (value) => createHash("sha256").update(String(value)).digest("hex").slice(0, 8);

async function call(label, url, { cookie_header, body }) {
    const headers = { "content-type": "application/json", Accept: "application/json" };
    if (cookie_header) headers["cookie"] = cookie_header;
    const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body ?? {}),
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
            sent_cookie: Boolean(cookie_header),
            sent_refresh_token: Boolean(body?.refreshToken),
            body_bytes: text.length,
            keys: parsed && typeof parsed === "object" ? Object.keys(parsed).slice(0, 8) : null,
            code: parsed?.code ?? null,
            got_access_token: Boolean(parsed?.accessToken),
            has_quota_fields: Boolean(parsed?.ratelimitCode5h),
        }),
    );
    return response.status;
}

async function main() {
    const secrets = JSON.parse(await readFile(join(OUT, "secrets.json"), "utf8"));
    const context = await chromium.launchPersistentContext(join(OUT, "profile"), {
        channel: process.env.SPIKE_BROWSER === "chromium" ? undefined : "chrome",
        headless: true,
    });
    const cookies = await context.cookies();
    await context.close();

    console.log(
        JSON.stringify({
            cookie_count: cookies.length,
            cookie_names: cookies.map((c) => c.name).slice(0, 12),
            cookie_header_sha8: sha8(cookies.map((c) => `${c.name}=${c.value}`).join("; ")),
        }),
    );
    if (cookies.length === 0) throw new Error("profile 中无 cookie，无法构造 cookie-only 样本");
    const cookie_header = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    await call("C1 RefreshToken cookie-only", REFRESH_URL, { cookie_header });
    await call("C2 GetSubscriptionStats cookie-only", QUOTA_URL, { cookie_header });
    await call("C3 RefreshToken refreshToken-only（对照）", REFRESH_URL, {
        body: { refreshToken: secrets.refresh_token },
    });
}

await main();
