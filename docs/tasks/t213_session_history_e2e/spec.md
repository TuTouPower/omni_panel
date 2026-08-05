# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

需求定稿 `docs/tasks/t211_session_history_window/requirements.md`（决策 18）。前四个 task（t209~t212）分别交付提取器、后端服务、窗口 UI、明细表入口。本 task 做端到端收口：真实环境验收整条链路，并完成 blueprint 文档与 specs 累积。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 端到端黑盒验收：真实启动应用，走通「明细表打开 → 历史窗口分栏 → 实时刷新 → 多选复制 → 超 6 弹窗 → 源文件缺失空态」全链路。
- 覆盖四端真实会话（claude_code / opencode / kimi_code / grok）至少各打开一个验证提取与刷新。
- 验证只读约束：整个流程对会话源文件无任何改动（前后比对源文件 hash / mtime）。
- finalization：更新 blueprint（architecture / domain）、`docs/specs_index.md` 与对应 spec 累积、`docs/handoff.md`。
- 需求定稿文档的归档处置（迁入 specs 或 archive）。

### 非范围

- 新功能开发；发现的缺陷另开 task 修复（走 task-bug），不在本 task 内顺手改。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] [deploy] 明细表单击一个真实会话，历史窗口分栏显示其 user/assistant 对话，内容正确。
- [ ] [deploy] 多选多个会话批量打开，分栏平铺，6 栏上限与超 6 弹窗按决策 4 生效。
- [ ] [deploy] 会话进行中追加新消息，对应栏实时追加（watcher 或 5s 兜底）。
- [ ] [deploy] 跨栏选中消息一次复制，剪贴板得到符合决策 9 格式的 Markdown。
- [ ] [deploy] 源文件被删的会话显示空态文案，其他栏正常。
- [ ] [deploy] 四端各至少一个真实会话验证提取与刷新正确。
- [ ] [deploy] 全流程会话源文件 hash / mtime 不变（只读约束实证）。
- [ ] blueprint（architecture / domain）与 specs_index 完成累积更新，handoff 记录本批。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- 全部 AC 为真实环境人工 / 黑盒验证（`pnpm test` + 打包启动），标 `[deploy]`。`pnpm test` 自动化部分可自动跑。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 不重复 t209~t212 的单测 / 组件测试；只做端到端联通与文档。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- `pnpm test` 全量回归。
- 手动黑盒清单驱动验收（参照 `docs/blueprint/testing.md` blackbox_verify）。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 无。

### 风险与回退

- 风险：真实环境暴露 fixture 未覆盖的格式差异。
- 回退：缺陷另开 task，不在本 task 内修。

### 依赖与约束

- 依赖 t209 / t210 / t211 / t212 全部完成。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`、`docs/blueprint/domain.md`：确认 t209~t211 累积条目落齐。
- `docs/specs_index.md` + 会话历史 spec：累积本批需求。
- `docs/handoff.md`：本批交接。
