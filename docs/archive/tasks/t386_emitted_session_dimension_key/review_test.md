# Task review t386（reviewer_focus: 测试）

- task：`t386_emitted_session_dimension_key`
- spec：`docs/tasks/t386_emitted_session_dimension_key/spec.md`
- diff_anchor：`031108a3c8b7bf2d87df7f3fe6b1901910fe451a`
- target：`git diff 031108a3c8b7bf2d87df7f3fe6b1901910fe451a`
- round：1
- reviewed_at：2026-08-15 07:09 UTC+8

## 验证过程

- 仓库根 `omni_panel_t386`，与 task_dir 所属一致；HEAD == diff_anchor，diff 覆盖工作区改动（collector.ts / collector.test.ts）。
- 全部 43 用例跑绿（`vitest run tests/unit/main/core/token-stats/collector.test.ts`）。
- 逐条人工 trace 三个新用例的生产路径与两处声称的 mutation 敏感性，未改源码（只读）。

## Findings

### t386_test_f001 - session_touch_ts 未加入 beforeEach / reset_config 清理，跨测试状态泄漏

- 严重度：important
- 锚点：测试可信（状态隔离）；t386 新增模块级全局 `session_touch_ts`（collector.ts:132）直接参与测试读写，却未纳入测试重置
- 位置：`tests/unit/main/core/token-stats/collector.test.ts:144-150`（beforeEach 清理块）
- 问题：beforeEach 清 `costs_state` / `opencode_max_updated` / `jsonl_states` / `source_cursors` / `emitted_record_keys`，唯独漏掉本次新增的 `session_touch_ts`；`reset_config()`（collector.ts:746）同样漏清。该 map 被测试直接写（AC-001 `session_touch_ts.set("sess-active", now)`），也被生产 collect 对每个扫描会话刷新。后果：任何扫描过会话的测试（如默认 `s1`，本文件大量用例）都给 `session_touch_ts` 留下新鲜 touch，测试间累积、永不清空。当前用例 session id 不碰撞、无现存测试翻车，但 t386 特性自身即为「注入过窗 key + 断言保留/删除」形态——未来若有测试对某会话 id 注入过窗 key 且该 id 恰被前置测试扫描过，结果随测试顺序翻转，属潜伏的顺序依赖与隔离缺陷。另：prune_emitted 的 touch 清理分支（>30d 删除 touch）从未被测试触达（测试中 touch 恒新鲜）。
- 建议：beforeEach 中补 `session_touch_ts.clear();`（与兄弟 map 一致，一行）；`reset_config` 视重启语义一并清理。

### t386_test_f002 - AC-001 手动预置 session_touch_ts，屏蔽 collect 期触碰刷新路径；关键机制未钉

- 严重度：minor
- 锚点：AC-001「窗口内持续触碰 → key 不被裁剪」的核心机制是 collect 扫描到会话时刷新 touch（collector.ts:610-612）
- 位置：`tests/unit/main/core/token-stats/collector.test.ts:1116-1117`（`session_touch_ts.set("sess-active", now)`）
- 问题：mock 已返回 `sessions: [upsert({ id: "sess-active" })]`，生产路径 `for (const s of result.sessions) session_touch_ts.set(s.id, Date.now())` 会刷新 touch——手动 `set` 冗余。因手动预置，即使删掉 collect 期刷新循环，AC-001 仍通过（touch 已存在），测试对「活跃性来自本轮扫描」这一机制盲区。去掉手动 set、仅靠 mock 会话，AC-001 即可钉住刷新路径（删循环即红灯）。
- 建议：删除手动 `session_touch_ts.set("sess-active", now)`，保留 mock 返回会话 + 过窗 key 注入即可；或改两轮用例（轮 1 扫描建 touch，再注入过窗 key，轮 2 只发新增），同时验证「只发新增不重发」的末态。

## 结论

