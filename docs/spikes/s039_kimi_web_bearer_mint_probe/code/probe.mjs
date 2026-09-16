/**
 * s039 探针：kimi 网页会话是否能用 cookie/refresh token 通过 HTTP 换取新 Bearer。
 *
 * 运行（在 task worktree 内，需已 pnpm install）：
 *   SPIKE_MINUTES=20 node docs/spikes/s039_kimi_web_bearer_mint_probe/code/probe.mjs
 *
 * 产物全部写 `.scratch/kimi-spike/`（gitignore，含真实凭据，禁止入库）：
 *   network.jsonl    每个请求/响应一行（含 token sha256 前 8 位与 exp，不落明文到 stdout）
 *   bodies/*.txt     响应体原文（用于定位令牌下发点）
 *   storage.json     登录后 cookies / localStorage / sessionStorage / IndexedDB 快照
 *   summary.json     汇总：首次带 Bearer 的请求、观察到的 Bearer 代际、疑似 mint 响应
 */
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const OUT = process.env.SPIKE_OUT ?? join(process.cwd(), ".scratch/kimi-spike");
const DURATION_MS = Number(process.env.SPIKE_MINUTES ?? 20) * 60_000;
const TARGET_URL = process.env.SPIKE_URL ?? "https://www.kimi.com/";
const USER_DATA_DIR = join(OUT, "profile");
const BODIES = join(OUT, "bodies");
const NETWORK_LOG = join(OUT, "network.jsonl");

const JWT_RE = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

const t0 = Date.now();
const rel = () => Date.now() - t0;
const seen_tokens = new Map(); // sha8 -> { exp, first_ms, url }
let body_seq = 0;
const mint_candidates = [];

function sha8(value) {
    return createHash("sha256").update(value).digest("hex").slice(0, 8);
}

function b64url_decode(part) {
    const pad = part.length % 4 === 0 ? "" : "=".repeat(4 - (part.length % 4));
    return Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64").toString("utf8");
}

/** 识别 JWT 并返回 exp/iat/sha8；非 JWT 返回 null。 */
function jwt_info(raw) {
    if (typeof raw !== "string") return null;
    const match = raw.match(JWT_RE);
    if (!match) return null;
    const token = match[0];
    let payload = {};
    try {
        payload = JSON.parse(b64url_decode(token.split(".")[1]));
    } catch {
        payload = {};
    }
    return {
        sha8: sha8(token),
        iat: typeof payload.iat === "number" ? payload.iat : null,
        exp: typeof payload.exp === "number" ? payload.exp : null,
        exp_in_s:
            typeof payload.exp === "number" ? payload.exp - Math.floor(Date.now() / 1000) : null,
    };
}

function find_jwts(text) {
    if (typeof text !== "string") return [];
    const found = new Set();
    for (const m of text.match(JWT_RE) ?? []) found.add(m);
    return [...found].map((token) => {
        let payload = {};
        try {
            payload = JSON.parse(b64url_decode(token.split(".")[1]));
        } catch {
            payload = {};
        }
        return {
            sha8: sha8(token),
            iat: typeof payload.iat === "number" ? payload.iat : null,
            exp: typeof payload.exp === "number" ? payload.exp : null,
        };
    });
}

async function log_line(entry) {
    await appendFile(NETWORK_LOG, `${JSON.stringify(entry)}\n`);
}

function track_token(info, url) {
    if (!info) return;
    if (!seen_tokens.has(info.sha8)) {
        seen_tokens.set(info.sha8, { ...info, first_ms: rel(), url });
        console.log(
            `[${Math.round(rel() / 1000)}s] NEW BEARER ${info.sha8} exp_in=${info.exp_in_s ?? "?"}s <- ${url.slice(0, 90)}`,
        );
    }
}

function header_value(headers, name) {
    const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
    return key ? headers[key] : undefined;
}

async function snapshot(context, page) {
    const cookies = await context.cookies();
    const storage = await page.evaluate(async () => {
        const dump = (store) => {
            const out = {};
            for (let i = 0; i < store.length; i += 1) {
                const key = store.key(i);
                if (key === null) continue;
                out[key] = store.getItem(key);
            }
            return out;
        };
        const dbs = typeof indexedDB.databases === "function" ? await indexedDB.databases() : [];
        return {
            localStorage: dump(window.localStorage),
            sessionStorage: dump(window.sessionStorage),
            indexedDB: dbs.map((db) => ({ name: db.name, version: db.version })),
        };
    });
    return {
        cookies: cookies.map((c) => ({
            name: c.name,
            domain: c.domain,
            path: c.path,
            httpOnly: c.httpOnly,
            secure: c.secure,
            expires: c.expires,
            value_len: c.value.length,
            is_jwt: /^eyJ/.test(c.value),
            value_sha8: sha8(c.value),
        })),
        storage: {
            localStorage: Object.fromEntries(
                Object.entries(storage.localStorage).map(([k, v]) => [
                    k,
                    { len: String(v).length, jwt: jwt_info(v), preview: String(v).slice(0, 60) },
                ]),
            ),
            sessionStorage: Object.fromEntries(
                Object.entries(storage.sessionStorage).map(([k, v]) => [
                    k,
                    { len: String(v).length, jwt: jwt_info(v), preview: String(v).slice(0, 60) },
                ]),
            ),
            indexedDB: storage.indexedDB,
        },
    };
}

