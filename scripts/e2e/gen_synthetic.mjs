// 从真实 data/responses.json 脱敏取子集 → tests/e2e/fixtures/synthetic.json（入库，供 CI smoke）
// 用法：先 pnpm e2e:gen-data 录真实响应，再 pnpm e2e:gen-synthetic 产 synthetic
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const SRC = resolve(ROOT, "tests/e2e/fixtures/data/responses.json");
const OUT = resolve(ROOT, "tests/e2e/fixtures/synthetic.json");
const INSTANCE_COUNT = 3;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

if (!existsSync(SRC)) {
    console.error(
        "[gen_synthetic] tests/e2e/fixtures/data/responses.json 不存在，先跑 pnpm e2e:gen-data",
    );
    process.exit(1);
}

const resp = JSON.parse(readFileSync(SRC, "utf8"));

function demo_email(provider, idx) {
    return `demo_${provider || "user"}_${String(idx)}@example.com`;
}

// 递归脱敏：任意 string value 内的邮箱子串替换为 demo_*@example.com
function redact(obj, provider, idx) {
    if (obj === null || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map((x) => redact(x, provider, idx));
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
        if (typeof v === "string") {
            out[k] = v.replace(EMAIL_RE, () => demo_email(provider, idx));
        } else {
            out[k] = redact(v, provider, idx);
        }
    }
    return out;
}

const connectors = resp["GET /v1/connectors"] || [];
const subset = connectors.slice(0, INSTANCE_COUNT);
console.log(`[gen_synthetic] 取 ${String(subset.length)} instance 脱敏`);

const out = {};
out["GET /v1/connectors"] = subset.map((inst, i) => redact(inst, inst.activeProviders?.[0], i));

for (let i = 0; i < subset.length; i++) {
    const inst = subset[i];
    const id = inst.instanceId;
    const provider = inst.activeProviders?.[0];
    const stateKey = `GET /v1/connectors/${id}/state`;
    if (resp[stateKey] !== undefined) out[stateKey] = redact(resp[stateKey], provider, i);
    const secKey = `GET /v1/secrets?instanceId=${id}`;
    if (resp[secKey] !== undefined) out[secKey] = redact(resp[secKey], provider, i);
}

out["GET /v1/config"] =
    resp["GET /v1/config"] !== undefined ? redact(resp["GET /v1/config"], "config", 0) : {};

// trend：拷贝 real responses 全部 trend 条目（百分比点位，无账号邮箱）；key 也过 redact 防御（防 accountId 含邮箱）
for (const [k, v] of Object.entries(resp)) {
    if (k.startsWith("GET /v1/trend?")) {
        const k2 = k.replace(EMAIL_RE, () => demo_email("trend", 0));
        out[k2] = redact(v, "trend", 0);
    }
}
if (resp["GET /v1/status"] !== undefined) out["GET /v1/status"] = resp["GET /v1/status"];

// 加 real enabled+failed connector（web 测 failed/stale card；disabled 的不渲染）
const real_connectors = resp["GET /v1/connectors"] || [];
const failed_real = real_connectors.find(
    (i) => i.enabled === true && i.snapshot?.status === "failed",
);
if (failed_real) {
    const fp = failed_real.activeProviders?.[0];
    const fid = failed_real.instanceId;
    out["GET /v1/connectors"].push(redact(failed_real, fp, 3));
    const fstateKey = `GET /v1/connectors/${fid}/state`;
    if (resp[fstateKey] !== undefined) out[fstateKey] = redact(resp[fstateKey], fp, 3);
    const fsecKey = `GET /v1/secrets?instanceId=${fid}`;
    if (resp[fsecKey] !== undefined) out[fsecKey] = redact(resp[fsecKey], fp, 3);
}

// 固化注入：KIMI failed connector（account_error_badge e2e 需要 items 带 error；
// gen_synthetic 不从 real 产生，必须固化以防 e2e:gen-synthetic 重跑覆盖）。
// 真实失败连接器的 last_error 经 observation_to_metric_record 映射成 item.error。
out["GET /v1/connectors"].push({
    instanceId: "synthetic-kimi-failed",
    sourceInstanceId: "synthetic-kimi-failed",
    stateId: "synthetic-kimi-failed",
    name: "KIMI",
    displayName: "KIMI (failed)",
    enabled: true,
    source: "poll",
    supportedProviders: ["kimi"],
    activeProviders: ["kimi"],
    metadata: null,
    snapshot: {
        status: "failed",
        error: "HTTP 401: request failed (236 bytes)",
        updatedAt: "2026-08-01T00:00:00Z",
        items: [
            {
                id: "synthetic-kimi-failed:kimi:default:kimi:monthly",
                provider: "kimi",
                source: "poll",
                sourceInstanceId: "synthetic-kimi-failed",
                accountId: "default",
                accountLabel: "KIMI",
                raw_label: "monthly_usage",
                normalized_label: "月度用量",
                used: null,
                limit: null,
                window: "month",
                unit: "tokens",
                error: "HTTP 401: request failed (236 bytes)",
            },
        ],
    },
});
out["GET /v1/connectors/synthetic-kimi-failed/state"] = { status: "failed", error: "HTTP 401" };

// 固化注入：opencode_go connector（opencode_go_usage e2e 需要多 workspace ×
// rolling/weekly/monthly 窗口翻译文案 滚动/一周/一月；gen_synthetic 不从 real 产生）。
const opencode_windows = [
    { raw: "rolling", label: "滚动" },
    { raw: "weekly", label: "一周" },
    { raw: "monthly", label: "一月" },
];
const opencode_workspaces = ["wrk_01KXAKZRAR2TP12WEP2GD6D0JB", "wrk_01KXGR0D3TVM4MH2Z3DTWSJWA2"];
const opencode_items = [];
for (const ws of opencode_workspaces) {
    for (const w of opencode_windows) {
        opencode_items.push({
            id: `synthetic-opencode-go:opencode_go:${ws}:${w.raw}`,
            provider: "opencode_go",
            source: "session",
            sourceInstanceId: "synthetic-opencode-go",
            accountId: ws,
            accountLabel: ws,
            raw_label: w.raw,
            normalized_label: w.label,
            used: 40,
            limit: 100,
            window: w.raw === "rolling" ? "rolling" : w.raw === "weekly" ? "week" : "month",
            unit: "percent",
        });
    }
}
out["GET /v1/connectors"].push({
    instanceId: "synthetic-opencode-go",
    sourceInstanceId: "synthetic-opencode-go",
    stateId: "synthetic-opencode-go",
    name: "opencode_go",
    displayName: "opencode_go",
    enabled: true,
    source: "session",
    supportedProviders: ["opencode_go"],
    activeProviders: ["opencode_go"],
    metadata: null,
    snapshot: { status: "ready", updatedAt: "2026-08-01T00:00:00Z", items: opencode_items },
});
out["GET /v1/connectors/synthetic-opencode-go/state"] = { status: "ready", items: opencode_items };

writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`[gen_synthetic] wrote ${OUT} (${String(Object.keys(out).length)} responses)`);

// 兜底校验：无非 example.com 邮箱
const raw = JSON.stringify(out);
const suspicious = raw.match(/[a-zA-Z0-9._%+-]+@(?!example\.com)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
if (suspicious) {
    console.warn(`[gen_synthetic] WARNING 可疑非 demo 邮箱: ${suspicious.slice(0, 5).join(", ")}`);
} else {
    console.log("[gen_synthetic] 脱敏校验通过（无非 example.com 邮箱）");
}
