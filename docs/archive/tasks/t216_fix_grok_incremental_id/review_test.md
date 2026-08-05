# Task review t216（reviewer_focus: 测试）

- task：`t216_fix_grok_incremental_id`
- spec：`docs/tasks/t216_fix_grok_incremental_id/spec.md`
- diff_anchor：`a4d5c903f69f0022ecddd68a8d442bbe8020b91e`
- target：`git diff a4d5c903f69f0022ecddd68a8d442bbe8020b91e`
- round：1
- reviewed_at：2026-08-05 21:10 UTC+8

## Findings

### t216_test_f001 - subscription-service 新增 p050 用例因 mtime 轮询粒度 flake，间歇性 wait_for 超时

- 严重度：important
- 锚点：AC #3「历史窗口收到 grok watcher 增量推送后新消息正确追加」——该用例声称验证此 AC，但本地实测间歇性无法完成（无任何推送，2s 超时）。
- 位置：`tests/unit/main/core/session-history/subscription-service.test.ts:178-205`（`grok 增量推送 id 延续全量命名空间，不与已推送 id 冲突（p050）`），根因相关 `src/main/core/session-history/subscription-service.ts:158-169`（mtime 轮询 `create_watcher`）。
- 问题：该用例 `subscribe()` 后**同步立即** `appendFileSync`，与同文件既有用例（如 `轮询策略：grok 文件追加后推送增量`，在 subscribe 与 append 之间加 80ms settle 等待）不同。轮询 watcher 在 subscribe 时记录 `last_mtime = statSync(file).mtimeMs`；Windows 文件系统 mtime 量化下，紧邻的两次写（初始 write + 立即 append）mtime 经常相同，轮询 `cur !== last_mtime` 永不成立，watcher 不触发，`wait_for` 2s 超时抛错。实测证据：
    - 复现脚本：back-to-back `writeFileSync` + `appendFileSync` 后 `statSync` 比对，200 次中 134 次 mtime 相等（67%）。
    - 本机跑该测试文件（单独跑），约 12 次运行失败 3 次（错误均为 `wait_for timed out after 2000ms`，失败点固定在该用例）；整目录并行跑时也复现 1 次失败。
    - 全量断言方向正确（追加推送应为 `["grok:2"]`，旧实现在此用例会得 `["grok:0"]` 判红），但 flake 本身使该 AC 的验证不可靠：CI 会间歇性红，不满足「测试可信」。
- 建议：参照同文件既有轮询用例，在 `subscribe()` 与 `appendFileSync` 之间插入 `await new Promise((resolve) => setTimeout(resolve, 80))` settle 等待，使 append 落在新的 mtime 量子上；或改为先断言初始静默、再 append、再 `wait_for`。修复后应连跑该文件 ≥5 次验证无超时。

## 结论

- 前轮 finding 复核：本轮为 Round 1，无。
- 改测方向复核：grok-extractor 既有用例「增量：文件追加新行后」断言由 `role/text` 比较改为 `expect(inc.messages).toEqual(tail)`（含 id）——这是按新 spec（增量 id 与全量同命名空间）对旧「id 不同」语义的**收紧**，非迁就实现，合法且更严格。其余既有用例未改。无「把旧测试预期改成当前实现输出」的改测。
- 本轮新发现：1 条（important）。
- 未进表的提示：
    - AC #1「追加 N 条后增量 id 不与已提取的任何 id 重复」的连续多轮续号（append → grok:3，再 append → grok:4）未直接断言。单轮（N=1）与半行用例单轮两条消息（N=2，均校验落入全量命名空间）已覆盖主回归路径；连续多轮因每轮对 head 重新计数且 head 只增不改，机制上确定，属可选补强，不阻断。
    - 半行用例中 `if (inc.cursor?.kind === "byte_offset" && ...)` 守卫：文件为本用例刚写入、提取器对可读文件必返回 byte_offset 游标，守卫恒真，是类型收窄惯用法，非条件跳过弱化断言。