async function main() {
    await mkdir(BODIES, { recursive: true });
    console.log(`输出目录: ${OUT}`);
    console.log(`抓包时长: ${String(DURATION_MS / 60_000)} 分钟`);

    // 默认用本机 Google Chrome（channel=chrome）；SPIKE_BROWSER=chromium 时用 Playwright 自带内核。
    const channel = process.env.SPIKE_BROWSER === "chromium" ? undefined : "chrome";
    const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
        headless: false,
        viewport: { width: 1280, height: 900 },
        ...(channel ? { channel } : {}),
        args: ["--disable-blink-features=AutomationControlled"],
    });

    context.on("request", (request) => {
        const headers = request.headers();
        const authorization = header_value(headers, "authorization");
        const cookie = header_value(headers, "cookie");
        void log_line({
            kind: "request",
            ms: rel(),
            method: request.method(),
            url: request.url(),
            authorization: jwt_info(authorization),
            authorization_raw_len: authorization ? authorization.length : 0,
            cookie_len: cookie ? cookie.length : 0,
            session_id: Boolean(header_value(headers, "x-msh-session-id")),
            device_id: Boolean(header_value(headers, "x-msh-device-id")),
        });
        if (authorization) track_token(jwt_info(authorization), request.url());
    });

    context.on("response", (response) => {
        void (async () => {
            try {
                const headers = response.headers();
                const content_type = headers["content-type"] ?? "";
                const url = response.url();
                let body_text = null;
                let body_ref = null;
                if (/json|text|javascript/.test(content_type)) {
                    const declared = Number(headers["content-length"] ?? "0");
                    if (!Number.isFinite(declared) || declared <= MAX_BODY_BYTES) {
                        body_text = await response.text().catch(() => null);
                    }
                }
                const jwts = body_text ? find_jwts(body_text) : [];
                if (body_text && (jwts.length > 0 || /token|refresh|session/i.test(url))) {
                    body_seq += 1;
                    body_ref = `bodies/${String(body_seq).padStart(4, "0")}.txt`;
                    await writeFile(
                        join(OUT, body_ref),
                        `${url}\n\n${body_text.slice(0, 200_000)}`,
                    );
                }
                if (jwts.length > 0) {
                    mint_candidates.push({
                        ms: rel(),
                        url,
                        status: response.status(),
                        jwts,
                        body_ref,
                    });
                    console.log(
                        `[${Math.round(rel() / 1000)}s] TOKEN IN RESPONSE ${String(response.status())} ${url.slice(0, 100)} (${String(jwts.length)} jwt)`,
                    );
                }
                await log_line({
                    kind: "response",
                    ms: rel(),
                    status: response.status(),
                    url,
                    content_type,
                    body_bytes: body_text ? body_text.length : null,
                    jwt_count: jwts.length,
                    jwts,
                    body_ref,
                });
            } catch {
                // 忽略单个响应读取失败（重定向/流式/已被丢弃）
            }
        })();
    });

    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" }).catch(() => undefined);

    console.log("");
    console.log("==========================================================");
    console.log(" 请在弹出的 Chromium 窗口里用手机扫码登录 Kimi");
    console.log(" 登录后保持窗口打开，不要关闭；探针会继续观察会话续期");
    console.log("==========================================================");
    console.log("");

    // 轮询等待登录：出现带 Authorization 的 apiv2 请求即认定已登录。
    const login_deadline = Date.now() + 5 * 60_000;
    let logged_in = false;
    while (Date.now() < login_deadline) {
        if (mint_candidates.length > 0 || seen_tokens.size > 0) {
            logged_in = true;
            break;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    console.log(logged_in ? "检测到登录态，开始会话快照…" : "5 分钟内未检测到登录态，仍继续抓包…");

    const storage_after_login = await snapshot(context, page).catch((error) => ({
        error: String(error),
    }));
    await writeFile(join(OUT, "storage.json"), JSON.stringify(storage_after_login, null, 4));
    console.log(
        `会话快照已写入 storage.json（localStorage 键：${
            Object.keys(storage_after_login.storage?.localStorage ?? {}).join(", ") || "无"
        }）`,
    );

    const deadline = Date.now() + DURATION_MS;
    let last_heartbeat = 0;
    while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        if (Date.now() - last_heartbeat >= 60_000) {
            last_heartbeat = Date.now();
            const generations = [...seen_tokens.entries()].map(
                ([sha, info]) =>
                    `${sha}(exp_in=${String(info.exp_in_s ?? "?")}s,${Math.round(info.first_ms / 1000)}s)`,
            );
            console.log(
                `[${Math.round(rel() / 1000)}s] bearer 代际 ${String(seen_tokens.size)}: ${generations.join(" ")} | mint 候选 ${String(mint_candidates.length)}`,
            );
        }
    }

    const summary = {
        target_url: TARGET_URL,
        duration_min: DURATION_MS / 60_000,
        logged_in,
        bearer_generations: [...seen_tokens.entries()].map(([sha, info]) => ({
            sha8: sha,
            ...info,
        })),
        mint_candidates,
        storage_after_login,
        note: "network.jsonl 与 bodies/ 含真实凭据，仅存 .scratch，不得入库",
    };
    await writeFile(join(OUT, "summary.json"), JSON.stringify(summary, null, 4));
    await context.close();
    console.log(
        `完成。bearer 代际 ${String(seen_tokens.size)}，mint 候选 ${String(mint_candidates.length)}`,
    );
}

await main();
