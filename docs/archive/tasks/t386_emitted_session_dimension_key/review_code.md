# Task review t386（reviewer_focus: 代码）

- task：`t386_emitted_session_dimension_key`
- spec：`docs/tasks/t386_emitted_session_dimension_key/spec.md`
- diff_anchor：`031108a3c8b7bf2d87df7f3fe6b1901910fe451a`
- target：`git diff 031108a3c8b7bf2d87df7f3fe6b1901910fe451a`
- round：2
- reviewed_at：2026-08-15 07:10 UTC+8（Round 1）/ 2026-08-15 07:16 UTC+8（Round 2）

## Findings

### t386_code_f001 - session_touch_ts 以裸 session_id 为键，与 emitted key 的会话维度不一致

- 严重度：minor
- 锚点：AC-002 潜在违背（跨源会话 id 碰撞时活跃判定串源）
- 位置：`src/main/core/token-stats/collector.ts:133`、`collector.ts:150-152`
- 问题：`emitted_record_keys` 的 key 为 `source|env|session_id|message_id`（会话维度带 source/env 前缀），而 `session_touch_ts` 以**裸 `session_id`** 为键，`prune_emitted` 用 `key.split("|")[2]` 取出的裸 session 去查 `session_touch_ts`。当不同 (source, env) 的会话 id 恰好相同（如 claude 会话与 opencode 会话 id 碰撞），一个来源的活跃触碰会让另一来源的过窗 key 被保留并刷新 ts——该来源的非活跃会话将永不过窗，违背 AC-002 且破坏窗口内存上界。实际碰撞概率极低（claude/opencode/grok/kimi 会话 id 均为机器生成随机串），故不判 blocking；但 touch 键与 emitted key 维度不一致是架构一致性缺陷。
- 建议：`session_touch_ts` 键改为 `source|env|session_id`（与 emitted key 的会话维度对齐），collect 刷新与 prune 查询同步拼接。

### t386_code_f002 - reset_config 未清理 session_touch_ts，测试跨用例顺序依赖（潜在）

- 严重度：minor
- 锚点：行为缺陷——reset 语义不对称
- 位置：`src/main/core/token-stats/collector.ts:738-754`（746 清 `emitted_record_keys`，未清 `session_touch_ts`）；`tests/unit/main/core/token-stats/collector.test.ts:142-149`（beforeEach 亦未清）
- 问题：`reset_config()` 声明的职责是恢复模块状态（清 7 张 map），但漏掉本 task 新加的 `session_touch_ts`；测试 `beforeEach` 同样只清 `emitted_record_keys`。当前用例用唯一 session id（`sess-active`/`sess-idle`/`sa`/`sb`）恰好不触发，但任何后续复用已触碰 session id 的用例都会继承前用例的 touch 时间，导致 AC-001 保留分支误通过或 AC-002 删除分支误失败。`reset_config` 生产侧仅测试调用，影响限于测试层。
- 建议：`reset_config` 补 `session_touch_ts.clear()`，测试 `beforeEach` 同步清理。

### t386_code_f003 - AC-001 测试绕过被测刷新路径，且未驱动第二轮验证可观察 AC 结果

- 严重度：minor
- 锚点：AC-001 测试覆盖缺口
- 位置：`tests/unit/main/core/token-stats/collector.test.ts:1109-1128`
- 问题：测试手动 `session_touch_ts.set("sess-active", now)`（注释声称"collect 刷新 session_touch_ts"，但 mock 已返回该会话，collect 的刷新循环 `collector.ts:612-614` 本会自动设置，手动 set 冗余且绕过被测代码路径）；且断言止步于"key 存活 prune"，未再跑一轮 mtime 变化验证 AC-001 的可观察结果（"下次只发新增、不重发整段历史"）。spec 测试策略要求"断言 key 保留/删除与重发记录数"。同理 AC-002 测试（`test.ts:1132-1146`）只验删除半边，"重触碰整段重发"另半边未测。
- 建议：AC-001 去掉手动 `session_touch_ts.set`，改用 mock 返回该会话驱动 collect 刷新，并追加第二轮断言增量记录数（第二轮新记录入列、历史 key 不重发）；AC-002 补重触碰后整段重发的正向断言。

## 结论

