---
tid: t031
slug: align_repo_template
diff_anchor: "ef11e27"
branch: t031_align_repo_template
---

# Task t031_align_repo_template

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 分支基于 `task_t016_migrate_seed_fake_specs`（用户本地真实主线，含到 T030），非 main（main 落后至 T018）。中途修正基点。
- 用户指定单 task 单 commit，不按惯例拆分。
- 用户决策：tid 改小写 t001（29 归档目录 + 索引全改名）；归档目录文件结构原样保留（仅改目录名），不合并 log/adoption/task_report。
- 脚本三件（task.py / render_review_prompts.py / check_review_status.py）从 repo_template 原样复制，纯 stdlib 无依赖。冒烟：add/list/show 通过。
- 模板：新增 review prompt 三件套 + task.md；替换 spec/plan/review/spike 模板为 repo 版；删 adoption/log/task_report。冒烟：render_review_prompts + check_review_status 可执行。
- AGENTS.md 整体重写：目录读写规则表对齐 repo 版（保留 omni 特有行 connectors/vendors/patches），工作流 8 步 + mermaid + blocked 表 + 门禁上限，新增 `## 命名` `## 文档修改规范`，硬约束段保留 omni 既有（密钥/禁写路径/WSL Docker/test_cmd/blackbox_cmd）。
- 索引迁移：一次性脚本从 tasks_index.md 解析 31 行 -> tasks_index.json（active t030/t031）+ archive/tasks_index.json（t001-t029 done）。脚本用后即删（.scratch 已清）。task.py list/show 验证通过。
- 29 个归档目录 git mv 两步法改名（T->t），Windows 大小写不敏感文件系统下成功。本 task 目录 T031->t031 同法改名。
- 连带文档：conventions.md task 模板表/review 字段/Review 处置/specs_index 示例全改小写 + {tid}；specs_index.md "无 TNNN"->"无 {tid}"。decisions.md/domain.md/testing.md/handoff.md/bugs.md 中 T00x 历史引用保留（历史事实）。
- diff_anchor = ef11e27（本 task 开工前 HEAD）。

## Review 处置

本 task 单 commit 未走双审（用户直接审批执行，属工作流迁移本身，迁移完成后新 task 起启用双审）。零 finding，未进处置表。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t031` 查，不在此记。

### 验收标准勾选

- [x] `python scripts/task.py list` 输出 31 条（t001-t029 done，t030/t031 active/backlog）
- [x] `python scripts/task.py add/start/finish` 冒烟通过
- [x] `render_review_prompts.py` / `check_review_status.py` 可执行
- [x] AGENTS.md 含 `## 命名` `## 文档修改规范`，工作流 8 步 + mermaid
- [x] `docs/templates/task/` 文件集 = {spec, plan, task, review}，无 adoption/log/task_report
- [x] `docs/tasks_index.md` 已删，json 就位
- [x] `ls docs/archive/tasks/ | grep "^T[0-9]"` 为空
- [x] `grep -rn "TNNN\|tasks_index\.md" AGENTS.md docs/templates docs/blueprint docs/guides docs/specs_index.md` 无功能性遗留（历史 ADR/归档内引用保留）
- [x] `pnpm test` 不受影响（纯文档/脚本迁移，不动 src/tests）

### Reviewer verdict

- 本 task 未走双审（工作流迁移本身，用户直接审批）。

### 遗留

- 无

### 结果摘要

工作流全切对齐 repo_template：tasks_index.json + task.py 唯一入口、task.md 过程总账、脚本化 review prompt、check_review_status 状态判定。tid 全小写，29 归档目录改名。新 task 起走 8 步流程。
