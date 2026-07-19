# 决策记录（ADR）

只记录已经确认、影响后续工作的非显然决策。追加新条目，不重写历史；决策被替代时，新条目通过“替代”字段引用旧编号。

条目格式：

```markdown
## NNN 标题（YYYY-MM-DD）

- 背景：为什么需要决策
- 选项：考虑过什么
- 结论：选了什么，为什么
- 替代：旧决策编号；无则写“无”
```

## 001 从 omni_powers 迁移到 repo_template 工作流（2026-07-20）

- 背景：OmniUsage 原用 omni_powers 三区工作流（`op_blueprint`/`op_execution`/`op_record`）+ 全局 skill（`/opintake` 等），与用户维护的 `repo_template` 通用仓库模板不兼容。
- 选项：A) 保留 omni_powers；B) 全量迁移到 repo_template 纯文档工作流（`AGENTS.md` + `blueprint/tasks/specs/reviews/spikes/archive`）。
- 结论：选 B。废弃 omni_powers 三区（整体归档至 `docs/archive/omni_powers_sunset/`），引入 `AGENTS.md` + `blueprint/tasks/specs/reviews/spikes/archive` 结构。task ID 从 T001 起编。本次元重构本身不挂 TNNN，由本 ADR 追溯。
- 替代：无

路径映射（供 `git log -S` 与旧路径追溯）：

- `op_blueprint/architecture.md` `domain.md` → `docs/blueprint/`
- `op_blueprint/conventions.md` → `docs/blueprint/conventions.md`（合并 template 元约定 + 项目编码约定）
- `op_blueprint/specs/*.md` → `docs/specs/`
- `op_blueprint/spec_index.md`（功能目录，2 列）→ 内容并入 `docs/specs_index.md`（状态台账，5 列）；按域分类见 `docs/blueprint/architecture.md` §4 数据流
- `op_blueprint/prd.md` → 一句话定位 + 介绍拆入 `README.md` / `AGENTS.md`；明确不做拆入 `docs/blueprint/domain.md`；原件归档
- `op_blueprint/test.md` → `{test_cmd}` / `{blackbox_cmd}` 填入 `AGENTS.md` 硬约束；测试规范并入 `docs/blueprint/conventions.md` “编码与测试”小节；详细命令清单入 `docs/guides/testing.md`；原件归档
- `op_record/decisions.md`（空）→ `docs/blueprint/decisions.md`（本文件）
- `op_record/progress.md`（空）→ `docs/handoff.md`
- `op_execution/*` + `docs/tasks/T1-T8_*` → `docs/archive/`（T1-T8 入 `archive/tasks/`）
- `docs/research/` `docs/design/` → `docs/archive/research/` `docs/archive/design/`
- T1-T8 历史提交 SHA：`5efb68a`、`30d078b`（原编号 T1..T8；`git log --grep` 仍可用原编号）
