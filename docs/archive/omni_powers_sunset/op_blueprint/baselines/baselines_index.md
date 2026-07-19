# baselines 索引

> 基准文件索引：功能名 → AC → 文件 + 更新说明。
> AC 的文字定义在 spec（`op_execution/specs/{前缀}.md` 的「验收场景」段，工作前缀经 frontmatter `feature` 字段映射到功能名），本文件**只索引基准快照文件**，不存 spec 内容。
> baselines 按功能名存（与 `specs/{feature}.md` 同键，1:1 零桥接）；前缀永不复用（op_execution 层）。

<!-- 每个功能一个 section，按 AC 列基准文件 -->

## {功能名}（{YYYY-MM-DD}）

| 文件                        | 对应 AC | 类型   | 说明                 |
| --------------------------- | ------- | ------ | -------------------- |
| {功能名}/AC-N_desc.dom.html | AC-N    | 结构化 | {一句说明}           |
| {功能名}/AC-N_desc.txt      | AC-N    | 结构化 | {stdout/CLI 原文}    |
| {功能名}/AC-N_desc.png      | AC-N    | 视觉   | {截图锚点，advisory} |

<!--
类型语义：
- 结构化信号（DOM/a11y/stdout/API 响应体/DB 查询/进程日志）→ 进机械硬门，夜跑回归判定以此为准
- 视觉锚点（截图）→ advisory，重验时 evaluator 多模态对照，不机械阻断
新增/更新/删除走 closer per-leaf 提案 + leader 审批（§7.4 节奏二）。
-->
