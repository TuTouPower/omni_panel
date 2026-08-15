---
tid: "t401"
slug: "resume_command_template_core"
title: "续接命令模板：config 字段 + resume_command 支持 {session_id} 替换"
status: "done"
branch: "t401_resume_command_template_core"
worktree: ""
review_level: "full"
diff_anchor: "c31333a38d514bbdd12e381734d7f2d3480b77ba"
depends_on: ""
conflicts_with: ""
schedule_status: "scheduled"
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

- doctor_cmd：无
- preflight PASS；未知契约：无
- 红：新增 `session_resume.test.ts` + schema AC-005/006；确认 FAIL 后再实现
- 绿：`AppConfiguration.resumeCommandTemplates`、schema `z.record(z.string()).optional()`、`resume_command` 第三参 + `replaceAll`
- 空串回退默认；未知源有自定义模板仍生效（AC-004 措辞「无内置且无自定义」）
- 黑盒：相关单测 + 全量 `pnpm test` 3252 passed；`pnpm typecheck` 通过（worktree 需 `mkdir src/generated && npx tsx scripts/gen-build-info.ts`）
- 未改 conventions：占位符约定已落 spec `resume_command_template.md`，无需 ADR

## Review 处置

### Round 1 场景说明

Round 1 零 finding，未进处置表。

### Round 2 场景说明

Round 2 因收尾文档写入致 scope 指纹更新；零 finding，未进处置表。

## 收尾报告

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001~004 → `session_resume.test.ts`；AC-005~006 → `config-schema.test.ts`（详见 handoff `ac_evidence`）

### Reviewer verdict

`full`：

- Round 1 code：PASS
- Round 1 test：PASS
- Round 2 code：PASS
- Round 2 test：PASS

### 结果摘要

config 字段 + schema 不 strip + `resume_command` 模板替换；UI/调用点留给 t402/t403。
