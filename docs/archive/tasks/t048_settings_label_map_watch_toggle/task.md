---
tid: t048
slug: settings_label_map_watch_toggle
diff_anchor: "16ee8348343ab0bc78b9945cf89965679a5a416d"
branch: t048_settings_label_map_watch_toggle
---

# Task t048_settings_label_map_watch_toggle

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 需求修正（开干前）：t043 把「监控即将重置」入口放主面板 period 行（用户当时选项选错）。实际需求是设置页账号详情「数据标签映射」旁，per raw_label。数据层（t043）不变，本 task 只改入口位置（SettingsForm 数据标签映射每行加 bell）。主面板 bell 保留。

## Review 处置

**本文件本小节 = 处置表唯一落点。**

### Round 1 (2026-07-23 16:30 UTC+8)

- code：2 finding（均 minor），进表。
- test：2 finding（1 important + 1 minor），进表。

| finding_id     | severity  | status | rationale                                                                                                                                        | fix_ref                                                      |
| -------------- | --------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| t048_code_f001 | minor     | 已修   | `.lm-watch` CSS 未定义；补 globals.css 行内 toggle 样式（`--chip-bg` 已存在）                                                                    | src/renderer/styles/globals.css                              |
| t048_code_f002 | minor     | 已修   | SettingsForm 新增 prop camelCase/snake_case 混用；统一 camelCase `onToggleWatched`（对齐既有 `existingLabelMap` 等）                             | SettingsForm.tsx / SettingsView.tsx / settings_form.test.tsx |
| t048_test_f001 | important | 已修   | SettingsView `onToggleWatched` 聚合 + `save_config` 持久化分支无测；补 settings_view 3 用例（全未→add / 全 watched→remove / 多 accountKey 聚合） | tests/unit/renderer/views/settings_view.test.tsx             |
| t048_test_f002 | minor     | 已修   | aria-pressed「部分 watched」every 边界未覆盖；补 settings_form 1 用例（N-1 watched→false）                                                       | tests/unit/renderer/components/settings_form.test.tsx        |

### Round 2 (2026-07-23 17:10 UTC+8)

- code：0 finding（PASS）—— f001 CSS + f002 命名统一已修并确认。
- test：0 finding（PASS）—— f001 聚合持久化测 + f002 every 边界已修并确认。零 finding，未进处置表。

### Round N (YYYY-MM-DD HH:MM UTC+8)

| finding_id       | severity                 | status | rationale | fix_ref   |
| ---------------- | ------------------------ | ------ | --------- | --------- |
| {tid}\_code_f001 | critical/important/minor | 已修   | {一句话}  | {文件:行} |

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep {tid}` 查。

### 验收标准勾选

- [x] 设置页账号详情展开「数据标签映射」，每条 raw_label 行右侧显示 bell（默认关 opacity 0.35）。
- [x] 点击 bell 持久化 `upcomingResetWatched`（provider+accountKey+raw_label），刷新保留（settings_view 集成测 + 实机验证）。
- [x] accountKey/raw_label 维度对齐 `collect_upcoming_resets`（`accountKey()` 共用）。
- [x] 多 account instance：bell 对该 raw_label 的所有 accountKey 一起 toggle（settings_view 用例 c：3 accountKey 聚合）。
- [x] SettingsForm 组件测：bell 渲染 + watched 状态（全 watched/部分 watched every 语义）+ 点击回调。
- [x] `pnpm test` 1516 全绿；typecheck/lint 干净。

### Reviewer verdict

- Round 1 code：FAIL（f001 CSS + f002 命名，均 minor → 已修）
- Round 1 test：FAIL（f001 聚合持久化 important + f002 every 边界 minor → 已修）
- Round 2 code：PASS
- Round 2 test：PASS

### 遗留

- 无。

### 结果摘要

- t043 把「监控即将重置」入口误放主面板 period 行；本 task 在设置页账号详情「数据标签映射」每行补 bell toggle（per raw_label，多 accountKey 聚合），数据层不变。主面板 bell 保留（两处入口共存）。
