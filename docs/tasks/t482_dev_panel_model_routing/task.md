---
tid: "t482"
slug: "dev_panel_model_routing"
title: "开发面板模型路由（New API）"
status: "backlog"
branch: ""
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: ""
depends_on: "t481"
conflicts_with: ""
note: "读外部 new_api.yaml，渠道映射读写 UI + 自检；来源 project_manager model_routing.py 迁移"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

### 2026-09-14 文档修订（review 意见落地，未实施）

本轮按已批准审阅意见修订 `spec.md`，未开始实现：

- 用 `task.py edit --depends-on t481` 登记 `depends_on: t481`（面板骨架与 route `dev`）。
- Web 可完整操作（读取配置/渠道列表/保存映射/自检），补 HTTP/bridge/宿主契约，不限仅桌面 IPC；外部 token 仍仅宿主持有，两端响应均脱敏、不下发（AC-009/010）。
- 落实部分失败与快照策略、二次确认两端一致：停止后续写入 + 成功/失败/未执行分类 + 保留 `models`/`model_mapping`/`priority` 快照 + 不自动回滚（AC-011）；`HTTP 200 + success:false` 判失败回归（AC-012）；补二次确认 AC-013。原 AC-001..009 编号保持不动。
- 真实 New API 字段分页、真实自检回复名解析保留为 `UNVERIFIED-SPIKE`（mock 不算真实核实，且不实际读 token/访问服务）；允许执行期 spike，不伪造证据。来源注记：外部仓内容为历史引用，本 task 未访问。

调查路径：读本仓 `docs/tasks/t482_dev_panel_model_routing/spec.md` 原稿、`docs/findings/d058_multi_entry_impl_audit.md`；确认当前仓内无 model_routing 实现（0 命中），仅历史 spec 引用。

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
