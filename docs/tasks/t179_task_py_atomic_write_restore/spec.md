# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

t063（8eaf1892）曾为权威 task JSON 实现 tmp+fsync+os.replace 原子写（防掉电损坏）；t169 模板化重写后 scripts/task.py 全仓 os.replace 命中为 0，write_front_matter（task.py:386-387）直接 write_text 写权威 front matter，rebuild_indexes（task.py:835 区域）直接写派生索引 JSON，原子性丢失。task.md front matter 是状态权威（CLAUDE.md 明文「只经 task.py 修改」），中断写损坏影响比旧 JSON 更重。tests/repo_template/ pytest 基建已就绪（197 用例；test_task_save.py 测了内容正确性未测原子性）。附带：scripts/pending.py:328-329 与 scripts/render_review_prompts.py:297 也同样直接 write_text。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- write_front_matter 与 rebuild_indexes 恢复 tmp+fsync+os.replace 原子写。
- 在 tests/repo_template/ 补失败路径/中断恢复测试。

### 非范围

- 不改 front matter schema 或 index 内容。
- 不改 pending.py/render_review_prompts.py 的 write_text（可另立 task）。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：write_front_matter 写 task.md front matter 经 tmp 文件 + fsync + os.replace，中断（如写盘失败）不产生半写状态。
- [ ] AC2：rebuild_indexes 写派生索引 JSON 经同样原子写。
- [ ] AC3：tests/repo_template/ 补原子写失败路径/中断恢复测试，覆盖 tmp 残留清理与 os.replace 失败路径；既有 197 用例通过。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

全部 AC 可自动测试。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

无。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 按项目默认（pytest，tests/repo_template/）。mock 文件系统失败注入，断言中断后目标文件不损坏、tmp 不残留。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

无。

### 风险与回退

- 风险：原子写引入 tmp 文件清理逻辑漏洞。
- 回退：revert 实现 commit。

### 依赖与约束

- 无。

### Finalization 时更新的 blueprint

- `docs/blueprint/testing.md`：如涉及测试基建说明。
- `docs/blueprint/conventions.md`：如原子写约定需记录。
