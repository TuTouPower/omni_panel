# Adoption T007

逐条处置 `review_code.md` 和 `review_test.md` 的 finding。流程见 AGENTS.md step 6。

| finding_id     | decision | rationale                                                                                  | status |
| -------------- | -------- | ------------------------------------------------------------------------------------------ | ------ |
| T007_code_f001 | 采纳     | format:check 命中 tasks_index.md：T007 backlog→active 使末列宽度少 1 空格，prettier 未重排 | 已修   |
| T007_test_f001 | 采纳     | 同 code_f001（同一 format 问题）                                                           | 已修   |
| T007_test_f002 | 采纳     | spec 范围第 3 条「加前置 T007」措辞不准——T006 spec 早已含前置引用；改「确认含」            | 已修   |

字段说明：

- `decision`：采纳 / 不采纳。
- `rationale`：一句话理由；`遗留` 项在此写未修原因。
- `status`：`已修` / `遗留` / `无需修改`。

遗留汇总：无（3 项全部当场修）。
