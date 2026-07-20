// 一次性录制本机 local-api 真实响应 → tests/e2e/fixtures/data/responses.json
// 用法：先启动 OmniUsage（packaged 或 dev，读本机 %APPDATA%/OmniUsage 真实数据），
// 再跑 `pnpm e2e:gen-data`。录完 mock 回放，日常 e2e 不再开桌面 app。
//
// 不录明文 secret：/v1/secrets 响应的 value 字段统一替换为 "***"。
// responses.json 入 .gitignore（不入库），含本机真实账号邮箱——本地用。

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const OUT_DIR = resolve(ROOT, "tests/e2e/fixtures/data");
const OUT_FILE = resolve(OUT_DIR, "responses.json");
const BASE = "http://localhost:17863";

async function fetch_json(path) {
    const res = await fetch(`${BASE}${path}`);
    if (!res.ok) throw new Error(`${path} → ${String(res.status)}`);
    return res.json();
}

async function check_health() {
    try {
        const res = await fetch(`${BASE}/v1/health`);
        return res.ok;
    } catch {
        return false;
    }
}

// 脱敏：递归把 value 是字符串且 key 含 secret/password/token/cookie/key 的字段值替换
// 注意：cpa_mgmt_key / API_KEY / session_key 等含 "key" 的都要脱敏
const SECRET_KEY_RE = /(secret|password|token|cookie|key|bearer|credential)/i;
function redact_secrets(obj) {
    if (obj === null || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map(redact_secrets);
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
        if (typeof v === "string" && SECRET_KEY_RE.test(k)) {
            out[k] = "***";
        } else {
            out[k] = redact_secrets(v);
        }
    }
    return out;
}

async function main() {
    if (!(await check_health())) {
        console.error("[gen_fixture] localhost:17863 不在线。请先启动 OmniUsage（packaged 或 pnpm start），再跑本命令。");
        process.exit(1);
    }

    const responses = {};
    const get = async (key, path) => {
        try {
            responses[key] = await fetch_json(path);
            console.log(`[gen_fixture] recorded ${key}`);
        } catch (err) {
            console.warn(`[gen_fixture] skip ${key}: ${err.message}`);
        }
    };

    // connectors list
    await get("GET /v1/connectors", "/v1/connectors");
    const list_body = responses["GET /v1/connectors"];
    const instances = Array.isArray(list_body) ? list_body : list_body?.data || [];
    console.log(`[gen_fixture] ${String(instances.length)} instances`);

    // per-instance state + secrets
    for (const inst of instances) {
        const id = inst.instanceId;
        if (!id) continue;
        await get(`GET /v1/connectors/${id}/state`, `/v1/connectors/${encodeURIComponent(id)}/state`);
        try {
            const sec = await fetch_json(`/v1/secrets?instanceId=${encodeURIComponent(id)}`);
            responses[`GET /v1/secrets?instanceId=${id}`] = redact_secrets(sec);
            console.log(`[gen_fixture] recorded secrets for ${id} (redacted)`);
        } catch (err) {
            console.warn(`[gen_fixture] skip secrets ${id}: ${err.message}`);
        }
    }

    // config
    await get("GET /v1/config", "/v1/config");

    // trend：从第一个 snapshot 的 items 取 provider/accountId/metricId
    const first_state = instances[0] && responses[`GET /v1/connectors/${instances[0].instanceId}/state`];
    const first_item = first_state?.items?.[0] || first_state?.data?.items?.[0];
    if (first_item) {
        const params = new URLSearchParams({
            provider: first_item.provider,
            accountId: first_item.accountId,
            metricId: first_item.id.split(":").slice(-1)[0] || first_item.metricId || "primary",
            days: "7",
        });
        await get(`GET /v1/trend?${params.toString()}`, `/v1/trend?${params.toString()}`);
    }

    // tokenStats
    await get("GET /v1/records", "/v1/records");
    await get("GET /v1/sessions", "/v1/sessions");
    await get("GET /v1/buckets", "/v1/buckets");
    await get("GET /v1/status", "/v1/status");

    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(OUT_FILE, JSON.stringify(responses, null, 2));
    console.log(`[gen_fixture] wrote ${OUT_FILE} (${Object.keys(responses).length} responses)`);
}

main().catch((err) => {
    console.error("[gen_fixture] failed:", err);
    process.exit(1);
});
