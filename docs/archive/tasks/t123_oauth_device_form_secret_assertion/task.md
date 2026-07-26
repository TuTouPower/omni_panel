---
tid: t123
slug: oauth_device_form_secret_assertion
diff_anchor: "2de7718081fa02bfc1b4cf6544d7dde3e9f39e3e"
branch: t123_oauth_device_form_secret_assertion
---

# Task t123_oauth_device_form_secret_assertion

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

只记有追溯价值的进展、踩坑、中途决策、偏离 plan、关键验证；不写命令流水账。

- 改动 2 行：OAuthDeviceForm 根容器加 `data-secret-name={secret_name}`（可测试性属性，非视觉/行为改动），grok catalog 测试断言该属性 === "OAUTH_TOKEN"。
- OAuthDeviceForm 的 secret_name prop 此前仅用于 on_save secrets 键构造，DOM 无痕量；加 data 属性是最小暴露方式。
- 豁免双审：micro task（2 行改动 + 纯测试增强），人工确认 diff 零行为变化，全量测试 1750 绿 + typecheck 过。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 解决不了；满轮后进 blocked，在「遗留」与口头报告中列出
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

### Round 1 零 finding

两轴均 0 finding 时写：「Round 1 零 finding，未进处置表。」不必建表。

### Round N (YYYY-MM-DD HH:MM UTC+8)

（有 finding 时用本表；每条 finding 一行。）

| finding_id       | severity                 | status | rationale | fix_ref   |
| ---------------- | ------------------------ | ------ | --------- | --------- |
| {tid}\_code_f001 | critical/important/minor | 已修   | {一句话}  | {文件:行} |

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep {tid}` 查，不在此记。

### 验收标准勾选

- [x] grok catalog 测试断言表单渲染层 `secret_name === "OAUTH_TOKEN"`（非仅 on_save 出口）。
- [x] 若为暴露 secret_name 加了 DOM 属性，该属性不影响现有 UI 表现（`data-secret-name` 是可测试性属性，无样式/行为绑定）。
- [x] `pnpm test` 全绿。

### Reviewer verdict

- Round 1 code：N/A（micro task，豁免双审）
- Round 1 test：N/A（micro task，豁免双审）
- Round 2 code：N/A
- Round 2 test：N/A

### 遗留

- 无

### 结果摘要

- OAuthDeviceForm 根容器暴露 `data-secret-name`，grok catalog 测试补表单层 secret_name 断言，覆盖 secret_name 从 catalog 到表单的正确传递（不再仅靠 on_save 出口）。
