# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

会话面板对齐 demo 的功能 task（外壳、槽位、面板交互、摘选、会话库）完成后，需要一次收尾：端到端覆盖关键路径、真实窗口黑盒验收、清理旧实现残留、同步文档与 spec 总账。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- web e2e 覆盖关键路径：页签切换与状态保留、槽位装入/超位提示、摘选与三格式复制、会话库筛选/预览/批量打开。
- electron 真实窗口黑盒验收：主题切换持久化、拖拽换位、滚动行为、快捷键、真实会话数据下的打开与实时更新（人工执行，结果记录）。
- 旧实现残留清理：旧 6 栏视图、旧复制路径、栏满弹窗等被取代代码与样式的删除确认。
- 文档同步：需求 spec 累积更新、specs_index、blueprint 相关条目、handoff。

### 非范围

- 不引入新功能；发现缺陷走 task-bug 另立修复 task。
- 不动用量/代理/设置面板。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] web e2e 通过：双页签切换后工作台槽位与已选状态保留；打开会话装入槽位；槽满 toast；摘选后三种格式复制内容正确；会话库搜索/筛选/排序/预览/并排打开闭环。
- [ ] 代码库中不存在被取代的旧实现残留：旧 6 栏布局组件、栏满弹窗、旧单一 Markdown 复制入口。
- [ ] `[deploy]` electron 真实窗口黑盒：主题切换重启后保持；rail 拖拽换位；回到底部与分页滚动；`1-8`/`[`/`]`/`Esc`/`Space`/`Ctrl+Shift+C` 快捷键；真实会话打开与实时推送。
- [ ] 文档同步完成：需求 spec 累积、`docs/specs_index.md`、blueprint 受影响条目、handoff 与本批 task 状态一致。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- AC 3：需真实 electron 窗口与真实会话数据，agent 无法自证，人工黑盒验收并记录结果。
- 其余 AC 可自动测试/自动检查。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 像素级视觉回归：无既有基建设施，靠 AC 3 人工目验。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- web e2e 沿用既有 mock local-api + fixture 基建（web smoke 项目）。
- electron 黑盒沿用真实环境人工验收方式，结果记录进 task.md 收尾报告。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 无

### 风险与回退

- 风险：前序 task 的 `[deploy]` 项在黑盒时集中暴露问题，超出本 task 修复范围。
- 回退：黑盒发现的缺陷逐条登记并走 task-bug 另立修复 task，不在本 task 内扩散修复。

### 依赖与约束

- 依赖本批前序全部 task 完成（见 task.md front matter 依赖链）。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：对齐后的会话窗口整体结构定稿条目。
- `docs/blueprint/testing.md`：会话窗口 e2e 覆盖范围条目（如有变化）。
