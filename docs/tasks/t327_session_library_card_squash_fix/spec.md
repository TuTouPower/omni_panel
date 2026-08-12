# Task spec

## 背景

会话库网格视图（`SessionList.tsx` grid）在加载超过一屏的会话后，卡片被压扁成 2px 高的灰色细条，标题/摘要/按钮全部不可见。实测根因：grid 容器 `grid items` 默认 `align-items: stretch`，当内容总高（scrollHeight）超过容器可视高（clientHeight）且容器本身被 flex 父链 `min-h-0` 限制时，stretch 把每行高度撑到异常、行内子项塌陷为 0 高；补 `align-items: start`（或用等价的 `content-start` 语义）后卡片恢复 157px 正常高度并可正常滚动。

## 契约区

### 范围

- `src/renderer/components/session-library/SessionList.tsx`：网格视图 grid 容器修复卡片高度坍塌，保证卡片尺寸固定、不随内容量缩放，容器超高可滚动。

### 非范围

- 不改卡片内部结构/文案/按钮（SessionCard）。
- 不改"加载更多"按钮行为（由 t328 处理）。
- 不改列表视图布局（列表是 flex 行，无此问题；t328 统一滚动）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。

<!-- /规范 -->

- [ ] AC-001：网格视图加载超过一屏的会话后，卡片高度保持内容自然高度（不为 0/2px 细条），标题、摘要、meta、目录、按钮可见。
- [ ] AC-002：网格视图内容超高时，网格容器出现垂直滚动条，滚动可见全部卡片（不被压扁）。
- [ ] AC-003：连续加载至 350+ 卡片，前 N 张卡片高度不变（固定），无随加载量缩小的现象。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- AC-001/002/003 需真实浏览器渲染验证（CSS grid 高度行为），以 web e2e（playwright 断言卡片 offsetHeight>0、scrollHeight>clientHeight）覆盖。

## 上下文区

- 来源：用户直接反馈 + `.scratch/` 实测复现（2026-08-12；根因 `align-items: stretch` 致卡片塌陷）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 卡片具体像素高度（157px）：随内容/字号变化，以「>0 且内容可见」替代。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 按项目默认；新增 web e2e 断言卡片 offsetHeight>0（复现脚本 `.scratch/repro_card_detail.mjs` 已定位根因，正式断言放 `tests/e2e`）。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：`align-items` 改动影响卡片对齐（网格卡片高度对齐）；低风险，局部 grid 容器。
- 回退：撤销对 `SessionList.tsx` grid 容器的样式改动。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- `docs/blueprint/DESIGN.md`：核对是否新增"网格卡片固定高度、容器超高滚动"约定。
