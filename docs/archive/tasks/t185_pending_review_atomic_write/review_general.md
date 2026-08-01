# Task review t185（reviewer_focus: 通用）

- task：`t185_pending_review_atomic_write`
- spec：`docs/tasks/t185_pending_review_atomic_write/spec.md`
- diff_anchor：`211dcb9dad9f49a14e65a4fa716bc0af687df282`
- target：`git diff 211dcb9dad9f49a14e65a4fa716bc0af687df282`
- round：1
- reviewed_at：2026-08-02 05:06 UTC+8

## Findings

### t185_gen_f001 - 测试 docstring 含 task/pending 编号元引用

- 严重度：minor
- 锚点：风格偏好（CLAUDE.md「文档规范」元引用禁令适用于正文文档；测试文件 docstring 是可追溯代码标识，非正文文档元引用）
- 位置：`tests/repo_template/test_pending_render_atomic.py:1`
- 问题：模块 docstring 写 `（t185, p018）`。CLAUDE.md 元引用禁令约束对象是 `docs/` 下正文文档，测试文件 docstring 不在其列；且项目命名规范要求测试文件名 / spec 上下文区携带 tid 作为追溯锚点，docstring 内 tid 同性质。仅作风格提示，不计 FAIL。
- 建议：如团队偏好统一，可保留 tid 删除 pNNN（pNNN 已在 spec「背景」记录），或保留不动。

## 结论

- 前轮 finding 复核：N/A（Round 1）
- 本轮新发现：1 条（minor）
- 未进表的提示：
    - AC1 措辞「fsync（或等价步骤）抛错」覆盖面广，测试用 `os.replace` 注入失败属「等价步骤」，已满足 AC1 可观察行为；未单独测 fsync 失败路径，但 `_atomic_write_text` 实现的 fsync 失败处理已在 t179 `test_atomic_write_fsync_failure_keeps_target_and_cleans_tmp` 验证，t185 不重复测实现内部。
    - AC1/AC2「目标保持原内容 + tmp 清理」断言到位（`test_pending_render_atomic.py:51-53`、`:68-69`）。
    - AC3 复用证据：`scripts/pending.py:23`、`scripts/render_review_prompts.py:26` 均 `from task import _atomic_write_text`；`grep` 全仓 `os.replace|fsync|.tmp` 仅命中 `task.py` 实现体与 `render_review_prompts.py:265` 注释，无重复实现。
    - `_write_prompts` 抽取行为等价：原 `path.write_text + print(stderr)` → `_atomic_write_text + print(stderr)`；`out_dir.mkdir(parents=True, exist_ok=True)` 仍在 `main()` 调用前执行（`render_review_prompts.py:304-305`）；stderr 「wrote {path}」打印保留。
    - monkeypatch `task.os.replace` 真覆盖两脚本调用路径：`_atomic_write_text` 是 `task` 模块内函数，函数体引用 `task.os.replace`；`pending`/`render_review_prompts` 仅持有函数引用，未拷贝实现，patch 同一模块属性生效。两测试均 PASSED。
    - 测试 `args = Namespace(ids=["p001"], fix_ref="t999", write=True)` 能完整走完 `parse_pending` / `parse_archive` / `set_handle` / 节定位 / 写盘分支，fixture 与 `## 已处理待办` 节标题齐全。
    - 无新依赖引入；4 空格缩进；snake_case 命名一致。
    - spec 上下文区「Finalization 时更新的 blueprint」要求更新 `docs/blueprint/conventions.md`「原子写」section，属 finish 阶段动作，不属当前实施 commit 范围。
- 总体判断：AC1-AC3 全部被实现覆盖且测试可信；唯一 finding 为 minor 风格项，PASS。
- 系统性 follow-up：无

verdict: PASS

## Round 2 (2026-08-02 23:55 UTC+8)

### 前轮 finding 复核

- **t185_gen_f001 (minor)**：已修确认。`tests/repo_template/test_pending_render_atomic.py:1-3` docstring 改为「pending.py / render_review_prompts.py 原子写。」+ 描述性第二行「两脚本写权威/派生文件改用 task.py 的 \_atomic_write_text，中断不留半写目标、清理 tmp。」，`（t185, p018）` 元引用已移除，无新 tid/pNNN 编号代入。仅 docstring 改动，断言与逻辑零改动（diff 仅 +1 文件、+69 行测试，相对 diff_anchor 211dcb9d）。

### 本轮新发现

无。docstring 改动未触及断言、fixture、monkeypatch 路径；`git diff 211dcb9d --stat` 仅 4 文件（task.md / pending.py / render_review_prompts.py / 新测试），无范围外蔓延。

### 结论

- 前轮 finding：1 条 minor，已消除。
- 本轮新发现：0 条。
- 总体判断：f001 修复到位，无新增问题。
- 系统性 follow-up：无

verdict: PASS
