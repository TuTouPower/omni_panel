/**
 * s009 spike：WAL 只读连接跨进程并发行为（t193 前置 UNVERIFIED-SPIKE）
 *
 * 验证 query worker 以 readonly:true 打开同一 WAL 数据库时：
 *   1. 只读连接可正常打开 WAL 库并读到已提交数据；
 *   2. 写连接（主进程）提交新批次后，只读连接可见新数据（WAL 快照按连接
 *      首次读时点；better-sqlite3 同一连接内 SELECT 会读到最新已提交页，
 *      跨连接验证写入并发不阻塞读）；
 *   3. 写入事务进行中，只读连接不阻塞（WAL 快照隔离）；
 *   4. 关闭只读连接后可立即重开，无锁残留。
 */
import Database from "better-sqlite3";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "s009-wal-"));
const db_path = path.join(dir, "usage.sqlite");

const writer = new Database(db_path);
writer.pragma("journal_mode = WAL");
writer.exec(`
    CREATE TABLE IF NOT EXISTS token_stats_records (
        source TEXT NOT NULL, env TEXT NOT NULL, session_id TEXT NOT NULL,
        message_id TEXT NOT NULL, timestamp INTEGER NOT NULL, model TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (message_id, source, env)
    );
`);
writer
    .prepare(
        `INSERT INTO token_stats_records (source, env, session_id, message_id, timestamp, model, input_tokens)
     VALUES ('claude_code', 'win', 's1', 'm1', 1, 'sonnet', 100)`,
    )
    .run();
writer.close();

const results: string[] = [];

// 1. 只读连接打开 + 读已提交数据
{
    const ro = new Database(db_path, { readonly: true });
    const row = ro.prepare("SELECT COUNT(*) AS c FROM token_stats_records").get() as { c: number };
    results.push(`readonly open reads committed: c=${row.c}`);
    ro.close();
}

// 2. 写连接提交新批次，另开只读连接可见新数据
{
    const w = new Database(db_path);
    const ins = w.prepare(
        `INSERT INTO token_stats_records (source, env, session_id, message_id, timestamp, model, input_tokens)
         VALUES ('claude_code', 'win', 's1', 'm2', 2, 'sonnet', 200)`,
    );
    const tx = w.transaction(() => {
        ins.run();
    });
    tx();
    const ro = new Database(db_path, { readonly: true });
    const c = (ro.prepare("SELECT COUNT(*) AS c FROM token_stats_records").get() as { c: number })
        .c;
    results.push(`after write commit, new readonly connection sees: c=${c}`);
    w.close();
    ro.close();
}

// 3. 写入事务进行中，只读连接不阻塞（WAL 快照隔离）
{
    const w = new Database(db_path);
    const ro = new Database(db_path, { readonly: true });
    w.exec("BEGIN IMMEDIATE");
    w.prepare(
        `INSERT INTO token_stats_records (source, env, session_id, message_id, timestamp, model, input_tokens)
         VALUES ('claude_code', 'win', 's1', 'm3', 3, 'sonnet', 300)`,
    ).run();
    // 写事务未提交时，只读连接读旧快照（不阻塞、不报锁）
    const c = (ro.prepare("SELECT COUNT(*) AS c FROM token_stats_records").get() as { c: number })
        .c;
    results.push(`during uncommitted write txn, readonly sees committed count: c=${c}`);
    w.exec("ROLLBACK");
    w.close();
    ro.close();
}

// 4. 关闭只读连接后立即重开，无锁残留
{
    for (let i = 0; i < 3; i++) {
        const ro = new Database(db_path, { readonly: true });
        ro.prepare("SELECT 1").get();
        ro.close();
    }
    results.push("readonly close/reopen x3: ok, no lock residue");
}

// 5. 只读连接写入应被拒绝（权限边界）
{
    const ro = new Database(db_path, { readonly: true });
    let write_rejected = false;
    try {
        ro.prepare(
            `INSERT INTO token_stats_records (source, env, session_id, message_id, timestamp, model, input_tokens)
             VALUES ('claude_code', 'win', 's1', 'mX', 9, 'sonnet', 1)`,
        ).run();
    } catch {
        write_rejected = true;
    }
    results.push(`readonly connection rejects write: ${write_rejected}`);
    ro.close();
}

console.log(results.join("\n"));

// 清理（Windows WAL 句柄异步释放，重试）
let last_err: Error | undefined;
for (let i = 0; i < 20; i++) {
    try {
        fs.rmSync(dir, { recursive: true, force: true });
        last_err = undefined;
        break;
    } catch (err) {
        last_err = err as Error;
        if (i < 19) {
            const until = Date.now() + 100;
            while (Date.now() < until) {
                /* spin */
            }
        }
    }
}
if (last_err) {
    console.warn(`[s009] temp cleanup retry exhausted: ${last_err.message}`);
}
