# Task review t264（reviewer_focus: 代码）

- task：`t264_session_index_batched_persist`
- spec：`docs/tasks/t264_session_index_batched_persist/spec.md`
- diff_anchor：`805e7c1a8c7b8fd75b374b86062f961b3ce822da`
- target：`git diff 805e7c1a8c7b8fd75b374b86062f961b3ce822da`
- round：1
- reviewed_at：2026-08-08 15:10 UTC+8

## Findings

### t264_code_f001 - dirty 标记与 timer 单槽全局态：同窗口内换 index_dir 丢 A 目录待落盘条目

- 严重度：minor
- 锚点：行为缺陷——输入：`resolve(A_dir, kA)`（置 dirty=A、schedule 一次 flush），50ms 窗口内 `resolve(B_dir, kB)`。坏结果：`ensure_session_index(B)` 把模块级 `session_index` 换成 B 的 map（A 的内存态新增条目被丢弃），`schedule_index_flush(B)` 覆盖 `index_dirty_dir=B`，timer 到期只 flush B；A 的新条目既没落盘也不在内存，需后续重扫才恢复。t254 前每次 persist 同步写盘，A 必落盘，此处为 t264 引入的回退。
- 位置：`src/main/core/session-history/session-locator.ts:45-46`（`index_dirty_dir` / `index_flush_timer` 单槽全局）、`:347-358`（`schedule_index_flush` 覆盖 dirty_dir）、`:364-379`（`flush_session_index` 仅 flush 最后一个 dirty dir）
- 问题：dirty 槽与 flush 均按「最后一个 index_dir」单槽设计。`locator_paths_key` 注释 `:33`「按 index_dir 隔离」表明多 index_dir 是被支持的设计意图；当前实现仅在单 index_dir（生产路径 `resolve_index_dir` 恒回落到 `getDataRoot()`，index.ts:394 的 `session_history_locator_paths` 未带 `index_dir`）下无碍，测试则靠 `clear_resolution_cache` 每例清空全局态规避，故为潜在缺陷而非生产已观察问题。
- 建议：dirty 槽与 `session_flush_timer` 记录其所属 index_dir，flush 时对「该 dir 且 timer 归属该 dir」才清槽；或在 `schedule_index_flush` 遇 `index_dirty_dir !== index_dir` 时先同步 flush 旧 dir 再切新 dir。至少补充注释说明单槽限制与多 dir 后果。

## 结论

- 前轮 finding 复核：无（Round 1）
- 本轮新发现：1 条
- 未进表的提示：
    - 文件过大：`src/main/core/session-history/session-locator.ts` 478 行，> 实现源码 400 minor 阈值，本 task 净增 52 行；职责内聚（定位/索引/flush 一体）未直接导致可观测缺陷，仅提示，不进 finding 表。
    - 复杂度：`resolve_session_file` 手算 McCabe 约 8，未达阈值；`schedule_index_flush` / `flush_session_index` 简单，无提示。
    - 测试命名：t264 describe 内标题 AC 编号与 spec AC 编号错位（「AC3：批量 resolve N…」实为 spec AC2；「AC3：单 miss…」实为 AC1 合并语义），属标签噪音，不影响断言。
    - spike 产物：`docs/spikes/s024_index_debounce_persist/code/experiment.mjs:9` 运行注释写的 `node scripts/s024_index_debounce_experiment.mjs` 与实际路径不符（应为 `node docs/spikes/s024_index_debounce_persist/code/experiment.mjs`），纯提示。
    - 范围外观察（非本 diff）：`tests/integration/local-api/server.test.ts` 跑出 1 个未处理 `AbortError`（undici），关联 t263 搜索取消测试（anchor 即 t263 提交，为存量问题）。t264 未触及 local-api 相关代码。
- 总体判断：AC1-AC5 均有实现且测试验证（写盘次数 spy 计数 + flush 后落盘断言 + 批量 N=50→1 次写），既有 t254/t210/IPC 测试与新增 3 例 t264 测试全绿；dirty+debounce 机制正确、before-quit flush 保证正常退出落盘。唯一 minor 为多 index_dir 单槽脏标记的潜在丢失，生产单目录下不触发，不阻断。
- 系统性 follow-up：建议 task——「session-locator 多 index_dir 脏标记单槽限制补丁」，slug 建议 `locator_multi_index_dirty_slot`；本地 local-api 搜索取消未处理 AbortError 清理由 test reviewer 或既有 t263 后续处理，非本 task 引入，未建 task。

verdict: PASS

## Round 2 (2026-08-08 15:22 UTC+8)

### 前轮 finding 复核

