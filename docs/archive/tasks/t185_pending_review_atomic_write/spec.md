# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

来源：p018。

t179 把 `scripts/task.py` 的权威/派生文件写入改为 `_atomic_write_text`（tmp + flush + fsync + os.replace，失败清理 tmp），但同根因的 `scripts/pending.py`（写 `docs/pending.md` / `docs/archive/pending.md`）与 `scripts/render_review_prompts.py`（写 review prompt 文件）仍直接 `write_text`。中断会产生半写状态（权威文件损坏、review prompt 残缺）。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- `scripts/pending.py` 的 pending/archive 写入改用 `task.py` 的 `_atomic_write_text`（或等价内联实现）。
- `scripts/render_review_prompts.py` 的 prompt 文件写入同样原子化。
- 中断（write/flush/fsync/replace 任一步失败）不留半写目标文件，且清理 tmp。

### 非范围

- 不改 `task.py` 的 `_atomic_write_text` 本身（已验证，t179）。
- 不改其他脚本（gen-build-info、task-save 等已走 `_atomic_write_text` 或不在权威路径）。
- 不引入新依赖。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：`pending.py` 写 `docs/pending.md` / `docs/archive/pending.md` 时，若 fsync（或等价步骤）抛错，目标文件保持原内容不变，无 tmp 残留。
- [ ] AC2：`render_review_prompts.py` 写 prompt 文件时，若 replace 失败，目标文件保持原内容，无 tmp 残留。
- [ ] AC3：原子写实现复用 `task.py` 的 `_atomic_write_text`（共享一份实现，不重复实现 tmp+fsync+replace 逻辑）。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- AC1/AC2：用 monkeypatch 在 fsync/replace 注入异常断言目标不变 + tmp 清理（参考 t179 的 `test_atomic_write_*`）。
- AC3：可自动测试（导入 `_atomic_write_text` 或 grep 复用点）。

全部 AC 可自动测试。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

无。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 参考 t179 的 `tests/repo_template/test_task_save.py` 的 `test_atomic_write_*` 模式：monkeypatch `os.replace` / `fsync` 抛错，断言目标文件内容不变 + 无 tmp 残留。
- pending.py / render_review_prompts.py 的原子写测试放 `tests/repo_template/`（脚本层测试）。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

无。

### 风险与回退

- 风险：`_atomic_write_text` 跨脚本复用的 import 路径（task.py 是脚本非模块）；若不能直接 import，需把实现抽到共享模块或在两脚本内联等价实现。
- 回退：恢复 `write_text`（权威文件半写风险回到 t179 前状态，无数据迁移）。

### 依赖与约束

- 依赖 t179 的 `_atomic_write_text` 实现与测试模式。
- 不与 task-run 队列冲突（纯脚本层，不碰 src/tests 业务代码）。

### Finalization 时更新的 blueprint

- `docs/blueprint/conventions.md`：「原子写」section 已覆盖 task.py；补 pending.py / render_review_prompts.py 复用说明（若实现抽到共享模块，更新该 section 引用）。
