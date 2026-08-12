# Task review t320（reviewer_focus: 通用）

- task：`t320_agent_session_table_dotless_badges`
- spec：`docs/tasks/t320_agent_session_table_dotless_badges/spec.md`
- diff_anchor：`534a199dbc23ea228f7cf66e41f86aeab9625200`
- target：`git diff 534a199dbc23ea228f7cf66e41f86aeab9625200`
- round：1
- reviewed_at：2026-08-12 17:36 UTC+8

## Findings

无（clean review）。

diff 范围与审阅结论说明：

- `git diff 534a199d` 仅含 t320 自身改动（task.md 进程文件 + SessionTable.tsx / Badge.tsx / 两个测试文件），t319 的 provider_card_states 改动已含于 534a199d 内，不在本 diff 中，天然隔离。
- 实现与契约区逐条核验：
    - AC-001：`SessionTable.tsx:120-122` 标题 `<h3>` 仅保留「会话明细」，删「点击表头排序」span。测试 `session_table.test.tsx:46-50` 断言标题存在 + `queryByText("点击表头排序")` 为 null。
    - AC-002：`SessionTable.tsx:258` 工具列 agent Badge 传 `dot={false}`。
    - AC-003：`SessionTable.tsx:274` 模型列每个 Badge 传 `dot={false}`。
    - AC-004：`SessionTable.tsx:249` sub-agent Badge 传 `dot={false}`。
    - AC-005：`Badge.tsx:16` 解构默认 `dot = true`，label 分支 `Badge.tsx:42` `{dot && <span ...rounded-full.../>}`。未传 dot 的既有调用行为不变。测试 `ui.test.tsx:225-238` 验证默认有圆点、`dot={false}` 移除。
    - AC-006：`session_table.test.tsx` 既有 7 条行为测试（工具名、复选框、打开历史、分页、排序翻页清空）原样保留，与新增断言同文件共存。
- 非范围项未动：数据/排序/分页/筛选逻辑未改，表头列名未改，count 形态与 `StatusDot` 等未改。
- 全仓 `variant="label"` 调用点仅 3 处（均在 SessionTable.tsx，grep 确认），全部显式 `dot={false}`，无遗漏调用点。`docs/specs/ai-cli-token-stats-ui.md` 与 `docs/blueprint/` 无「点击表头排序」/ `rounded-full` 残留描述，Finalization 蓝图同步无待办；`docs/blueprint/DESIGN.md` 不存在。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：不适用，本轮为 Round 1。
- 本轮新发现：0 条。
- 未进表的提示：AC-002/003/004 断言用 `agent.closest("span")?.querySelector(".rounded-full")`，`?.` 仅在 Badge 外层 span 结构消失时才会产生空值放行——当前 Badge 恒渲染 span 包裹，该分支不触发，且断言在有圆点时必然失败，非恒真。断言目标与 spec「可测试性声明」约定的「无 `rounded-full` 圆形点 span」一致。
- 总体判断：实现最小、精确匹配契约区全部 AC，测试断言触达可观察 DOM 结构，无未解决 critical / important，仅有可选 minor 均不成立，PASS。
- 系统性 follow-up：无。

### AC 复验披露

- AC-001：re_verified。重跑 `session_table.test.tsx` 绿，断言 `queryByText("点击表头排序")` 为 null 且标题存在。
- AC-002：re_verified。`dot={false}` 在 `SessionTable.tsx:258`；测试断言 agent 标签内无 `.rounded-full` span，绿。
- AC-003：re_verified。`dot={false}` 在 `SessionTable.tsx:274`；测试遍历 m1/m2 断言无 `.rounded-full` span，绿。
- AC-004：re_verified。`dot={false}` 在 `SessionTable.tsx:249`；测试断言 sub-agent 标签内无 `.rounded-full` span，绿。
- AC-005：re_verified。`Badge.tsx` 默认 `dot=true`；`ui.test.tsx` 新断言 + 既有 Badge 断言 26 条全绿（独立重跑）。
- AC-006：re_verified。spec 枚举的既有行为断言均位于 `session_table.test.tsx`（本 reviewer 独立重跑该文件 9 条全绿）；全量套件 2944 tests green 采信实施侧已产出证据作补充。

coverage = re_verified / 总 AC 数 = 6 / 6

reviewed_scope: 6ab07ece15862860

verdict: PASS
