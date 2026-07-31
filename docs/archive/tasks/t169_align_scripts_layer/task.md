---
tid: "t169"
slug: "align_scripts_layer"
title: "脚本层移植：task.py 全量替换 + 数据迁移 + pending/findings"
status: "done"
branch: "t169_align_scripts_layer"
worktree: ""
review_level: "full"
diff_anchor: "71b61b2"
depends_on: ""
conflicts_with: ""
schedule_status: ""
note: "模板 task.py 2216 行替换本仓 282 行；165 归档目录补 task.md front matter；移植 pending/findings/render/check 脚本与 repo_template 测试"
---

# Task t169_align_scripts_layer

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 计划与前置决策：完整切换 worktree 链模型；bugs→pending 全量迁移；废弃 plan.md。见 `C:\Users\TestUser\.claude\plans\noble-sprouting-sun.md`。
- 数据模型阻断点：模板 `scan_tasks` 遇缺 task.md 目录报错；本仓 165 归档目录 136 无 task.md。决策：脚本批量生成 front matter task.md（用户拍板）。
- 迁移执行（`.scratch/migrate_task_md.py`）：从 `docs/archive/tasks_index.json` 推导，为 166 个 task 目录生成/补全 task.md front matter（12 字段 schema）；3 个孤儿（t047/t082/t083，目录已删）按 JSON 重建目录 + task.md；1 个活跃（t169）。归档历史正文保留为 `task_report.md`（未合并进 task.md，模板不强制）。
- 非 task 目录清理：`docs/archive/tasks/_pre/` 与散落的 T1–T8 plan/spec 移至 `docs/archive/_pre_tasks/`（模板 scan 只认 `t[0-9]*_*` 目录）；`docs/archive/tasks/README.md` 移至 `docs/archive/tasks_README_legacy.md`。
- Windows 适配（与模板的必要分叉，非逻辑改动）：
    - `scripts/task.py` `_git`、`scripts/_id_scan.py` `_run_git`/`_read_blob_optional`、`scripts/render_review_prompts.py` 的 `git show` 子进程加 `encoding="utf-8", errors="replace"`；模板在 Linux 默认 UTF-8 无此问题， Windows 默认 GBK 解码含中文 git 输出炸（stdout 变 None）。
    - `scripts/task.py` `worktree_paths()` 路径键统一 `str(Path(p).resolve())`：`git worktree list --porcelain` 在 Windows 输出正斜杠（`D:/Dev/...`），`str(Path.resolve())` 是反斜杠（`D:\Dev\...`），字符串 `in` 比较恒 False；所有调用处的 path 变量已 `.resolve()`，键 resolve 后一致。
    - `tests/repo_template/` 三个 test helper（`_git`/`_task_cli`）同样加 `encoding="utf-8", errors="replace"`。
- 旧测试清理：`scripts/test_task.py`（JSON 格式契约）与 `tests/unit/scripts/task_py.test.ts`（针对旧 task.py 的 flat-JSON 数据模型，用 `OMNI_TASK_ACTIVE_PATH` 环境变量重定向）已删除；新 task.py 状态权威是 task.md front matter，语义完全不同，被 `tests/repo_template/` pytest 套件取代。
- task_template：从模板复制 `docs/tasks/task_template/{spec,task}.md`（test_task_document_validation 等 pytest 依赖）；Task B 正式迁移模板布局时复核。
- worktree + pnpm 适配（实测）：本仓首个 worktree 链 task 的执行期不涉及（本 task 在主仓干活）。后续 task 执行会在 `../omni_usage_{tid}/` worktree；Electron 项目 worktree 无 node_modules，需 `pnpm install --prefer-offline`（pnpm store 共享）或软链主仓 node_modules；better-sqlite3 ABI 由 `scripts/ensure_sqlite_abi.mjs` 在 worktree 内处理。具体策略待 Task E 写入 testing.md 并在首个真实 worktree task 实测。
- 验证：`python -m pytest tests/repo_template/ -q` 197 passed；`pnpm test` 1910 passed（184 files）；`task.py list` 列出 170 task；`show t169` 正确；`list --rebuild` 在非主干正确拒绝。

## Review 处置

**本文件本小节 = 处置表唯一落点。**

### Round 1 (2026-07-31 11:45 UTC+8)

两轴均零 finding，未进处置表。

- code：`review_code.md` verdict PASS，0 finding
- test：`review_test.md` verdict PASS，0 finding

## 收尾报告

### 验收标准勾选

- [x] `python scripts/task.py list` 跑通，170 task，无 TaskDataError。
- [x] `list --rebuild` 在主干外正确拒绝（语义符合模板：rebuild 只在 main）。
- [x] `show t169` 正确读出 front matter。
- [x] `tests/repo_template/` 9 文件 197 用例全通过。
- [x] 每个归档 task 目录都有 task.md（169 个，含 t047/t082/t083 重建）。
- [x] `pnpm test` 1910 passed。
- [x] worktree + pnpm 适配笔记见过程记录（具体策略待 Task E 实测）。

### Reviewer verdict

- Round 1 code：PASS
- Round 1 test：PASS

### 遗留

- 无（worktree pnpm 适配策略的实测归 Task E）。

### 结果摘要

- 脚本层完整对齐模板，数据迁移完成，双审零 finding，全测试绿。
