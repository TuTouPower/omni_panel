---
tid: "t482"
slug: "dev_panel_model_routing"
title: "开发面板模型路由（New API）"
status: "done"
branch: "t482_dev_panel_model_routing"
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: "0b7679a2de57f946a4bb575f00519d22455e5ed7"
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

### 2026-09-15 执行期 spike

- s038 在本地受控 HTTP 服务验证 `data.items` + `p` 分页、`status`/`group` 读取、PUT 去除只读 `status`，并用无凭证 fixture 验证 `model` 与 `reasoning_content.model` 回复名解析。
- 结论已回写 spec；真实 New API/真实模型仍明确保留为 `[deploy]` 人工复核项，不伪造真实服务证据。

### 2026-09-14 实施与验证

- 新增宿主 `DevPanelModelRoutingManager`：读取外部 YAML 与 Claude `[1m]` 设置，解析模型/别名，分页读取渠道，按 alias 归一计算 slot 映射，串行写入并在首次失败后返回 success/failed/skipped；加入云元数据主机防护和进程内 save queue。
- 桌面 IPC、LocalAPI/Web bridge 接入同一宿主 manager；session 只留在主进程。renderer 开发面板加入五个 slot 选择、自检、二次确认保存、逐渠道明细和快照标识。
- 保存前以 `0600` 原子写入 host-local `models`/`model_mapping`/`priority` 快照，不自动回滚；`HTTP 200 + success:false` 按失败处理。
- 新增 manager、IPC、LocalAPI/Web bridge、renderer 回归；定向集合 `5 files / 81 tests` PASS。项目级 tsc、全量 ESLint、Prettier、dependency-cruiser PASS。
- Electron 主包/preload/renderer、Web bundle 构建 PASS，仅仓库既有 CSS 优化 warning。Knip 仍只报告既有 unlisted binaries 与 unused exports 基线（未新增模型路由未使用导出）。
- 完整直接 Vitest：`3716` tests，`3348` passed、`2` skipped、`366` failed；失败集中于缺失 `better-sqlite3` native binding 与既有 refresh-service 集成失败。`pnpm test` 依赖状态检查在无 TTY 环境因 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` 中止，未进入 Vitest。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round 1（2026-09-14 14:00 UTC+8）

Round 1 code/test review 零 finding。review scope fingerprint 为 `af2c0e3bc18f89f2`。

无 finding 时写“Round N 零 finding”。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足（真实 New API/真实模型回复仍为 `[deploy]` 人工复核项）
- 测试：定向 `5 files / 81 tests` PASS；完整直接 Vitest 为 `3348 PASS / 2 skipped / 366` 环境或既有集成失败
- 黑盒：Electron/Web 构建 PASS；s038 本地 HTTP spike PASS；`pnpm test` 被无 TTY 依赖状态检查阻塞
- review：Round 1 code + test PASS，0 finding
- AC 证据：见 `handoff.json`

### 结果摘要

- t482 已完成；无遗留代码 finding。真实目标 New API 与模型回复需部署环境人工签收。
