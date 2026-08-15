# Task spec

## 背景

collector 与 codex 相关的 4 条 minor 遗留合并（均 t345/t346/t377 review 遗留）：p164 的 AC-004 测试 mock 忽略 scan-state（每轮恒返回同 2 条），re-emit 断言对「回滚是否必需」不敏感；p165 的 daily 截断游标路径（daily 超 MAX_RECORDS\*5 截断跨轮推进）无测试；p167 的 emitted 裁剪在去重循环后执行，边界到期 key 重发延迟一轮；p176 的 codex 跨年分桶用例未断言 day_key 月偏位/去零填充。均为测试补全 + p167 一处 minor 时序优化。

## 契约区

### 范围

- `tests/unit/main/core/collector/collector.test.ts`：
    - AC-004 测试改用真实增量状态（第二轮返回 [] 模拟 state 已推进），验证「回滚 → 重扫 → 重发」闭环（对比现在 mock 恒返回同 2 条）
    - 补 daily 截断游标路径跨轮推进用例（对齐已有 session 维度截断用例）
    - 补 emitted 边界到期 key 回收用例
- `src/main/core/collector/collector.ts`：prune_emitted 时序调整——去重循环前先 prune（边界到期 key 本轮即回收，不延迟一轮）
- codex 相关测试：跨年分桶补 day_key 月偏位/去零填充精确断言（不重蹈「内联复制实现」反模式）

### 非范围

- collector 扫描状态原子性（t385）、emitted 会话维度 key（t386）
- collector 其它行为改动（除 prune 时序外）

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。

<!-- /规范 -->

- [ ] AC-001：AC-004 用真实增量状态——collector.test.ts AC-004 用例第二轮 scan 返回 []（模拟 scan-state 已推进），断言「回滚 → 重扫 → 重发」闭环成立（改后 mock 不再恒返回同 2 条）。
- [ ] AC-002：daily 截断游标有测试——daily 超限（> MAX_RECORDS\*5）跨轮推进截断有明确用例断言（对齐 session 维度截断用例结构）。
- [ ] AC-003：边界到期 key 本轮回收——emitted 裁剪在去重循环前执行，恰在窗口边界的 key 本轮即被回收（不再延迟一轮重发）；有测试锁定。
- [ ] AC-004：codex day_key 精确断言——跨年（12-31/01-01）分桶用例对 obs 的 day 派生字段断言月偏位/去零填充（捕月偏一位/缺零填充回归）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：collector 单测 + codex 单测覆盖。

## 上下文区

- 来源：p164 / p165 / p167 / p176（`docs/pending/todo/`；2026-08-15 核实：均仍存在，测试缺口成立，p167 为 minor 时序优化）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- `collector.test.ts`：AC-004 改为注入有推进语义的 mock scan（第二轮 []）；补 daily 截断跨轮用例；补 prune 时序用例（窗口边界 key）。
- codex 测试：跨年用例补 day_key 断言（按 obs 的 day 派生字段，不复制实现逻辑）。
- 生产改动仅 prune 时序一处，其余纯测试。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：prune 时序调整影响 emitted 去重行为（边界 key 提前回收可能提前重发）——AC-003 用例锁定，且与既有裁剪语义一致（窗口边界本就到期）。
- 回退：git 回退；AC-003 用例锁定新时序，既有用例锁定裁剪语义。

### 依赖与约束

- 无前置依赖。实现约束：prune 提前不影响窗口语义（仅回收时机提前一轮）；测试改动不把旧断言改成新实现输出（TDD 规范）。

### Finalization 时更新的 blueprint

- 无