- t264_code_f001（修不彻底）：主复现已消除——`persist_index_entry` 入口加 `flush_current_dirty_dir()` 守卫（`session-locator.ts:415-417`），dir 切换经 persist 路径时先落盘旧 dir；新增测试「切 index_dir 时先 flush 旧 dir 待落盘条目，不丢失 (t264 f001)」通过（`session-path-index.test.ts:350-370`）。但同类根因残留一条 indexed-hit 早退路径，见 f002，判定 f001 修不彻底。

### 本轮新发现

### t264_code_f002 - flush_session_index 用 ensure_session_index 而非 index_dirty_map，indexed-hit 早退路径仍丢旧 dir 待落盘条目

- 严重度：minor
- 锚点：行为缺陷——输入：多 index_dir；`resolve sess_a(A)` 后（persist 置 dirty=dir_a、session_index=map_a），清 `resolution_cache` 后同窗口 `resolve sess_c(B)` 走磁盘索引命中早退（无 persist）。坏结果：`ensure_session_index(dir_b)` 在早退前把 session_index 换成 map_b，dirty 仍指向 dir_a；随后 `flush_session_index()` 用 `ensure_session_index(dir_a)` 从磁盘重载空 map_a 覆盖保存，sess_a 索引条目丢失（已在 `.scratch` 临时测试复现：dir_a entries 为空）。
- 位置：`src/main/core/session-history/session-locator.ts:388-404`（`flush_session_index`）
- 问题：修复把 `index_dirty_map` 仅用于 `flush_current_dirty_dir`（persist 路径守卫），而 `flush_session_index`（timer / before-quit / 测试 flush）仍用 `ensure_session_index(index_dir)` 取当前 session_index。当换 dir 走「磁盘索引命中早退」路径（`resolve_session_file` step 2 indexed hit 直接 return，未调 persist，守卫不触发）时，session_index 已被换成新 dir 的 map，旧 dir 待落盘条目丢失。与协调者设计意图（"用 map 引用落盘"）不符。生产单一 index_dir（`resolve_index_dir` 恒回落 `getDataRoot()`，index.ts:394 未传 index_dir）不触发；需多 dir + 内部 cache 清除 + 索引命中早退组合，后果为索引缓存条目丢失、下次扫描重建，非用户数据丢失。
- 建议：`flush_session_index` 与 `flush_current_dirty_dir` 对齐，改用 schedule 时保存的 `index_dirty_map` 引用落盘（`const map = index_dirty_map; if (!map) return; save_session_index(index_dir, map, ...)`），而非 `ensure_session_index(index_dir)`；并补该早退路径测试。

## 结论（Round 2）

- 前轮 finding 复核：f001 主复现已消除；同类根因残留 indexed-hit 早退路径（f002），判定「修不彻底」。
- 本轮新发现：1 条
- 未进表的提示：无
- 总体判断：修复方向正确、新测试通过；session-history 全量 143 例 + 目标文件 13 例全绿。f002 为 minor（生产单目录不触发、恢复路径存在），不阻断。
- 系统性 follow-up：无

verdict: PASS

## Round 3 (2026-08-08 15:26 UTC+8)

### 前轮 finding 复核

- t264_code_f001（已消除）：`persist_index_entry` 入口守卫改调 `flush_session_index()`（`session-locator.ts:398-400`），重复的 `flush_current_dirty_dir` 已删除；守卫经 `index_dirty_map` 引用落盘旧 dir。f001 场景测试通过（`session-path-index.test.ts:350-370`）。
- t264_code_f002（已消除）：`flush_session_index` 改用 schedule 时保存的 `index_dirty_map` 引用落盘（`session-locator.ts:378-383`），不再 `ensure_session_index` 取当前 map。用 Round 2 精确复现脚本（indexed-hit 早退切 dir 后 flush）对当前代码重跑：dir_a 含 sess_a、dir_b 含 sess_c，断言通过，条目不再丢失。新增测试「命中早退路径后 flush 旧 dir 待落盘条目，不丢失 (t264 f002)」通过。

### 本轮新发现

无。

## 结论（Round 3）

- 前轮 finding 复核：f001、f002 均已消除。独立复现（非 implementer 自述）确认 f002 场景修复生效：`flush_session_index` 用 `index_dirty_map` 落盘旧 dir 待落盘条目。
- 本轮新发现：0 条
- 未进表的提示：文件内 f002 测试（`session-path-index.test.ts:372-395`）的最终 `flush_session_index` 实为 no-op（A 已在 resolve B 时被 persist 守卫落盘），未精确覆盖 f002 场景本身；该场景由我的独立复现验证修复有效。测试覆盖精确度属 test reviewer 职责，非代码 finding，仅提示。
- 总体判断：fix 方向正确、实现与设计意图（保存 map 引用落盘）一致；目标文件 14 例全绿、session-history+local-api 182 例通过（1 例存量 AbortError 属 t263，非本 diff）；typecheck 仅剩 3 处存量 TS4111（p088）。f001/f002 均消除。
- 系统性 follow-up：无

verdict: PASS
