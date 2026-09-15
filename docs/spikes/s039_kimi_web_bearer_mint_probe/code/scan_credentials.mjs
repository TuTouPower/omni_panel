/**
 * s039 探针八：入库产物凭据形态扫描（AC-006）。
 *
 * 对 docs/ 下的本 task 产物扫描 JWT 结构、cookie 名值、session/device id 特征；命中即退出码 1。
 * 用途：入库前自检 + reviewer 复核命令。
 *
 * 运行：node docs/spikes/s039_kimi_web_bearer_mint_probe/code/scan_credentials.mjs
 */
import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

const TARGETS = [
    "docs/findings/d060_kimi_web_bearer_http_refresh.md",
    "docs/spikes/s039_kimi_web_bearer_mint_probe",
];

const PATTERNS = [
    ["jwt", /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g],
    [
        "cookie_kv",
        /\b(?:kimi_session|access_token|refresh_token|msh_user_id|HMACCOUNT_BFESS)=[A-Za-z0-9._%-]{16,}/g,
    ],
    ["bearer_header", /Bearer\s+eyJ[A-Za-z0-9_-]{10,}/g],
    ["msh_id", /\bx-msh-(?:session|device)-id["':\s]+[A-Za-z0-9-]{12,}/gi],
];

async function collect(path, files) {
    const info = await stat(path);
    if (info.isDirectory()) {
        for (const entry of await readdir(path)) {
            if (entry === "node_modules" || entry.startsWith(".")) continue;
            await collect(join(path, entry), files);
        }
        return;
    }
    files.push(path);
}

async function main() {
    const files = [];
    for (const target of TARGETS) await collect(resolve(target), files);
    const hits = [];
    for (const file of files) {
        const text = await readFile(file, "utf8");
        for (const [name, pattern] of PATTERNS) {
            for (const match of text.matchAll(pattern)) {
                hits.push({
                    file: file.replace(`${process.cwd()}/`, ""),
                    pattern: name,
                    sample: match[0].slice(0, 24),
                });
            }
        }
    }
    console.log(
        JSON.stringify({ scanned_files: files.length, hits: hits.length, details: hits }, null, 4),
    );
    process.exit(hits.length === 0 ? 0 : 1);
}

await main();
