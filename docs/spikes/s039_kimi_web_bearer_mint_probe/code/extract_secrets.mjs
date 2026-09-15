/**
 * 从抓包产物提取真实凭据到 `.scratch/kimi-spike/secrets.json`（gitignore，禁止入库）。
 * 输入：bodies/*.txt（GetLoginQRCodeStatus 响应）、network.jsonl（含 x-msh 请求头的请求）。
 */
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const OUT = process.env.SPIKE_OUT ?? join(process.cwd(), ".scratch/kimi-spike");

const JWT_RE = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;

function pick_jwts(text) {
    return [...new Set(text.match(JWT_RE) ?? [])];
}

async function main() {
    const body_dir = join(OUT, "bodies");
    const files = await readdir(body_dir);
    let access_token = null;
    let refresh_token = null;
    let user_id = null;
    for (const file of files) {
        const raw = await readFile(join(body_dir, file), "utf8");
        if (!raw.includes("GetLoginQRCodeStatus")) continue;
        const body = raw.split("\n\n").slice(1).join("\n\n").trim();
        try {
            const parsed = JSON.parse(body);
            access_token = parsed.accessToken ?? access_token;
            refresh_token = parsed.refreshToken ?? refresh_token;
            user_id = parsed.userId ?? user_id;
        } catch {
            continue;
        }
    }
    if (!refresh_token) {
        // 兜底：从任何 body 里按 JWT 顺序取（第一个通常是 access，第二个是 refresh）
        for (const file of files) {
            const raw = await readFile(join(body_dir, file), "utf8");
            const jwts = pick_jwts(raw).filter((token) => {
                try {
                    const payload = JSON.parse(
                        Buffer.from(
                            token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"),
                            "base64",
                        ).toString("utf8"),
                    );
                    return typeof payload.exp === "number";
                } catch {
                    return false;
                }
            });
            if (jwts.length >= 2) {
                access_token = jwts[0];
                refresh_token = jwts[1];
                break;
            }
        }
    }

    // 带 x-msh-* 头的请求样本：network.jsonl 只记了布尔，这里保留扩展位
    const secrets = {
        extracted_at: new Date().toISOString(),
        user_id,
        access_token,
        refresh_token,
        headers: {},
        note: "真实凭据，仅存 .scratch，禁止入库/提交",
    };
    await writeFile(join(OUT, "secrets.json"), JSON.stringify(secrets, null, 4));
    console.log(
        `secrets.json 写入：user_id=${String(user_id)}, access=${access_token ? access_token.length : 0}b, refresh=${refresh_token ? refresh_token.length : 0}b`,
    );
}

await main();
