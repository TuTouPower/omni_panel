# Spike report

## 问题

存量 `observations.sqlite` 中 `env='local'` 行如何判定迁到 `win` / `linux` / `mac`（t437 未知契约清单）：目录形态、path 前缀、缺失元数据默认策略。

## 成功判据

- 真实库抽样给出各 env 行的 directory 形态分布，足以支撑一条确定性分类规则。

## 尝试

- 复制本机（WSL Linux 宿主）`~/.config/OmniPanel/observations.sqlite` 到 `.scratch/t437/sample.sqlite`（只读打开，不动原库），用 better-sqlite3 统计五张表 env 分布与 `env='local'` 行的 directory 形态。

## 证据

- user_version=7；sessions local=2435 / wsl=2028；records local=559835 / wsl=419251；daily/buckets/rollup 同序各半。
- `env='local'` records 的 directory（559835 行全量）：Windows 盘符形（`D:\...` / `D:/...`）212639 行，POSIX 形（`/home/...`、`/workspace/...`）347196 行，UNC 0 行，`/Users/` 0 行，NULL 0 行。
- `env='local'` sessions：directory NULL 的 444 行全部 source=claude_code（costs.jsonl 来源会话本无 cwd）；其余非 NULL 同为盘符/POSIX 两形态。
- `env='local'` daily 无孤儿行（每条都能 join 到同 (id,source,env) 的 session）。
- buckets 为 daily 的派生表（store 每次 upsert 全量 DELETE+INSERT 重建，INSERT_BUCKETS_SQL 按 daily GROUP BY 生成）。
- hour_rollup 有现成异步回填机制（v6 迁移即「清空 + hour_rollup_ready=0，开后台回填」）。

## 结论

分类规则（仅对 `env IN ('local','win')` 的行应用）：

1. directory 匹配 `/^[A-Za-z]:[\\/]/`（Windows 盘符）→ `win`；
2. directory 以 `/Users/` 开头 → `mac`；
3. directory 其他非 NULL（POSIX 形）→ `linux`；
4. directory 为 NULL（sessions，costs 来源）→ 宿主默认：`process.platform` win32→`win`、darwin→`mac`、其余→`linux`。
5. daily 无 directory：按 (id, source) join 迁移前的 sessions 行取分类结果；join 不到（孤儿）→ 宿主默认。
6. buckets 整体重建（daily 迁移完后 DELETE + INSERT_BUCKETS_SQL）；hour_rollup 清空并置 `hour_rollup_ready=0` 走现成异步回填。
7. 目标枚举与既有 `wsl` 行不重叠，sessions/records/daily 逐行 UPDATE 无 PK 冲突；唯一理论冲突是同一 (id,source) 同时存在残留 `win` 与 `local` 行且都判 `win`——按 merge（计数取 MAX、started_at 取 MIN、ended_at 取 MAX）后删源行处理。

可信度：高（全量统计，非抽样）。限制：本机库无 `/Users/` 与 UNC 形态 local 行，mac 规则靠路径约定推断；Windows 宿主库的 wsl 行不受影响（env 已是 wsl）。

## 是否采纳

- 决定：是
- 理由：规则确定性、可单测；宿主默认精确逆转 t308「local=进程所在 OS」语义
- 后续 task：t437
