# Task review t256（reviewer_focus: 代码）

- task：`t256_session_first_open_main_unblock`
- spec：`docs/tasks/t256_session_first_open_main_unblock/spec.md`
- diff_anchor：`c701f36871cb57b9f7bdd46b1d9cd637f4c0812a`
- target：`git diff c701f36871cb57b9f7bdd46b1d9cd637f4c0812a`
- round：1
- reviewed_at：2026-08-07 20:40 UTC+8

## Findings

### t256_code_f001 - `apply_batches` 以 sessions 长度驱动分批，daily/records 超过 sessions.length 的行被静默丢弃

- 严重度：critical
- 锚点：AC3（token 统计数字与现状一致，无功能回归）；行为缺陷：collector update 中 daily/records 长度超过 sessions 时，尾部行被丢弃且 collector 已标记 emitted，重启前不会重发，造成统计数据永久缺失。
- 位置：`src/main/core/token-stats/manager.ts:68`（`const total = sessions.length`），`manager.ts:71-73`（三数组同 offset 切片），`manager.ts:86-87`（`offset < total` 终止）
- 问题：`apply_batches` 以 `sessions.length` 为总批次基准，三个数组用同一 `[offset, offset+2000)` 切片，循环在 `offset >= sessions.length` 时停止。但 collector 三条数组长度并不相等且通常 daily/records 远大于 sessions：`collector.ts:27` `MAX_RECORDS=10000`，sessions 上限 10000、daily 上限 50000（`MAX_RECORDS*5`）、records 上限 200000（`MAX_RECORDS*20`）；且 `claude-reader.ts:628-634` 每 session 产出 1 条 session upsert、≥1 条 daily（每 date/model 一条）、≥1 条 records（每 message 一条）。实际场景如 sessions=1000、records=50000：total=1000，仅批 0 写入 records[0:2000]，offset 变 2000 ≥ 1000 即停止，records[2000:50000]（48000 条）永不写入；daily 同理。更严重的是 collector 在发消息前已 `emitted_record_keys.add(key)`（`collector.ts:355`），被丢弃的 records 在 collector 进程存活期内不再重发，hourly rollup 与逐消息统计缺失。旧实现一次性传全量数组给 `upsert_sessions`/`upsert_records`，无此丢失，属回归。切片本身用 `slice` 越界返回空数组不会抛异常，故是静默数据丢失而非崩溃。
- 建议：`total` 改为 `Math.max(sessions.length, daily.length, records.length)`，三个数组各自独立 `slice`（空数组自然钳制为 `[]`），终止与 `on_update` 判定基于该最大长度。语义上 upsert 均为按 PK REPLACE、buckets 每批从全量 daily 重建，错位切片不影响正确性，只需保证三条数组全部被覆盖。补充覆盖 daily/records 长度 > sessions 的测试（如 sessions=1000、records=5000 断言 records 全量写入）。

## 结论

- 前轮 finding 复核：无（Round 1）
- 本轮新发现：1 条
- 未进表的提示：
    - 错误路径：批内 upsert 抛错时 catch 后直接 return，此前已提交的批保留、`on_update` 不触发。与旧实现（整批 tx 回滚 + 不触发）相比存在部分提交差异；collector 下轮对 dirty session 全量重发、sessions/daily 自愈，records 因 emitted 标记丢失——该 records 丢失旧实现同样存在，非本 task 引入。不单独出 finding。
    - 分批规模：`UPDATE_BATCH_SIZE=2000`（`manager.ts:60`）。spike s021 实验（`.scratch/t256_spike.mjs`）是 toy 表 2000 次单行事务（3340ms）vs 200 行×10 批事务（18ms），测量的是 SQLite 事务提交开销，未直接测量真实 `upsert_sessions` 每批（含 buckets 全量重建）的阻塞时长；2000/批的单批延迟未经验证，AC2「可接受时间内返回」的量级依赖该值。机制（批间 setImmediate 让出）正确，故不据此 blocking，建议实测或对齐 spike 的 200/批。
    - `summaries` 异步化（`subscription-service.ts:676-693`）：任务体读前 `await setImmediate` 让出，`with_concurrency_limit` 限并发 5；各任务写 `result[key]` 键互斥（loc_key 唯一），无 await 间隙覆盖；缓存读前让出、读仍同步原子，watcher 同步更新缓存无竞态。AC1 以「让出」替代「无同步 fs 调用」断言，符合 spec「或」语义。未为该路径新增单测（属测试 reviewer 职责）。
    - 文件过大：`subscription-service.ts` 700 行 < 800 阈值，`manager.ts` 247 行，均未触发。
- 总体判断：`apply_batches` 存在 AC3 数据丢失回归（critical），阻塞。
- 系统性 follow-up：无

verdict: FAIL

## Round 2 (2026-08-07 23:46 UTC+8)

### t256_code_f001 复核：已消除

以工作区 diff 与代码核实（不采信 task.md 自述）：

- `manager.ts:70`：`total = Math.max(sessions.length, daily.length, records.length)`，循环边界取三数组最大长度。
- `manager.ts:73-75`：三数组各自独立 `slice(offset, offset + UPDATE_BATCH_SIZE)`，越界 slice 自然返回剩余。
- 追算 sessions=1 / records=5000：total=5000，批 0/1/2 分别写 records[0:2000]/[2000:4000]/[4000:5000]，5000 条全写入；批 1/2 的 upsert_sessions 收到 `([], [])`，真实 store 在 `token-stats-store.ts:903` 判空早退，空批无副作用。
- 追算 sessions=5000 / records=1：records 越界切片得 `[]`，`upsert_records` 在 `token-stats-store.ts:958` 空数组早退，不越界。
- `on_update` 在 `offset >= total` 后触发（`manager.ts:88-92`）；空消息 total=0 时首批即触发，与旧行为一致。
- 新增测试「records 多于 sessions 时不丢数据」（`manager.test.ts:146-169`）断言 upsert_records 恰 3 批、第 3 批为 records.slice(4000,5000)、on_update 一次，直接覆盖 f001 场景，断言为行为真值非弱断言。

### 本轮新发现

0 条。

## 结论

- 前轮 finding 复核：f001 已消除（max 边界 + 独立切片 + 空批早退）。
- 本轮新发现：0 条。
- 未进表的提示：
    - 错误路径部分提交：批内 upsert 抛错时 catch 后 return，此前批已提交、on_update 不触发，与 Round 1 结论段记录一致，非 f001 修复引入，不重复出 finding。
    - 并发批次交错：collector 在上一条链未排空时发新 update，两条 `apply_batches` 链经 setImmediate 交错执行；因 upsert 均按 PK REPLACE/UPSERT 幂等、collector 按 dirty session 全量重发，末态收敛到最新快照，data_version 仅多 bump、on_update 多次触发均无害，符合 spec「启动初期统计数据短时滞后」接受权衡。
- 总体判断：f001 数据丢失回归已消除，未引入新的 critical/important。
- 系统性 follow-up：无

verdict: PASS
