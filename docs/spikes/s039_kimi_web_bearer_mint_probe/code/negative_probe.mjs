/**
 * s039 探针四（负样本）：确认 quota 口确实校验 Bearer——篡改令牌应 401，避免把「永远 200」误判为通过。
 * 用法：node docs/spikes/s039_kimi_web_bearer_mint_probe/code/negative_probe.mjs
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const OUT = process.env.SPIKE_OUT ?? join(process.cwd(), ".scratch/kimi-spike");
const QUOTA_URL =
    "https://www.kimi.com/apiv2/kimi.gateway.membership.v2.MembershipService/GetSubscriptionStats";

async function call(label, headers) {
    const response = await fetch(QUOTA_URL, {
        method: "POST",
        headers: {
            "connect-protocol-version": "1",
            "content-type": "application/json",
            Accept: "application/json",
            Origin: "https://www.kimi.com",
            Referer: "https://www.kimi.com/settings/subscription?tab=quota",
            ...headers,
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
        JSON.stringify({
            label,
            status: response.status,
            body_bytes: text.length,
            code: parsed?.code ?? null,
            reason: parsed?.reason ?? null,
            message: typeof parsed?.message === "string" ? parsed.message.slice(0, 80) : null,
        }),
    );
}

async function main() {
    const tokens = JSON.parse(await readFile(join(OUT, "quota_probe_tokens.json"), "utf8"));
    const good = tokens.access_token;
    const tampered = `${good.slice(0, good.length - 6)}AAAAAA`;

    await call("N1 有效 Bearer", { Authorization: `Bearer ${good}` });
    await call("N2 篡改签名的 Bearer", { Authorization: `Bearer ${tampered}` });
    await call("N3 无 Authorization（仅 cookie 语义的负样本）", {});
    await call("N4 垃圾 Bearer", { Authorization: "Bearer not-a-jwt" });
}

await main();
