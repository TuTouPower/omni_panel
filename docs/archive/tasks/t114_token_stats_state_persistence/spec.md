# Task spec

## 背景

`token-stats` collector 是 `utilityProcess` 子进程，扫描状态（`jsonl_states` / `kimi_states` / `costs_state` / `opencode_max_updated`）仅存内存。重启后全部丢失，所有 jsonl 全量重扫一次——Claude 几百个会话文件场景下首次扫描几十秒，WSL 路径更慢。

`vendors/kimicodebar` 的 `KimiLocalUsage.swift` 把扫描状态（每文件 byte offset + 按天累计）持久化到 `scan-state.json`，重启后从上次位置继续。我们可借鉴「状态落盘」这一点（不借鉴 byte offset，因 claude jsonl 会被 resume 重写、且按 session 跨文件 REPLACE 的口径不兼容 offset 模型）。

## 范围

- 改 `src/main/core/token-stats/collector.ts`：
    - 每次扫描完成后把 `jsonl_states` / `kimi_states` / `costs_state` / `opencode_max_updated` 序列化到 `data/token-stats-scan-state.json`。
    - 启动时读取该文件恢复状态；文件缺失或损坏时回退到空状态（等价于全量重扫一次，不报错）。
    - `SessionScanState` / `KimiScanState` 的 `Map` 序列化为 `{ file: mtimeMs }` 与 `{ file: { session_id, facts } }`；`facts` 含 `daily: Map` 与 `records: []`——records 体积大且重启后无需保留（store 已 REPLACE 落库），序列化时丢弃 records，恢复后该文件视为「未变」，等 mtime 变化再重新产出 records。
    - `daily: Map` 序列化为数组。
- 落盘时机：每次 `token_stats_update` 发出后异步写（不阻塞下一轮扫描）；写用 `writeJsonAtomic`。
- 单测：`tests/unit/main/core/token-stats/collector-state.test.ts` 覆盖序列化/反序列化 round-trip、损坏文件回退、records 丢弃后 mtime 未变不重复产出。

## 非范围

- 不改 claude-reader / kimi-reader 的解析逻辑与 offset 模型。
- 不做跨版本 state schema 迁移（首版 schema 变化时直接丢弃旧 state 全量重扫）。

## 验收标准

- [ ] collector 重启后不再全量重扫，仅扫 mtime 变化文件。
- [ ] state 文件损坏时静默回退空状态，不崩溃。
- [ ] 恢复后不产生重复 records（store 无重复行）。
- [ ] `pnpm test` 全绿。

## 依赖与约束

- 无前置 task。
- state 文件放 `data/`（不入库，与 `usage.db` 同目录）。
