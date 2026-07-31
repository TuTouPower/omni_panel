# Task review t169（reviewer_focus: 代码）

- task：`t169_align_scripts_layer`
- spec：`docs/tasks/t169_align_scripts_layer/spec.md`
- diff_anchor：`71b61b22325740fb36a70caa96bf78f96107845c`
- target：`git diff 71b61b22325740fb36a70caa96bf78f96107845c`
- round：1
- reviewed_at：2026-07-31 11:45 UTC+8

## Findings

零 finding。

## AC 验证结果

逐条核对 spec 契约区验收标准，全部通过：

1. **`python scripts/task.py list` 在主分支干净工作区跑通，列出全部 task，不报 TaskDataError** — PASS。当前分支 `t169_align_scripts_layer`，`task.py list` 成功列出 170 个 task，无 TaskDataError。
2. **`python scripts/task.py show t169` 正确读出 t169 front matter** — PASS。完整输出 12 字段 front matter（tid/slug/title/status/branch/worktree/review_level/diff_anchor/depends_on/conflicts_with/schedule_status/note）+ dir + task_md。
3. **`tests/repo_template/` 下 pytest 文件全部通过** — PASS。9 文件 197 用例全通过（`python -m pytest tests/repo_template/ -q`，197 passed in 203s）。
4. **`pnpm test` 仍通过（移植未破坏现有测试）** — PASS。184 test files，1910 tests passed。
5. **每个归档 task 目录都有 `task.md`，front matter 含完整 schema 字段** — PASS。168 个归档目录 + 活跃目录全部含 task.md（脚本扫描验证 0 missing）；抽查 t001/t047/t082/t083 front matter 均含完整 12 字段。

## 移植保真度核查

### 脚本移植（6 文件全量替换）

| 文件                               | 行数 | 移植方式                                                                    |
| ---------------------------------- | ---- | --------------------------------------------------------------------------- |
| `scripts/task.py`                  | 2216 | 全量替换（旧 282 行 flat-JSON 模型 → 新 2216 行 task.md front matter 模型） |
| `scripts/_id_scan.py`              | 220  | 新增（pending/findings 共用编号扫描）                                       |
| `scripts/pending.py`               | 387  | 全量替换                                                                    |
| `scripts/findings.py`              | 50   | 全量替换                                                                    |
| `scripts/render_review_prompts.py` | 306  | 全量替换（模板路径 `docs/templates/review/` → `docs/reviews/prompts/`）     |
| `scripts/check_review_status.py`   | 309  | 全量替换                                                                    |

### 有意分叉（Windows 适配，非逻辑改动）

task.md 过程记录声明的 3 处 Windows 适配已逐条核实，均一致且正确：

1. **`task.py:155` `_git()` encoding 适配**：`encoding="utf-8", errors="replace"` 加到 subprocess.run。Windows 默认 GBK 解码含中文 git 输出会炸（stdout 变 None）。
2. **`task.py:253` `worktree_paths()` 路径键统一**：`str(Path(p).resolve())` 统一路径键。`git worktree list --porcelain` 在 Windows 输出正斜杠（`D:/Dev/...`），`str(Path.resolve())` 是反斜杠（`D:\Dev\...`），字符串 `in` 比较恒 False；所有调用处 path 变量已 `.resolve()`，键 resolve 后一致。
3. **`_id_scan.py` encoding 适配**：`_run_git()`（line 79-84）和 `_read_blob_optional()` 同样不加 encoding（后者用 bytes + manual decode）。`render_review_prompts.py` 的 `git show` 子进程也加了 `encoding="utf-8", errors="replace"`。

测试文件 `test_task_start_flow.py:21` 和 `test_render_review_prompts.py:278` 的 helper 函数同样加了 `encoding="utf-8", errors="replace"`，与脚本侧适配一致。

### 数据迁移核查

迁移脚本 `.scratch/migrate_task_md.py` 从 `docs/archive/tasks_index.json` + `docs/tasks_index.json` 推导，为每个 task 目录生成/补全 12 字段 front matter：

- 168 个归档 task + 活跃 task 全部有 task.md（`ls` 验证 0 missing）。
- 3 个孤儿（t047/t082/t083，目录已删）按 JSON 重建目录 + task.md，正文含「历史目录已删除」说明。
- 已有正文的 task.md 保留正文；无正文的指向 `task_report.md` 或生成最小正文。
- `docs/archive/tasks_index.json` 有 168 条 task 记录，与 168 个归档目录一致。

### 旧测试删除核查

- `scripts/test_task.py`（48 行）：测试旧 `task.py` 的 `save()` 函数 JSON 格式契约（4 空格缩进 + LF）。新 task.py 无 `save()` 函数，改用 `rebuild_index()`，删除正确。
- `tests/unit/scripts/task_py.test.ts`（85 行）：测试旧 task.py flat-JSON 数据模型，用 `OMNI_TASK_ACTIVE_PATH` 环境变量重定向。新 task.py 用 `REPO_ROOT` 相对路径，无此环境变量，删除正确。`pnpm test` 确认无残留引用。

### `_pre` 历史目录移动核查

- `docs/archive/tasks/_pre/` → `docs/archive/_pre_tasks/`（含 T1–T8 plan/spec + README）。
- `docs/archive/tasks/README.md` → `docs/archive/tasks_README_legacy.md`。
- `docs/archive/tasks/_pre/` 已不存在。
- 模板 `scan_tasks` 只认 `t[0-9]*_*` 目录，非 task 目录移出后不再干扰扫描。

## 未进表的提示

- **文件过大**：`tests/repo_template/test_task_start_flow.py` 1311 行，超过测试源码 important 阈值（1200）。但该文件是模板 verbatim 移植（本 task 新建即超阈值），非本 task 继续堆大；模板 pytest 套件为一体文件，无不可拆硬约束外的本 task 膨胀行为。按降级规则不进 finding 表。
- **风格观察**：`task.py:2206-2207` 在 `main()` 的 parser 设置与 `args = p.parse_args()` 之间有额外空行。纯风格，无功能影响。

## 结论

- 前轮 finding 复核：N/A（Round 1）。
- 本轮新发现：0 条。
- 系统性 follow-up：无。

所有 5 条 AC 全部通过验证。6 个脚本全量移植保真，3 处 Windows 适配一致且为必要分叉。数据迁移完整（168 归档 + 活跃），旧测试删除正确，无残留引用。代码质量无明显问题：无 swallowed errors、无资源泄漏、无逻辑 bug。

verdict: PASS
