---
tid: "t526"
slug: "metric_label_settings_visibility"
title: "数据标签设置重命名与标签显隐开关"
status: "done"
branch: "t526_metric_label_settings_visibility"
worktree: ""
review_level: "single"
review_limit: "5"
verify_limit: "5"
diff_anchor: "4b333ae939df49534011341782a185fd83fea4a2"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

1. 配置层支持：在 `types.ts`、`config.ts` 与 `config_filter.ts` 中增加 `providerHiddenLabels` 与 `accountHiddenLabels`。
2. 过滤层实现：在 `provider-usage.ts` 中新增 `apply_hidden_metric_labels`，在 `use_popup_derived.ts` 中挂接，过滤被隐藏的标签。
3. UI 改造：
   - `SettingsForm.tsx`、`LabelMapDialog.tsx`、`CpaConnectorSettings.tsx`、`general_section.tsx` 文案统一替换为「数据标签设置」。
   - `SettingsForm.tsx` 与 `LabelMapDialog.tsx` 标签列表行右侧新增显隐切换按钮（眼睛图标 `eye`/`eye_off`），并支持切换持久化。
4. 测试适配：更新全部受影响既有单测与 E2E 定位器，补全字段解析、过滤逻辑与显隐交互测试，332 个测试套件（4108 passed）全绿。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round 1 (2026-09-26 23:00 UTC+8)

Round 1 零 finding。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`pnpm test` 通过（332 files，4108 passed）
- 黑盒：`pnpm test:e2e:web`（10 passed）+ 核心流程覆盖
- review：Round 1 PASS（见 `review_general.md`）
- AC 证据：见 `handoff.json`

### 结果摘要

- AC-001 ~ AC-005 全部通过，实现数据标签设置文案重命名及显隐开关能力，无技术债遗留。
