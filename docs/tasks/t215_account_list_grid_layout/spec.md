# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

用量面板切到单个厂商时，账号以 `ProviderAccountList`（`.provider-account-list`，`display:flex; flex-direction:column`）纵向单列排列。用户希望与总览（`.overview-grid`，`grid; repeat(auto-fill, minmax(420px,1fr)); align-items:stretch`）一致，账号卡片横排多列。

总览卡片（`ProviderCard`）与单厂商账号卡片（`ProviderAccountRow`）同基础（都用 `CollapsibleCard`，根元素 `.card`），总览 grid 已验证能正常 stretch CollapsibleCard 并支持拖拽排序，单厂商改 grid 同理可行。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- `.provider-account-list` CSS 从 `flex column` 改为与 `.overview-grid` 一致的网格：`display:grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap:12px; align-items:stretch`（同行等高，窗宽不够自动退单列）。

### 非范围

- 不改账号卡片内部结构（`ProviderAccountRow` / `CollapsibleCard`）。
- 不改总览 `.overview-grid`。
- 不改卡片折叠/展开逻辑、不改 sparkline、不改拖拽排序逻辑。
- 不改其他视图（PopupView 等复用 ProviderAccountList 的场景若受影响，见上下文区）。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] 切到单个多账号厂商（如 8 个 tavily 账号），账号卡片横排多列，窗宽足够时 ≥2 列。
- [ ] 窗宽收窄到不足 420px×2 时，网格自动降为单列，不出现横向滚动或卡片挤压。
- [ ] 同行卡片高度一致（`align-items:stretch`）；展开某账号 sparkline 撑高整行，同行其他卡片留白对齐。
- [ ] 卡片拖拽排序（draggingId/dragOver）在多列网格下仍可用。
- [ ] 总览视图布局不变（未误改 `.overview-grid`）。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- AC1/AC2/AC3：布局可由组件测试断言 computed style（grid-template-columns、align-items）与渲染的卡片节点结构；真实多列渲染依赖容器宽度，jsdom 无布局引擎，需 `[deploy]` 或视觉验证兜底。
- 其余 AC：全部可自动测试。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- jsdom 无布局引擎，不测真实多列折行（computed grid-template-columns 在 jsdom 下恒为声明值，不反映实际列数）；改由结构断言 + [deploy] 视觉验证兜底。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 组件测试断言 `.provider-account-list` 渲染为 grid 容器、其直接子节点为各账号 `.card`、computed style 的 display=grid / align-items=stretch。
- 多账号 fixture（≥3 账号）断言渲染节点数与账号数一致、顺序保持。
- [deploy] 视觉验证：真实应用切到多账号厂商看多列折行与窗宽收窄降级。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 无

### 风险与回退

- 风险：PopupView（小窗）也复用 ProviderAccountList，小窗宽度可能只够 1 列，多列网格在窄窗下降为单列（符合预期），但需确认窄窗下 gap/外观无回归。
- 风险：同行等高 stretch 在账号卡片内容差异大（如某账号多 period、某账号 1 period）时，少内容卡片留白较多；这是用户已选的 trade-off（同行等高）。
- 回退：`.provider-account-list` 改回 flex column，单行 CSS 还原。

### 依赖与约束

- 无新增外部依赖。
- 受影响：`src/renderer/styles/globals.css`（.provider-account-list）；可能需确认 PopupView 复用场景窄窗表现。

### Finalization 时更新的 blueprint

- `docs/specs/ui-views-web.md`：单厂商账号列表布局改述为多列网格（与总览一致），若该 spec 含布局描述。