- 前轮 finding 复核：Round 1，无前轮。
- 本轮新发现：3 条（均 minor）
- 未进表的提示：
  - **「活跃判定过宽」已核查排除**：collect 的 touch 刷新（`collector.ts:612-614`）只遍历 `result.sessions`，四个产出记录的 reader 均只返回本轮实际变化会话——claude/kimi/grok reader 只把 mtime 变化（dirty）会话并入结果（`claude-reader.ts:563-617`、`kimi-reader.ts:371-423`、`grok-reader.ts:424-482`），opencode 按 `time_updated > max_updated` 过滤（`opencode-reader.ts:53-57`，首轮 max_updated=0 全量返回视为"刚被读取"合理），costs reader 只返回 tail 有新增行的会话。未变化（mtime 未变）会话不会出现在 `result.sessions`，不会被误标活跃；"即使未实际触碰也被标记活跃"的场景不成立。
  - **存储层 PK 不含 session_id**（范围外，非本 task 引入）：`token-stats-store.ts:248` `PRIMARY KEY (message_id, source, env)`，记录 upsert 为 `INSERT OR REPLACE`（`store.ts:974-986`）。跨会话同 message_id 的记录在 emitted 层已独立（AC-003 达成），但落入 store 后仍会按 message_id 互相覆盖。真实 message_id 来源（sha256(line)/DB uuid/prompt_id）de-facto 全局唯一，仅人工构造同 message_id 才触发，且该行为 pre-t386 即存在（当时 emitted 层直接合并）。判为结论提示，不升 finding。
  - **文件过大**（降级为结论，不占 finding）：`src/main/core/token-stats/collector.ts` 801 行（本 task 净增约 37 行，跨越重要阈值 800）；`tests/unit/main/core/token-stats/collector.test.ts` 1208 行（净增 71 行，跨越重要阈值 1200）。均无不可拆硬约束，建议后续 task 拆分。
  - **复杂度**：`collect()`（`collector.ts:532-729`）单函数体量大、分支多，但本 task 仅新增一个无分支的 for 刷新循环，未增加其分支复杂度，不满足"task 仍增加分支"的 minor 条件，仅在结论提示。
  - **spec 路径与真实路径不一致**：spec「范围」写 `src/main/core/collector/collector.ts`，实际实现在 `src/main/core/token-stats/collector.ts`。目录结构非行为 AC，按"技术约束判断"不判偏离；建议收尾时修正 spec 路径。
- 总体判断：AC-001/002/003 机制正确落地，prune 保留/删除/刷新逻辑自洽，单测 43 项全部通过；三条 finding 均为 minor，无未解决 critical/important。
- 系统性 follow-up：无

verdict: PASS
reviewed_scope: 7c09600360b6af10

## Round 2 复核（scope 29b1ac182b5ee59d）

- reviewed_at：2026-08-15 07:16 UTC+8
- 复核 diff：当前工作区（相对 `031108a3c8b7bf2d87df7f3fe6b1901910fe451a`，与 Round 1 同 anchor）

### 前轮 finding 复核

- **f001（minor）— 已消除**：`session_touch_ts` 键已加 `source|env` 前缀。collect 刷新改 `session_touch_ts.set(`${src.source}|${src.env}|${s.id}`, Date.now())`（`collector.ts:612`）；prune 从 emitted key 前两段拼 `session_key` 查询（`collector.ts:150-152`）。touch 键与 emitted key 会话维度对齐，跨源会话 id 碰撞不再串源。逐 reader 核对 `s.id`（upsert id）与 `r.session_id`（record 会话）一致（claude/kimi/grok 均 resolve 后同源赋值；opencode records 经 PARTS_QUERY 限定为 session 行 id），维度对齐成立。
- **f002（minor）— 已消除**：`reset_config()` 补 `session_touch_ts.clear()`（`collector.ts:751`）；测试 `beforeEach` 同步补清（`collector.test.ts:149`）。reset 语义对称，无跨用例泄漏。
- **f003（minor）— 核心已消除**：AC-001 测试删除手动 `session_touch_ts.set`，改由 collect 生产刷新路径驱动，并新增 touch 键前缀断言 `session_touch_ts.get("claude_code|local|sess-active")`（`collector.test.ts:1129`）。原建议中「第二轮只发增量不重发整段」与「AC-002 重触碰整段重发」正向断言仍未落地——属可观测行为断言缺口，按评审边界归测试 review 层（`review_test.md`），代码侧不重复判 finding。

### 本轮新发现

- 无。修复未引入新问题：prune 对 3 段注入 key（`old|local|m-old`）拼出的 session_key 查不到 touch 即按自身 ts 删除，t346 用例行为不变；touch 清理循环在 Map 迭代中 delete 安全（JS 语义）；beforeEach 与 reset_config 双清隔离，AC-001 touch 不泄漏进 AC-002。

### 测试验证

- 全量 `npx vitest run`：266 文件、3168 passed | 9 skipped，全绿；`collector.test.ts` 单独 43 项通过。

## 结论（Round 2）

- 前轮 finding 复核：f001/f002 已消除，f003 核心已消除（可观测断言缺口转测试 review）。
- 本轮新发现：0 条。
- 未进表的提示：与 Round 1 相同（collector.ts 801 行/test 1208 行过大、collect 复杂度、spec 路径写 `collector/` 实为 `token-stats/`、store 记录 PK 不含 session_id——均范围外或结论提示）。
- 总体判断：三条 minor 修复验证通过，AC-001/002/003 机制与修复均正确，无未解决 critical/important。

verdict: PASS
reviewed_scope: 29b1ac182b5ee59d
