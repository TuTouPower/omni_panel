---
tid: "t481"
slug: "dev_panel_shell"
title: "开发面板骨架 + commit 历史"
status: "backlog"
branch: ""
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: ""
depends_on: ""
conflicts_with: ""
note: "新增第5个面板 route=dev：窗口/导航/托盘入口 + commit 热力图(React+echarts) + 扫描根配置；来源 project_manager/my_life 迁移"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

### 2026-09-14 文档修订（review 意见落地，未实施）

本轮按已批准审阅意见修订 `spec.md`，未开始实现：

- 删除 Web「只读渲染、不做写操作」与非范围「不接受网络输入」等矛盾：改为 **Web 完整操作**（配置扫描根/cutoff/作者、发起扫描、查进度结果错误），宿主执行，两端新鲜度一致（AC-003/007/010）。
- 补实际 HTTP/bridge/宿主通路要求，不能只有 mock 展示；未接通不得伪 PASS。
- git 数据契约明确为**目标契约**（非引用外部仓）：author(`%an/%ae`) vs committer(`%cn/%ce`)、日期时区归一与标注、worktree/重复根按真实 git dir 去重、全局 git 身份缺失降级策略；新增 AC-011/012。旧 AC-001..010 编号保持不动。
- 补并发扫描/部分失败/资源边界（AC-013）；`git` GUI 定位 spike 保留为 `UNVERIFIED-SPIKE`，并明确 shell 成功不代表 GUI 成功，真实 GUI 验证属 `[deploy]`。
- 来源注记：外部迁移仓内容为历史记录引用，本 task 不访问外部仓、不冒充已核实。

调查路径：读本仓 `docs/tasks/t481_dev_panel_shell/spec.md` 原稿、`src/renderer/hooks/use-route.ts`、`src/renderer/lib/panel-navigation.ts`、`src/renderer/components/ui/PanelTitleBar.tsx`、`src/main/window/window-manager.ts`、`src/main/core/session-history/codex-extractor.ts`（边界对齐参考）。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round N (YYYY-MM-DD HH:MM UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t000_code_f001|critical/important/minor|已修/遗留/撤回|一句话|文件:行 / pNNN / tid|

无 finding 时写“Round N 零 finding”。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足 / 未满足
- 测试：待执行时填写
- 黑盒：待执行时填写
- review：待执行时填写
- AC 证据：见 `handoff.json`

### 结果摘要

- 待执行时填写；遗留只写引用，不复制正文
