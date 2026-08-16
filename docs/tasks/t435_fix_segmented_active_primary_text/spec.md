# Task spec

## 背景

用量面板「概览 / N账号」选中段不再是蓝色字。根因：`ui/Segmented` 选中态用 `on-surface` 字 + `surface-window` 底，偏离 DESIGN.md `segmented-item-active`（`primary` 字 + `surface-card` 底）。t421 把手拼（`color-accent` 字）换成该组件后回归；单测/e2e 随之断言 `on-surface`，假绿锁定错误配方。

## 契约区

### 范围

- 修正 `src/renderer/components/ui/Segmented.tsx` 选中态，对齐 DESIGN `segmented-item-active`：
    - 字色：`{colors.primary}`（实现 token：`--color-primary`）
    - 底色：`{colors.surface-card}`（实现 token：`--color-surface-card`）
- 更新错误断言：`provider_card_overview`、Segmented/ui 单测、trend_window 等 e2e 中「选中 = on-surface」改为 primary（及底色 surface-card）。
- 同步 `docs/specs/ui-component-library.md` 中 Segmented 选中配方描述（若仍写 on-surface）。

### 非范围

- 不改 Segmented 切换行为、受控 value/onChange、option 透传 API。
- 不改 ProviderCard / 其它消费方业务逻辑；不单独给用量面板开分支色。
- 不改 Badge accent、折叠态「N账号」徽章（已合规）。
- 不改 DESIGN.md 数值（本 task 消费 DESIGN，不改 token 定义）。
- 不强制改 `size="sm"` 字号档（DESIGN 默认 `label-md`；sm 体量差异属既有 size API，非本 bug 字色范围）。

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

- [ ] AC-001：`ui/Segmented` 选中项 class（或等价样式）含 `text-[var(--color-primary)]`（或项目内与 DESIGN primary 等价、已导出的唯一字色 token），**不含** 选中态 `text-[var(--color-on-surface)]`。
- [ ] AC-002：`ui/Segmented` 选中项底为 `bg-[var(--color-surface-card)]`（或 DESIGN surface-card 等价 token），与 `segmented-item-active.backgroundColor` 一致。
- [ ] AC-003：ProviderCard「概览 / N账号」在 `l2Open=false` 时「概览」选中、`l2Open=true` 时「N账号」选中，均满足 AC-001/002 的字色与底色；互斥（未选中无选中底）行为不回归。
- [ ] AC-004：既有「选中 = on-surface」的单测/e2e 已改为断言 primary（及 surface-card 底）；相关套件通过，无再锁定错误字色。
- [ ] AC-005：[deploy] 明暗主题下目检：用量面板概览分段、趋势窗口分段、设置外观 Segmented 选中字为 primary 蓝（随 accent 预设联动），非中性 on-surface。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- AC-001~004：组件/卡片单测与既有 e2e 可自动测。
- AC-005：人工目检（明暗 + accent 联动）。

## 上下文区

- 来源：p201（2026-08-16；DESIGN `segmented-item-active` vs `Segmented.tsx` 对照；t421 将 ProviderCard accent 手拼收敛到错误配方）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 每个 Segmented 调用点逐一截图：组件层改一处全局生效；AC-003 锁用量主路径即可。
- accent 五档预设逐档 e2e：primary 绑定 `--color-primary`/`--accent` 派生链，改 token 即联动；AC-005 人工抽查。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 单测：`tests/unit/renderer/components/ui/ui.test.tsx`（Segmented 选中 class）；`provider_card_overview.test.tsx`（互斥 + primary 字/surface-card 底）。
- e2e：`tests/e2e/web/trend_window_button_contrast.spec.ts` 等凡断言 Segmented 选中 `on-surface` 的改为 primary（对比度门槛不得降低到失败）。
- 禁止把「收敛到 ui/Segmented」当作偏离 DESIGN 字色的合法理由。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无（DESIGN 与实现 token 映射已核实：`--color-primary` ↔ primary；浅色 surface-card/window 同 #fff，暗色不同，底色改 surface-card 有可观察差）。

### 风险与回退

- 风险：依赖「选中 = 中性字」对比度的 e2e 阈值可能需微调；primary 蓝在 surface-card 上对比通常更强，预期可通过。
- 回退：还原 `Segmented.tsx` 与相关测试/文档描述。

### 依赖与约束

- DESIGN.md 为真相源；UI task 只消费、不改 DESIGN 数值。
- 全量 Segmented 消费点同修（组件单点），不按页面拆 task。
- review_level=single：纯 token 对齐 + 测更新，无鉴权/数据迁移。

### Finalization 时更新的 blueprint

- `docs/specs/ui-component-library.md`：Segmented 选中配方改为 surface-card + primary（删 on-surface 描述）。
- 无 architecture/domain 变更。
