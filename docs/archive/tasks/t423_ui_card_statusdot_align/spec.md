# Task spec

## 背景

DESIGN.md 合规审计（2026-08-16）发现两个 ui 组件自身不符合 DESIGN 定义，导致业务侧手拼复制体蔓延：

- `ui/Card` 缺 `shadow-card`（Card.tsx 只有圆角+边框+底色），而 DESIGN.md「卡片」定义为 14px 圆角 + 发丝描边 + `shadow-card` + 16px 内边距——导致 5 处手拼卡片容器：`CollapsibleCard.tsx:38-40`、`SkeletonCard.tsx:6`、`TokenPanel.tsx:17`（同变体）、`VendorCard.tsx:32`、`CpaCard.tsx:89-90`（同字符串）。
- `ui/StatusDot` 与 DESIGN 定义（7px 圆点 + 同色 16% 光晕）不符且**零业务使用**，状态点手拼分裂 6 处 5 文件：`UpcomingResetRow.tsx:11-22`（7px+18% 光晕）、`UsageRows.tsx:193`（6px+16%）、`CpaConnectorSettings.tsx:346`（8px+16%）、`CpaCard.tsx:123` 与 `AccountRow.tsx:113`（7px 无光晕 inline color）。

## 契约区

### 范围

- `ui/Card` 对齐 DESIGN 卡片定义（补 `shadow-card` 等缺口），5 处手拼卡片容器改走 Card。
- `ui/StatusDot` 修正为 7px + 同色 16% 光晕规范形态，6 处手拼状态点改走 StatusDot；各处的尺寸/光晕差异按规范统一（形态收拢，差异点记入实施笔记）。
- Card 补 shadow 后所有既有 Card 使用点观感变化属合规对齐，逐处目检。

### 非范围

- 不改 Card/StatusDot 以外的组件；不改卡片的业务内容与布局。
- 不改 token 数值定义。

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

- [ ] AC-001：`ui/Card` 符合 DESIGN 卡片定义（含 `shadow-card` token 阴影），5 处手拼卡片容器全部改走 Card。
- [ ] AC-002：`ui/StatusDot` 为 7px 圆点 + 同色 16% 光晕，6 处手拼状态点全部改走 StatusDot，inline 色值清零。
- [ ] AC-003：[deploy] 人工目检：卡片投影在明暗主题下无突兀；状态点在用量面板/CPA/即将重置各处观感统一。
- [ ] AC-004：现有测试套件不红。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- AC-001/002/004：组件测试 + grep 可自动验证。
- AC-003 观感标 `[deploy]`。

## 上下文区

- 来源：DESIGN.md 合规审计（2026-08-16）；规范条款：DESIGN.md 435（卡片分层）、466（卡片 token）、478（状态点定义）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- Card/StatusDot 组件测试补 token 引用断言；替换点所在组件既有测试保持通过。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

无

### 风险与回退

- 风险：Card 补 shadow 影响全部既有使用点（设置页等卡片会新增投影）——这是 DESIGN 定义的合规对齐，AC-003 目检逐窗口确认。
- 回退：git 还原即可。

### 依赖与约束

- 与 t415（阴影 token 翻转）有依赖：Card 的 shadow-card 明暗解析若走 t415 的变量翻转，建议排在 t415 之后。

### Finalization 时更新的 blueprint

- 无
