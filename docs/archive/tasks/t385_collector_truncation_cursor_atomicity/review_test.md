# Task review t385（reviewer_focus: 测试）

- task：`t385_collector_truncation_cursor_atomicity`
- spec：`docs/tasks/t385_collector_truncation_cursor_atomicity/spec.md`
- diff_anchor：`c9e2a17e0d8a7e46afd46f1d38560a1278e08288`
- target：`git diff c9e2a17e0d8a7e46afd46f1d38560a1278e08288`
- round：1
- reviewed_at：2026-08-15 06:55 UTC+8

## Findings

无（本轮 0 finding）。

逐条危险模式扫描（全部未命中，调查结论见下）：

- **恒真断言**：无。全部断言对具体值/集合成员/长度。
- **删除/反转/注释 expect**：无删除、无反转、无注释掉断言。
- **弱化断言**：AC-003 与 AC-001 用 `toMatchObject({ id: "s10000" })` 断言会话对象单字段，与既有 t345 用例（collector.test.ts:831/933）同模式，非对既有精确断言的弱化。`.has("s0")` 相对旧 `toBe(10000)` 是增强。
- **删测试**：无 it/describe 删除。
- **跳过/独占**：无 `.skip` / `.only`。
- **静默错误**：两文件文件级 `eslint-disable` 为既有，diff 未新增。
- **mock 误用**：mock 对象均为系统边界——claude-reader/opencode/kimi/grok reader（文件解析）与 Electron `parentPort`。未 mock collector 自身或被测截断逻辑。
- **阈值掩盖 / 条件跳过 / 程序赋值替代 / 存在即通过**：均未命中。

## AC 覆盖与可信核对（调查记录）

- **AC-001**：collector-state.test.ts:214-227 round-trip 走真实生产序列化路径（该文件未 mock scan-state，save/load 为真实文件 IO），敏感于 serialize 漏 source_cursors（restored 为 undefined 即 `undefined.has` 抛错）；collector.test.ts:803-841 锁跨轮推进与清除。组合覆盖「重启后从截断点续推」。
- **AC-002**：collector.test.ts:843-875。构造第二轮 mock 返回 `[aa, ...s20000]`（aa 字典序在 s0 前，模拟 reader 排序输出）。身份跳过实现下 aa 被推入；若改回位置计数（旧实现），前 10000 个跳过位含 aa → aa 永不被推 → `update.sessions.some(id==="aa")` 假 → 用例挂。implementer 声称的「1 failed」经手工推演证实。
- **AC-003**：collector.test.ts:877-906。断言三点：失败后游标 size=10000（轮前值保留，非删除——删除实现下 `undefined.size` 抛错）；第三轮续推 s10000 开头（快照恢复对/无回滚时第三轮空/首元素非 s10000 均挂）；失败轮载荷 s10000.. 在第三轮重发（重扫重发幂等）。对「删除回滚」「无回滚」两种 mutation 均敏感。用例标题与断言以 `size` 判恢复而非 `has=false`，方向正确。
- **AC-004**：collector-state.test.ts:229-245。构造无 `source_cursors` 键的修复前 JSON，load 不报错、`costs_state` 完整、游标空；敏感于 load 对缺字段抛错（catch 清空全部 map → costs 断言挂）。
- 验证运行：`vitest run collector.test.ts collector-state.test.ts` 2 文件 50 测试全绿。

## 结论

- 前轮 finding 复核：Round 1，无前轮。
- 改测方向复核：唯一改测是 t345「advances the truncation cursor across rounds」用例（collector.test.ts:803-841）。旧断言 `source_cursors.get(...)?.sessions === 10000`（数值游标）改为 `.sessions.size === 10000` + `.sessions.has("s0")`（身份集合游标）。这是游标数据结构 number→Set 的类型适配，非「把预期改成当前实现的输出」：用户可观察行为断言全部保留且未弱化——首轮发 10000、第二轮 `update.sessions[0]` 为 s10000（跳过前缀不重发）、第三轮空 + 游标清除。`.has("s0")` 是新增更严格检查。结论：合法改测，无迁就实现。
- 本轮新发现：0 条（正式 finding）。
- 未进表的提示：
  1. AC-001 无单条「重启后继续推进」端到端用例，由两个文件组合覆盖：collector-state.test.ts:214-227（save→reset→load round-trip，持久化层）+ collector.test.ts:803-841（同进程跨轮推进）。组合无缺环——save/load 与 collect 读写同一模块级 `source_cursors` map，两子行为各自被锁时组合必然成立。可选补一条「load 旧游标后 collect 续推」作显式覆盖，非阻断。
  2. AC-002 用例只断言 aa 被推入，未同时断言第二轮 s0..s9999 仍被跳过（「忽略游标、从头推前 10000」这类更宽泛回归不会挂本用例）；该回归由 t345 改测的 `update.sessions[0]===s10000` 兜住，两用例互补，非缺口。
  3. daily 身份键跳过（新 daily 排游标前 / 跳过行为）无专门行为用例，仅 AC-001 round-trip 覆盖 daily 集合持久化；daily 路径镜像 sessions 且非 AC 焦点，可接受。
  4. AC-004「扫描正常推进」半句未直接执行 collect 验证，只验「不报错 + 旧字段完整 + 游标空」；load 成功即空游标，推进自然成立，非阻断。
- 总体判断：AC 全部可达且 mutation 敏感，无未解决 critical/important，仅有可选扩展提示，PASS。
- 系统性 follow-up：无。

verdict: PASS
reviewed_scope: b39b15772bb8d12f
