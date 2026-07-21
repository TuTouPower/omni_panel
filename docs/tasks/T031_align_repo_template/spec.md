# Task spec

## 背景

omni_usage 沿用 omni_powers 的 `tasks_index.md` + `log/adoption/task_report.md` 手工工作流。WSL 的 `repo_template` 已定型更规范的工作流（`tasks_index.json` + `scripts/task.py` 唯一入口、`task.md` 过程总账、脚本化 review prompt、`check_review_status.py` 状态判定）。需全切对齐，tid 字面改小写 `t001`。

## 范围

- 复制 repo_template 三个脚本（task.py / render_review_prompts.py / check_review_status.py）到 `scripts/`
- 复制 review prompt 三件套（code/test/share）到 `docs/templates/review/`
- 新增 `docs/templates/task/task.md`；替换 `docs/templates/task/{spec,plan,review}.md`、`docs/templates/spike/report.md` 为 repo 版
- 删除 `docs/templates/task/{adoption,log,task_report}.md`
- 重写 AGENTS.md 工作流章节（8 步流程 + mermaid + blocked + `## 命名` + `## 文档修改规范`），保留 omni 硬约束
- `docs/tasks_index.md` → `docs/tasks_index.json`（active: t030）+ `docs/archive/tasks_index.json`（t001-t029 done）
- 29 个归档目录 `git mv` 改小写名（T001→t001 ... T029→t029），内部文件不动
- 连带文档同步：specs_index / conventions / testing / handoff 中大写 tid 引用

## 非范围

- 不改 src/ tests/ 逻辑代码
- 不重构归档目录内部文件结构（log/adoption/task_report 保留作历史快照）
- 不改历史 commit subject（大写 T 断代保留）
- 8 个扁平 `T1-T8_*.md` legacy 文件原样保留

## 验收标准

- [ ] `python scripts/task.py list` 输出 30 条（t001-t029 + t031 done，t030 backlog）
- [ ] `python scripts/task.py add/start/finish` 冒烟通过
- [ ] `render_review_prompts.py` / `check_review_status.py` 可执行
- [ ] AGENTS.md 含 `## 命名` `## 文档修改规范`，工作流 8 步 + mermaid
- [ ] `docs/templates/task/` 文件集 = {spec, plan, task, review}，无 adoption/log/task_report
- [ ] `docs/tasks_index.md` 已删，json 就位
- [ ] `ls docs/archive/tasks/ | grep "^T[0-9]"` 为空
- [ ] `grep -rn "tasks_index\.md\|TNNN" AGENTS.md docs/templates docs/blueprint docs/guides docs/specs_index.md` 无遗留
- [ ] `pnpm test` 不受影响

## 依赖与约束

- 单 task 单 commit（用户指定）
- Windows 大小写不敏感文件系统：目录改名可能需两步
- 本 task 自身迁移：tasks_index.md 删 T031 行同时 json 加 t031 done，单 commit 自洽
