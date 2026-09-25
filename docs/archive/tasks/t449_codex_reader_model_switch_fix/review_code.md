# Task review t449（reviewer_focus: 代码）

- task：`t449_codex_reader_model_switch_fix`
- spec：`docs/tasks/t449_codex_reader_model_switch_fix/spec.md`
- diff_anchor：`6afd035dc7e500a85d313f012d3faaafd17382ec`
- target：`git -C '/home/testuser/testuser_ubuntu/omni_panel_t449' diff 6afd035dc7e500a85d313f012d3faaafd17382ec`
- round：1
- reviewed_at：2026-09-04 20:57 UTC+8

reviewed_scope: 176988089e4a72e2

## Findings

无（0 条，clean review）。

审查范围核实：diff 仅触达 `src/main/core/token-stats/codex-reader.ts`、`tests/unit/main/core/token-stats/codex-reader.test.ts`、task 状态文件 `docs/tasks/.../task.md`（front matter 状态字段由任务工具链维护，属预期）。逐维度结论见下。

### 规格合规（实现层）

- **AC 覆盖**：AC-001/AC-002/AC-003 均有对应实现与测试落点，无缺失。
    - AC-001：`parse_rollout_file` 删除 model 切换时 `segment_prev_total/segment_prev_cache` 重置（diff 206-210 行删除块），改为文件级 `prev_total`/`prev_cache` 连续差分；新增单测 `t449 AC-001` 覆盖。
    - AC-002：依赖重扫 + 文件级连续差分语义（约束注明量级不逐字锁定、自造 fixture 等价覆盖，见 spec 可测试性声明）。
    - AC-003：单 model 路径未改（t445/t448 既有用例全绿）。
- **不偏航**：改动仅限差分基准重置逻辑与其注释、对应单测；无范围外模块改动。
- **不自由发挥**：无额外功能；仅做最小改名（`segment_prev_*`→`prev_*`）以匹配文件级语义。
- **不变量守住**：「model 切换不重置 prev、首事件 prev=0 起」实现与 spec 一致；`segment_model` 仅保留作归因标签，符合 spec「model 仅作增量归因标签」。
- **技术约束**：无普通版本号/库/目录结构与 spec 冲突。

### 代码质量 / 正确性

- 改动后控制流：token_count 事件 `prev_total = Math.max(prev, usage.total)` 与 `prev_cache = Math.max(prev_c, usage.cache_read)` 不再受 model 段影响；`cache_delta` 门控 `delta > 0` 语义保留（t448 AC-005 零增量不 double 计）。未引入 off-by-one、空值或状态不一致。
- 归因标签：跨段累计增量归因到 token_count 事件出现时的 `active_model`（`segment_model ?? model ?? ""`），符合 spec 归因语义。
- 边界：文件级连续假设下 total 单调、model 切换无跳变；cache 与 total 同为文件级连续累计（d051/既有注释）。若上游语义不符按 spec「风险与回退」属已批准风险，非本 task 缺陷。
- 安全、契约/类型/breaking、性能/资源：本 diff 无外部输入拼接、无公开 API/配置键变更、无新增 IO/查询路径，均无可报项。
- 错误处理/可观测：无新增吞错或日志路径。
- DRY/命名/死代码：`segment_prev_*` 无残留引用（工作树 grep 为 0）；变量更名后语义准确；无死代码引入。

### 复验证据（非测试层评述，供 AC 判定引用）

- 运行 `vitest run tests/unit/main/core/token-stats/codex-reader.test.ts`：8/8 通过（含既有 t445 4 条、t448 AC-005/006、paths、新增 t449 AC-001）。
- 手算新单测红/绿有效性：修正前（切换重置 prev）model-a 段计 1000 + model-b 段首全量 2000 → panel_total=3000 ≠ 断言 2000，测试确实会红；修正后 1000 + 差分 1000 = 2000，绿。测试可区分修正前后行为，非恒真。
- `npx tsc --noEmit` 通过；`eslint`（两触及文件，`--max-warnings=0`）无告警。

## 结论

- 前轮 finding 复核：本轮为 Round 1，无前轮。
- 本轮新发现：0 条。
- 未进表的提示：
    - `src/main/core/token-stats/codex-reader.ts` 496 行，达实现源码 400 行 minor 阈值，但本 task 净删行（约 -2），不满足「本 task 仍净增」的出 finding 条件（文件过大降级规则）。
    - `parse_rollout_file` 手算圈复杂度约 16（含多事件类型分支），达 ≥10 结论段提示档；本 task 未增加该函数分支/嵌套（仅删除重置逻辑），不满足 ≥15 且新增的出 finding 条件。
    - 注释中证据来源写「d051/t449 实测」，「116 文件 0 回绕、model 切换无跳变」的实测实际源于 p214/p216 阶段；来源标注欠精确，无行为影响，故仅提示不进 finding 表。
    - 范围外观察：无。
- 总体判断：改动最小且聚焦 spec 范围，AC-001/AC-003 经独立复验绿，未发现未解决的 critical / important，仅有轻微注释来源标注瑕疵（minor 以下），判定 PASS。

### AC 复验方式

- AC-001：`re_verified`。重跑 `vitest run`（8/8 绿）并手算断言：新单测期望 panel_total=2000，与文件级连续差分末累计值一致；修正前逻辑（切换重置 prev）该测试会红（3000），红绿有效。
- AC-002：`trust_prior`。真实 example_game gpt-5.6-sol 文件（`.codex/sessions`）仓库外黑盒数据，本 worktree 不可达；依赖 spec 可测试性声明的等价自造双 model fixture 覆盖与 mtime-incremental 重扫入库机制证据。
- AC-003：`re_verified`。本次运行既有 t445/t448 单 model 用例（含 t448 AC-005/AC-006 缓存与重复 total 语义）全部通过，typecheck/lint 无告警。

coverage = 2/3
建议合并前人工抽查 trust_prior 项。

- 系统性 follow-up：无。

verdict: PASS