- 总体判断：AC #1/#2/#4 覆盖充分且真实判红（旧实现会失败）；AC #3 的 watcher 链路用例方向正确但存在间歇性 flake，需按建议修复后该 finding 才可消除。
- 系统性 follow-up：无。

verdict: FAIL

## Round 2 (2026-08-05 21:25 UTC+8)

### 前轮 finding 复核

- **t216_test_f001（important）——已消除**。以 `git diff` 为准：`tests/unit/main/core/session-history/subscription-service.test.ts:199-202` 已在 `subscribe()` 与 `appendFileSync` 之间补 80ms settle 等待，并新增 `expect(received_ids).toHaveLength(0)` 初始静默断言（先证无初始推送、再 append、再 `wait_for`），与同文件既有轮询用例同法。实测验证：该文件连跑 6 次全绿（每次 15/15，无 `wait_for timed out`）；整目录 `npx vitest run tests/unit/main/core/session-history/` 7 文件 72 用例全绿。80ms 远超 Windows mtime 毫秒量化，flake 根因已消除。断言目标未弱化：仍为 `received_ids[0]` 严格等于 `["grok:2"]`（旧实现会得 `["grok:0"]` 判红）。
- **t216_code_f001（minor，code 侧附带复核）——已消除**。`src/main/core/session-history/grok-extractor.ts:140-156` 游标推进已区分两类末行：尾部行（最后一个 `\n` 之后）`JSON.parse` 成功（完整无尾换行）→ `new_offset = buf.length` 推进到文件末尾不重发；失败（未完成半行）→ `new_offset = tail_start` 驻留行首。新增用例 `tests/unit/main/core/session-history/grok-extractor.test.ts:161-189`（`完整末行无尾换行：增量不重发该行、游标推进到文件末尾（f001）`）真实触达该分支：文件 `A\nB`（B 完整、无尾换行），全量后无追加的增量返回 `[]` 且游标保持在 EOF（62），不退回行首（28）；追加 `\nC\n` 后增量仅返回 id `grok:2`（延续全量空间）。逐字节推演确认：旧实现在此场景 `last_nl_global < buf.length - 1` 恒真，游标回退到 28 并重发 B，本用例 `expect(inc.messages).toEqual([])` 与 `expect(inc.cursor.offset).toBe(full.cursor.offset)` 均判红——该用例为真回归守卫，非凑数。半行用例（rewind 路径）与 id 唯一性用例同样经推演对旧实现判红。

### 本轮新发现

- 无。

### 结论

- 前轮 finding 复核：t216_test_f001 已消除（80ms settle + 初始静默断言，连跑 6 次 + 全目录 72 用例全绿）；t216_code_f001（附带复核）已消除（游标推进区分完整末行与半行，f001 用例真实判红旧实现）。
- 改测方向复核：无「迁就实现」的改测。既有用例仅 grok-extractor「增量：文件追加新行后」由 role/text 比较收紧为 `toEqual(tail)`（含 id，按新 spec 语义，Round 1 已确认合法）；p050 用例的 80ms settle 属时序修复，不涉及断言弱化。
- 危险模式扫描：无 `.only`/`.skip`/`@ts-ignore`/`eslint-disable`/恒真断言/条件跳过；新增用例的 `if (cursor === null) throw` 为失败即抛的守卫，非条件跳过弱化断言。
- 本轮新发现：0 条。
- 未进表的提示：连续多轮续号（append → grok:3 → 再 append → grok:4）仍非直接断言（f001 用例已覆盖单轮续号 grok:2），机制上确定，属可选补强；code 侧「增量每次整读 head 重解析计全局数」的解析成本回归为 code reviewer 范围外观察，不影响测试可信。
- 总体判断：前轮唯一 important（测试 flake）已用 diff 与实跑确认消除，半行容错与完整末行分支均有真实判红的回归用例，AC #1-#4 覆盖完整且稳定；无未解决 critical / important，可 PASS。
- 系统性 follow-up：无。

verdict: PASS
