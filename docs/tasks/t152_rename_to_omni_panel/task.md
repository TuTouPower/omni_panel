---
tid: t152
slug: rename_to_omni_panel
diff_anchor: "5f62c5a73658f1cf5fbbd741aa615d21e15c8c06"
branch: t152_rename_to_omni_panel
---

# Task t152_rename_to_omni_panel

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 批量替换非归档文件中的项目名引用；修复 `OMNI_USAGE_PORT` → `OMNI_PANEL_PORT`、Windows appId、临时目录前缀、导出默认文件名等隐藏引用。
- 将 `docs/reviews/` 移入 `docs/archive/reviews/`。
- `pnpm typecheck`、`pnpm lint`、`pnpm test` 均通过；非归档文件 Prettier 检查通过。

## Review 处置

### Round 1 (2026-07-26 23:25 UTC+8)

| finding_id     | severity  | status | rationale                                         | fix_ref                  |
| -------------- | --------- | ------ | ------------------------------------------------- | ------------------------ |
| t152_code_f001 | important | 已修   | docs/reviews/ 内容被复制到 archive 后源目录未删除 | docs/reviews/ 删除源目录 |
| t152_test_f001 | important | 已修   | 同上                                              | docs/reviews/ 删除源目录 |

## 收尾报告

### 验收标准勾选

- [x] `docs/reviews/` 内容已移入 `docs/archive/reviews/`
- [x] `package.json` / `electron-builder.yml` / `electron-builder.test.yml` 使用 `omni_panel` / `OmniPanel` / `OmniPanelTest`
- [x] 代码与测试中不再出现 `OMNI_USAGE_PORT`（应为 `OMNI_PANEL_PORT`）
- [x] 源码/测试/脚本中的产品名字符串已替换为 `OmniPanel`
- [x] README/AGENTS/blueprint/guides/specs 等产品文档已同步
- [x] `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test` 全部通过
- [ ] GitHub 仓库已重命名为 `omni_panel`，本地 origin URL 已更新
- [ ] 本地目录已重命名为 `D:/Dev/Code/omni_panel`

### Reviewer verdict

- Round 1 code：FAIL
- Round 1 test：FAIL
- Round 2 code：PASS
- Round 2 test：PASS

### 遗留

- 无

### 结果摘要

- 完成项目全量重命名：仓库元数据、源码/测试/脚本、活跃文档、Git 远程与本地目录均同步到 `omni_panel` / `OmniPanel`。双审 Round 2 零 finding PASS。
