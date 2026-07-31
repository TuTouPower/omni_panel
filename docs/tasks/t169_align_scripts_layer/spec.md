# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

本仓工作流（`scripts/task.py` 282 行 + 内嵌 AGENTS.md 8 步流程）是 `repo_template` 模板的旧一代分叉。模板已演化到 2216 行 task.py（front matter 状态权威 + worktree 链 + edit/preflight/next-batch/rewind/purge/cleanup-worktree）+ 9 个 skill + pending/findings 总账。本 task 是「对齐模板」6 task 计划的第一步：脚本层移植，为后续文档/skill/门禁对齐提供工具基础。

数据模型差异是核心阻断：模板 task.py 的 `scan_tasks` 要求每个 task 目录有带 YAML front matter 的 `task.md`，缺则 `raise TaskDataError`；本仓 165 个归档目录中 136 个无 task.md（用 `task_report.md`），全量替换 task.py 后 `list` 立即崩。需先做数据迁移。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 从模板全量复制 `scripts/task.py`、`scripts/_id_scan.py`、`scripts/pending.py`、`scripts/findings.py`、`scripts/render_review_prompts.py`、`scripts/check_review_status.py` 替换本仓同名文件。
- 移植 `tests/repo_template/` 全部 pytest 文件到本仓 `tests/repo_template/`。
- 写一次性迁移脚本（放 `.scratch/`），从 `docs/archive/tasks_index.json` + 目录名推导，为每个归档/活跃 task 目录生成或补全符合模板 front matter schema 的 `task.md`。
- 保留本仓 `scripts/` 其他脚本不动（`ensure_sqlite_abi.mjs`、`export-schemas.ts` 等）。
- 删除被新 pytest 套件取代的旧测试（`scripts/test_task.py`、`tests/unit/scripts/task_py.test.ts`）。

### 非范围

- AGENTS.md / skills / hooks 迁移（Task C/D）。
- pending.md / findings.md 内容迁移（Task B）；本 task 只移植脚本本身，不填业务条目。
- testing.md 门禁类别定义（Task E）。
- plan.md 模板废弃、模板目录重排（Task B）。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。

- [ ] `python scripts/task.py list` 在主分支干净工作区跑通，列出全部 task，不报 TaskDataError。
- [ ] `python scripts/task.py show t169` 正确读出 t169 front matter。
- [ ] `tests/repo_template/` 下 pytest 文件全部通过。
- [ ] `pnpm test` 仍通过（移植未破坏现有测试）。
- [ ] 每个归档 task 目录都有 `task.md`，front matter 含完整 schema 字段。

### 可测试性声明

全部 AC 可自动测试。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

- `list --rebuild` 在本 task 分支无法直接验证（脚本拒绝非主干执行）：由 `tests/repo_template/test_task_start_flow.py` 覆盖 rebuild 主干校验。

### 测试策略

- 脚本逻辑正确性由 `tests/repo_template/` pytest 套件（模板自带，197 用例）覆盖。
- 业务回归由 `pnpm test`（vitest，1910 用例）覆盖。
- 数据迁移正确性由 `task.py list`/`show` 实际跑通验证。

### 未知契约清单

无。

### 风险与回退

- 风险：Windows 路径/编码差异导致模板脚本不可用。
- 回退：保留迁移脚本 `.scratch/migrate_task_md.py`，可重跑；旧 task.py 在 git 历史。

### 依赖与约束

- 前置：无（本 task 是计划第一步）。
- 平台：Windows，pnpm 项目；模板是 Python 项目，worktree 模型需后续 task 验证 pnpm 适配。
- 约束：不得修改 `docs/specs/`、`src/`、`connectors/` 等业务内容。

### Finalization 时更新的 blueprint

- `docs/blueprint/conventions.md`：pNNN/dNNN 命名节（Task F）。
- `docs/blueprint/testing.md`：worktree pnpm 适配（Task E）。
