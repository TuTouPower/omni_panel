---
tid: "t471"
slug: "connector_identity_manifest_id"
title: "连接器身份改 manifestId：平台无关标识 + 存量迁移"
status: "backlog"
branch: ""
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: ""
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

### 2026-09-14 文档修订（review 意见落地，未实施）

本轮按已批准审阅意见修订 `spec.md`，未开始实现。要点与依据：

- 补全行为 AC：新增 AC-007（异平台/混合路径分隔符的尾段提取）、AC-008（manifest 身份与实例身份分离、多实例参数/启用态/secret 归属保留）、AC-009（未知 manifest 孤儿清理的脱敏日志与结果摘要）。原 AC-001..006 编号保持不动。
- manifest 身份与实例身份分离：`manifestId` 只定位定义，`instanceId`/`stateId` 仍是实例身份与 `keyFor(instanceId, name)` 的 secret 归属键；迁移与 auto-seed 不得合并或改写实例身份。依据：本仓 `config/types.ts:36-47`（现无 manifestId）、`auto-seed.ts:23-74`（现按目录名/id 匹配）、`secret_param_keys.ts`（按实例取 secret keys）。
- 异平台分隔符：现 `auto-seed.ts:30` 只用 `split(/[/\\]/)` 取尾段，未覆盖 UNC/盘符/结尾分隔符等；本 task 要求尾段提取覆盖这些形态（AC-007）。
- 孤儿清理决策由用户确认（确实移除），本 task 不改决策，只补可观察性与脱敏日志要求（AC-009）。
- 未知契约清单无阻塞项；`auto-seed` 的 `name.toLowerCase()===id` 兼容分支明确在迁移后删除。

调查路径：读 `AGENTS.md`、`docs/blueprint/conventions.md`、`docs/findings/d058_multi_entry_impl_audit.md`；本仓源码 `src/shared/types/config.ts`、`src/main/core/config/{types,auto-seed,secret_param_keys,config-store}.ts`、`src/main/ipc/config-ipc.ts`、`src/main/core/connector/manifest-loader.ts`。

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
