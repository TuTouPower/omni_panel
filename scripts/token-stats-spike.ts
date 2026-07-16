/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-require-imports, @typescript-eslint/restrict-template-expressions, @typescript-eslint/no-base-to-string, @typescript-eslint/prefer-nullish-coalescing, @typescript-eslint/no-unnecessary-condition */
/**
 * Phase 0 Spike — 数据源可行性验证
 * 运行: npx tsx scripts/token-stats-spike.ts
 *
 * 只读验证，不修改任何源数据。
 */
import { readFileSync, readdirSync, statSync, accessSync, constants } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const win_home = homedir();
const claude_costs_path = join(win_home, ".claude", "metrics", "costs.jsonl");
const claude_projects_dir = join(win_home, ".claude", "projects");
const opencode_db_path = join(win_home, ".local", "share", "opencode", "opencode.db");

const wsl_distro = "Ubuntu-22.04";
const wsl_user = "testuser";
const wsl_base = `\\\\wsl.localhost\\${wsl_distro}\\home\\${wsl_user}`;
const wsl_claude_costs = join(wsl_base, ".claude", "metrics", "costs.jsonl");
const wsl_opencode_db = join(wsl_base, ".local", "share", "opencode", "opencode.db");

let all_pass = true;
const blockers: string[] = [];

function section(title: string) {
    console.log(`\n=== ${title} ===`);
}

function ok(msg: string) {
    console.log(`  ✓ ${msg}`);
}

function fail(msg: string) {
    console.log(`  ✗ ${msg}`);
    all_pass = false;
    blockers.push(msg);
}

function warn(msg: string) {
    console.log(`  ⚠ ${msg}`);
}

// --- 0.1 Win costs.jsonl ---
section("Claude Code (Win) — costs.jsonl");
let costs_lines: string[] = [];
try {
    const raw = readFileSync(claude_costs_path, "utf-8");
    costs_lines = raw.split("\n").filter((l) => l.trim().length > 0);
    ok(`${costs_lines.length} 行`);

    let valid_count = 0;
    let default_count = 0;
    const models = new Set<string>();
    const sessions = new Map<string, { last_line: string; last_ts: string }>();

    for (const line of costs_lines) {
        try {
            const rec = JSON.parse(line) as Record<string, unknown>;
            const sid = String(rec["session_id"] ?? "");
            const model = String(rec["model"] ?? "");
            const ts = String(rec["timestamp"] ?? "");
            const input = Number(rec["input_tokens"] ?? 0);
            const output = Number(rec["output_tokens"] ?? 0);

            if (sid === "default" || model === "unknown") {
                default_count++;
                continue;
            }
            if (!sid || !model || (input === 0 && output === 0)) continue;

            valid_count++;
            models.add(model);

            const prev = sessions.get(sid);
            if (!prev || ts > prev.last_ts) {
                sessions.set(sid, { last_line: line, last_ts: ts });
            }
        } catch {
            // skip malformed lines
        }
    }

    // 0.1: at least 1 valid row
    if (valid_count > 0) {
        ok(`有效记录: ${valid_count}, default/unknown: ${default_count}`);
    } else {
        fail("无有效记录（含 session_id + model + tokens）");
    }

    // 0.2: at least 1 non-default session with non-zero tokens
    if (sessions.size > 0) {
        ok(`${sessions.size} 个 session（去 default 后）`);
    } else {
        fail("全部为 default/unknown 零值记录");
    }

    console.log(`  模型: [${[...models].join(", ")}]`);

    // 0.9: check timestamp monotonicity
    let monotonic = true;
    let prev_ts = "";
    let disorder_count = 0;
    for (const line of costs_lines) {
        try {
            const rec = JSON.parse(line) as Record<string, unknown>;
            const ts = String(rec["timestamp"] ?? "");
            if (ts && prev_ts && ts < prev_ts) {
                monotonic = false;
                disorder_count++;
            }
            if (ts) prev_ts = ts;
        } catch {
            // skip
        }
    }
    if (monotonic) {
        ok("行序按 timestamp 单调递增（max_by = last 安全）");
    } else {
        warn(`行序非单调递增，${disorder_count} 处逆序（必须用 max_by(.timestamp)）`);
    }
} catch (err) {
    fail(`读取失败: ${err instanceof Error ? err.message : String(err)}`);
}

