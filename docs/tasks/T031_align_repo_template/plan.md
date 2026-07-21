# Task plan

## 步骤与验证

1. 复制脚本三件（task.py / render_review_prompts.py / check_review_status.py）→ 验证：`python scripts/task.py list` 输出 `(no tasks)`
2. 复制 review prompt 三件套 + task.md 模板；替换 spec/plan/review/spike 模板；删 adoption/log/task_report → 验证：`ls docs/templates/task` = {spec,plan,task,review}，`ls docs/templates/review` = 3 个 txt
3. 重写 AGENTS.md（8 步流程 + mermaid + blocked + `## 命名` + `## 文档修改规范` + 保留 omni 硬约束）→ 验证：`grep "## 命名\|## 文档修改规范" AGENTS.md` 命中
4. tasks_index.md → tasks_index.json（active t030）+ archive/tasks_index.json（t001-t029 done）→ 验证：`task.py list` 30 条
5. 29 个归档目录 `git mv` 改小写（两步法避 Windows 大小写冲突）→ 验证：`ls docs/archive/tasks/ | grep "^T[0-9]"` 空
6. 连带文档同步（specs_index / conventions / testing / handoff）→ 验证：`grep -rn "TNNN\|tasks_index\.md" AGENTS.md docs/templates docs/blueprint docs/guides docs/specs_index.md` 空
7. 本 task 自归档：tasks_index.md 删 T031 行 + json 加 t031 done + 目录改名 t031 → 验证：单 commit 自洽
8. `pnpm test` 回归 → 验证：不破坏现有测试

## 风险与回退

- 风险：Windows 大小写不敏感致 `git mv T001→t001` 无效 → 两步改名（先 `T001→tmp_t001` 再 `tmp_t001→t001`）
- 风险：29 目录改名 diff 大，review 难辨 → 全为 rename，内容不动，`git diff --stat` 可证
- 风险：AGENTS.md 重写遗漏 omni 硬约束（密钥/禁写路径/WSL Docker）→ 重写前抄录原硬约束段，重写后逐条核对
- 风险：本 task 自迁移时 tasks_index.md 与 json 短暂并存 → 单 commit 内原子切换，不留中间态
- 回退：分支 t031_align_repo_template 可整体丢弃，main/task_t016 基线无损

## Finalization 时更新的 blueprint

- `docs/blueprint/conventions.md`：task 工作流引用同步（TNNN→{tid}，小写）
- `docs/blueprint/decisions.md`：记录 tid 大小写断代决策（历史 commit 大写、新 task 小写）
- `AGENTS.md`：工作流章节（本身就是本 task 产物）
