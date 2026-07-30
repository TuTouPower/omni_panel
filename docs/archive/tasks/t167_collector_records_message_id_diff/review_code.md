# Task review t167（reviewer_focus: 代码）

- task：`t167_collector_records_message_id_diff`
- spec：`docs\tasks\t167_collector_records_message_id_diff\spec.md`
- diff_anchor：`aca801d9da264cbc9d754aa0eb921b9c293b53e0`
- target：`git diff aca801d9da264cbc9d754aa0eb921b9c293b53e0`
- round：1
- reviewed_at：2026-07-31 05:12 UTC+8

## Findings

### t167_code_f001 - dedupe add 早于容量上限 break，触发时静默永久丢 record

- 严重度：critical
- 位置：`src/main/core/token-stats/collector.ts:316-322`
- 问题：
    ```ts
    for (const r of result.records) {
        const key = record_key(r);
        if (emitted_record_keys.has(key)) continue;
        emitted_record_keys.add(key); // ← 标记已 emit
        if (all_records.length >= MAX_RECORDS * 20) break; // ← 此时未 push
        all_records.push(r);
    }
    ```
    `emitted_record_keys.add(key)` 在容量判断之前执行。当 `all_records.length` 已达 `MAX_RECORDS * 20`（=200000）上限时，本条 `r` 的 key 已写入 Set，但 `r` 未进入 `all_records`，本次 `postMessage` 不含该条，DB 未 `INSERT OR REPLACE`。下次 `collect()` 再读到同一 `r`，`emitted_record_keys.has(key)` 命中，`continue` 跳过——**该 record 在进程生命周期内永久丢失**，且无任何日志。
    触发条件：单次 collect 内累计 records ≥ 200000（恰好是 t167 想消除的 20 万级突发的上限）。t167 之后稳态应降至千级，但 spec AC 仍保留 `MAX_RECORDS * 20` 上限，首次冷启或突发场景仍可能命中。
    与 t167 目标冲突：t167 旨在减少 IO，不是丢数据。即使稳态不触发，break 分支的失败模式是「静默数据丢失」，非可接受行为。
- 建议：把容量判断移到 add 之前，或 break 时不 add。最小修复：
    ```ts
    for (const r of result.records) {
        const key = record_key(r);
        if (emitted_record_keys.has(key)) continue;
        if (all_records.length >= MAX_RECORDS * 20) break; // 先判容量
        emitted_record_keys.add(key); // 再标记
        all_records.push(r);
    }
    ```
    break 后下一次 collect 仍会重试该 key（因未 add），直到容量释放——这是正确语义：跨 collect 边界保留重试机会，单次内部仍防重发。

## 非关键观察（不进 finding 表，仅记录）

- **key 唯一性**（审查重点 1）：`source|env|message_id` 三元组与 `token-stats-store.ts:115` 的 `PRIMARY KEY (message_id, source, env)` 一致。`record_key` helper 类型签名 `{ source: string; env: string; message_id: string }` 收窄为非空 string。reader 三个构造点（`claude-reader.ts:376/496`、`opencode-reader.ts:272`、`kimi-reader.ts:240`）均字面量填 `source`/`env`，schema `agentSessionUsageRecordSchema` 也把 `source`/`env` 声明为 enum 必填，`undefined` 退化风险确认不存在。
- **Set 单调增长**（审查重点 2）：38 万 × ~40 字符 ≈ 15MB，spec「依赖与约束」未列硬上限，`reset_config` 清空 + 进程重启自然清空，取舍合理。
- **reset_config 清空时机**（审查重点 4）：`reset_config` 用于测试 `beforeEach` 和 configure(null)；真实重启是模块级 `const emitted_record_keys = new Set()` 在新进程天然为空，与 spec「重启首次全量，之后增量」语义一致。
- **Set 不持久化的取舍**（审查重点 6）：scan-state 文件当前 11.6 MB，spec 明确担心再放大；Set 不持久化使重启首 collect 全量，与改动前行为完全一致，不构成回归。合理。
- **文件截断重建**（审查重点 5）：jsonl 截断重建后，旧行 message_id 若仍在 Set，会被跳过；但 collector 本就不处理「行删除」（store 也无 DELETE 路径，records 表只 INSERT OR REPLACE），与既有语义一致，不引入新不一致。
- 文件行数：`collector.ts` 净增 16 行，远低于 important 800 阈值。
- 圈复杂度：`collect` 函数 CC 未因本改动增加分支（仅在已有 for 内多 2 行线性语句）。
- `npx tsc --noEmit` 通过。

## 结论

- 前轮 finding 复核：N/A（Round 1）。
- 本轮新发现：1 条（critical）。
- 总体判断：dedupe 逻辑成立，key 设计与去重语义正确；但 `add` 早于容量 break 的顺序错误，会在 20 万上限触发时静默永久丢 record。一处最小修复即可。

verdict: FAIL

## Round 2 (2026-07-31 06:02 UTC+8)

### 前轮 finding 复核

- **t167_code_f001（critical）已修**。`src/main/core/token-stats/collector.ts:316-326` 的 records 循环顺序已调整为：`has(key)` 跳过 → `if (all_records.length >= MAX_RECORDS * 20) break;` → `emitted_record_keys.add(key);` → `all_records.push(r);`。break 发生在 `add` 之前，该 record 的 key 未标记 emitted，下一次 `collect()` 重读到同一 `r` 时 `has(key)` 不命中，会正常进入容量判断与 push，跨 collect 边界保留重试机会。前轮「静默永久丢 record」路径已闭合。同时新增 4 行注释明确解释该顺序约束，避免后续误改。

### 本轮新发现

无。逐项确认：

- 正常路径（未超限）：`has` → 容量判断通过 → `add` → `push`，顺序正确。
- `add` 与 `push` 之间无可 break 的语句，不会重现「add 了但未 push」的窗口。
- `reset_config` 末尾 `emitted_record_keys.clear()`（collector.ts:370）与 round 1 观察一致，测试 `beforeEach` 与 `configure(null)` 路径清空，进程重启天然清空，与 spec「重启首次全量，之后增量」语义一致。
- `npx tsc --noEmit` 通过。

### 结论

- 前轮 finding：1/1 已修。
- 本轮新发现：0 条。
- 总体判断：f001 修复正确且最小化，顺序约束由注释固化；无回归。

verdict: PASS