// --- 0.3 Win session JSONL ---
section("Claude Code (Win) — Session JSONL");
try {
    let file_count = 0;
    let assistant_count = 0;
    const dedup_keys = new Set<string>();
    const dedup_keys_extended = new Set<string>();
    let sample_usage: Record<string, unknown> | null = null;

    function scan_dir(dir: string, depth: number) {
        if (depth > 5) return;
        let entries: string[];
        try {
            entries = readdirSync(dir);
        } catch {
            return;
        }
        for (const entry of entries) {
            const full = join(dir, entry);
            let st;
            try {
                st = statSync(full);
            } catch {
                continue;
            }
            if (st.isDirectory()) {
                scan_dir(full, depth + 1);
            } else if (entry.endsWith(".jsonl")) {
                file_count++;
                try {
                    const content = readFileSync(full, "utf-8");
                    for (const line of content.split("\n")) {
                        if (!line.trim()) continue;
                        try {
                            const rec = JSON.parse(line) as Record<string, unknown>;
                            if (rec["type"] !== "assistant") continue;
                            const msg = rec["message"] as Record<string, unknown> | undefined;
                            const usage = msg?.["usage"] as Record<string, unknown> | undefined;
                            if (!usage) continue;
                            assistant_count++;

                            const ts = String(rec["timestamp"] ?? "");
                            const inp = Number(usage["input_tokens"] ?? 0);
                            const out = Number(usage["output_tokens"] ?? 0);
                            const cache = Number(usage["cache_read_input_tokens"] ?? 0);
                            const model = String(msg?.["model"] ?? "");

                            dedup_keys.add(`${ts}|${inp}|${out}`);
                            dedup_keys_extended.add(`${ts}|${inp}|${out}|${cache}|${model}`);

                            if (!sample_usage) sample_usage = usage;
                        } catch {
                            // skip
                        }
                    }
                } catch {
                    // skip unreadable files
                }
            }
        }
    }

    scan_dir(claude_projects_dir, 0);

    if (file_count > 0) {
        ok(`${file_count} 个 JSONL 文件`);
    } else {
        fail("session JSONL 目录为空");
    }

    if (assistant_count > 0) {
        ok(`${assistant_count} 条 assistant 记录（含 message.usage）`);
        console.log(`  字段示例: ${JSON.stringify(sample_usage)}`);
    } else {
        fail("无 type=assistant + message.usage 记录");
    }

    // 0.8 dedup comparison
    const basic_dedup_rate = (
        ((assistant_count - dedup_keys.size) / assistant_count) *
        100
    ).toFixed(1);
    const extended_dedup_rate = (
        ((assistant_count - dedup_keys_extended.size) / assistant_count) *
        100
    ).toFixed(1);
    console.log(
        `  去重(基础键): ${assistant_count} → ${dedup_keys.size} (去除 ${basic_dedup_rate}%)`,
    );
    console.log(
        `  去重(扩展键): ${assistant_count} → ${dedup_keys_extended.size} (去除 ${extended_dedup_rate}%)`,
    );

    if (Number(basic_dedup_rate) < 10) {
        ok("基础去重率 < 10%，键可用");
    } else {
        warn(`基础去重率 ${basic_dedup_rate}%，建议用扩展键`);
    }
} catch (err) {
    fail(`扫描失败: ${err instanceof Error ? err.message : String(err)}`);
}

// --- 0.4/0.5 Win opencode.db ---
section("OpenCode (Win) — SQLite");
try {
    const Database = require("better-sqlite3");
    const db = new Database(opencode_db_path, { readonly: true });
    const count = db.prepare("SELECT COUNT(*) as cnt FROM session").get() as { cnt: number };
    ok(`session 表: ${count.cnt} 行`);

    if (count.cnt > 0) {
        const rows = db
            .prepare(
                `SELECT id, json_extract(model, '$.id') as model_id,
                    tokens_input, tokens_output, title, time_created
             FROM session WHERE tokens_input > 0 LIMIT 5`,
            )
            .all() as Record<string, unknown>[];

        if (rows.length > 0) {
            ok(`${rows.length} 行含有效 tokens（采样 5）`);
            for (const r of rows) {
                console.log(
                    `    ${String(r["id"]).slice(0, 16)}... model=${r["model_id"]} in=${r["tokens_input"]} out=${r["tokens_output"]}`,
                );
            }

            const models = db
                .prepare(
                    `SELECT DISTINCT json_extract(model, '$.id') as m FROM session WHERE tokens_input > 0`,
                )
                .all() as { m: string }[];
            console.log(`  模型: [${models.map((r) => r.m).join(", ")}]`);
        } else {
            fail("所有 session tokens_input = 0");
        }
    } else {
        fail("session 表为空");
    }

    db.close();
} catch (err) {
    fail(`SQLite 打开失败: ${err instanceof Error ? err.message : String(err)}`);
}

// --- 0.6 WSL UNC path ---
section("WSL");
try {
    accessSync(wsl_claude_costs, constants.R_OK);
    ok(`UNC 路径可达: ${wsl_claude_costs}`);

    const raw = readFileSync(wsl_claude_costs, "utf-8");
    const lines = raw.split("\n").filter((l) => l.trim().length > 0);
    ok(`costs.jsonl: ${lines.length} 行`);
} catch (err) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
        warn(`WSL costs.jsonl 不可达: ${wsl_claude_costs}`);
    } else {
        warn(`WSL costs.jsonl 读取失败: ${err instanceof Error ? err.message : String(err)}`);
    }
}

// 0.7 WSL opencode.db
try {
    accessSync(wsl_opencode_db, constants.R_OK);
    ok(`UNC 路径可达: ${wsl_opencode_db}`);

    const Database = require("better-sqlite3");
    const db = new Database(wsl_opencode_db, { readonly: true });
    const count = db.prepare("SELECT COUNT(*) as cnt FROM session").get() as { cnt: number };
    ok(`opencode.db session 表: ${count.cnt} 行`);
    db.close();
} catch (err) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
        warn(`WSL opencode.db 不可达: ${wsl_opencode_db}`);
    } else {
        warn(`WSL opencode.db 读取失败: ${err instanceof Error ? err.message : String(err)}`);
    }
}

// --- Conclusion ---
section("结论");
if (all_pass) {
    console.log("  可行性: ✓ 全部核心项通过");
} else {
    console.log("  可行性: ✗ 存在阻塞问题");
    for (const b of blockers) {
        console.log(`    - ${b}`);
    }
}