- 前轮 finding 复核：Round 1，无
- 改测方向复核：t346「newly emitted」用例断言 `claude_code|local|m1` → `claude_code|local|s1|m1` 属 spec 驱动迁移（AC-003 明确 key 加会话维度，record 默认 `session_id: "s1"`），断言随新契约更新，非「迁就实现」。该用例的窗口裁剪断言（`old|local|m-old` 删除）语义未变仍成立，迁移合理。无迁就实现的改测。
- AC 覆盖核对：AC-001（活跃保留）、AC-002（非活跃删除）、AC-003（跨会话同 message_id 独立 key）均有独立用例；AC-003 的「同会话内去重保持」半句由既有用例 `emits nothing when no records changed since the last collect`（test:430-452）覆盖。三条 AC 全测。
- mutation 敏感性（按 trace，未跑变体）：移除 prune_emitted 活跃保留块 → 仅 AC-001 红灯（其余过窗 key 无 touch、新发 key 在窗内不受影响），与 implementer「1 failed」一致；record_key 回 3 段 → AC-003 两断言全红（`sa|dup`/`sb|dup` 塌缩为 `claude_code|local|dup`），另 t346 迁移断言也红，mutation 敏感性成立。
- 弱断言/恒真扫描：无恒真、无断言删除、无 skip/only、无静默错误、无阈值掩盖；断言均为具体 key 的 `has().toBe(true/false)`，语义可判定。
- 本轮新发现：2 条（f001 important / f002 minor）
- 未进表的提示：
  - AC-001 只断言内部 map key 保留，未验证「下次只发新增不重发」的重发记录数（spec 可测试性声明列了「key 保留/删除与重发记录数」两项）。保留机制被 spec 明确背书，可视为充分代理；补两轮 postMessage 记录数断言可更强，属可选扩展。
  - 既有 t346 两用例仍用 3 段 legacy key（`old|local|m-old`）作夹具，prune 以 `split("|")[2]` 当 session 段解析得到 message id（无 touch → 正常删除），语义未受影响，无需改。
- 总体判断：测试覆盖与 mutation 敏感性均达标、无迁就实现，但 t386 引入的模块级 `session_touch_ts` 未纳入测试重置，存在跨测试状态泄漏（潜伏顺序依赖）；f001 未解决，verdict FAIL。

## Round 2 复核（2026-08-15 07:15 UTC+8）

复核对象：implementer 对 f001/f002 的修复（diff 相对 diff_anchor 更新，含测试与源码）。全量 token-stats 298 passed（`vitest run tests/unit/main/core/token-stats/`）。

### 前轮 finding 复核

- **f001（important，session_touch_ts 清理）— 已消除**：
  - beforeEach 补 `session_touch_ts.clear();`（`collector.test.ts:149`），与兄弟 map 一致；
  - `reset_config` 同步补 `session_touch_ts.clear();`（`collector.ts:751`，重启语义与 emitted_record_keys 同步）。
  - 跨用例顺序依赖路径已断：touch 只存活于单用例内，AC-001 注入 `sess-active` 的 touch 不会泄漏到后续用例，前置用例扫描产生的 touch 也不会污染 AC-001/002。
- **f002（minor，AC-001 走生产刷新路径）— 已消除且增强**：
  - 手动 `session_touch_ts.set("sess-active", now)` 已删除；AC-001 仅靠 mock 返回 `sessions: [upsert({ id: "sess-active" })]` 触发 collect 期刷新循环（`collector.ts:613-616`）。
  - 新增断言 `session_touch_ts.get("claude_code|local|sess-active")).toBeGreaterThan(now - 1000)`（`collector.test.ts:1131-1132`）：若删刷新循环 → touch 不存在 → get 返回 undefined → 失败；若刷新键缺 source|env 前缀 → get("claude_code|local|sess-active") 未命中 → 失败。断言钉住刷新路径且验证前缀格式，非恒真、非弱化。
  - 注意源码同步演进：touch 键由 `s.id` 改为 `${src.source}|${src.env}|${s.id}`，prune_emitted 由 `split("|")[2]` 改为拼 `parts[0]|parts[1]|parts[2]`（`collector.ts:152-155`）。测试断言与新格式一致，AC-001/002/003 断言全按 4 段 key + 带前缀 touch 键，无残留旧格式断言。

### 本轮新发现

- 0 条。逐条扫描：无恒真、无断言删除/反转/注释、无 skip/only、无静默错误、无阈值掩盖；AC-001 新增 `toBeGreaterThan(now - 1000)` 验证具体键存在且新鲜，非存在性恒真；AC-001/002 对照清晰（touch 存在保留 vs 无 touch 删除）。
- mutation 敏感性复核（trace）：保留移除 → AC-001 红灯（touch 断言连带红）；key 回 3 段 → AC-003 + t346 迁移断言红。仍成立。

### 结论（Round 2）

- 前轮 finding 复核：f001 已消除；f002 已消除。
- 改测方向复核：本轮无迁就实现的改测；AC-001 新增 touch 断言随生产路径与格式演进更新，语义成立。
- 本轮新发现：0 条
- 未进表的提示：
  - prune_emitted 的 touch 过期清理分支（`collector.ts:164-167`，>30d 删 touch）仍无直接测试——属「可再加 case」，不阻断；现有用例 touch 恒新鲜，该分支对活跃会话不触发。
  - touch 键 source|env 前缀的「跨源会话 id 碰撞防误保」语义无直接测试（如两源同 session id、仅一源活跃）——AC-003 覆盖跨会话同 message_id，未覆盖跨源同 id，可选扩展。
- 总体判断：两条 finding 均已真修（f001 清理补全、f002 走生产路径并新增钉住断言），全量 298 passed，无未解决 critical / important，verdict PASS。

reviewed_scope: 29b1ac182b5ee59d

verdict: PASS
