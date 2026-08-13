# Task spec

## 背景

`Icon` 组件的 `UI_ICONS` 注册表无 `alert_circle` 键，而 WebLoginSection/DeviceLoginSection/SessionSection 三处以 `<Icon name="alert_circle">` 渲染登录错误提示，未知 name 分支返回空 SVG 且无告警，错误提示旁是空白图标（自 t157 引入后从未注册）。`name` 为宽泛 string，tsc 拦不住。

## 契约区

### 范围

- 在 `UI_ICONS` 注册 `alert_circle`（lucide `CircleAlert`）。
- 把 `Icon` 的 name 收窄为 `keyof typeof UI_ICONS` 字面量联合，未知 name 在 dev 下 `console.warn` 或抛错。
- 加静态守卫测试：`<Icon name="…">` 引用集合 ⊆ UI_ICONS 键集合。

### 非范围

- 不改图标渲染机制本身。

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

- [ ] AC-001：`alert_circle` 注册后，登录错误提示旁渲染出图标（非空白 SVG）。
- [ ] AC-002：`Icon` name 收窄为字面量联合，未注册名被 tsc 拦截或 dev 告警。
- [ ] AC-003：存在守卫测试，消费方引用的所有 name 均在 `UI_ICONS` 注册表中。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：组件测试断言 icon 渲染；守卫测试扫描引用集合。

## 上下文区

- 来源：review_20260813_114911/review_intensive.md（`Icon.tsx:174`、`:71`、`WebLoginSection.tsx:107`、`DeviceLoginSection.tsx:214`、`SessionSection.tsx:53`）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 组件测试：渲染 `<Icon name="alert_circle">` 断言 SVG 非空。
- 守卫测试：静态扫描渲染层 `<Icon name="…">` 引用，断言 ⊆ 注册表键集。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：name 收窄为联合类型触发大量既有调用点 tsc 报错。
- 回退：先注册缺失键 + 加守卫测试，name 收窄作为可选收紧逐步推进。

### 依赖与约束

- 依赖：lucide-react 已含 `CircleAlert`/`AlertCircle`。

### Finalization 时更新的 blueprint

- 无
