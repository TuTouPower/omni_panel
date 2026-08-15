# Task spec

## 背景

DESIGN.md 合规审计（2026-08-16）发现颜色取值存在多份拷贝，违反「任何视觉值必须能追溯到 token」：

- nine-cycle 九色双源：token 已定义 `--color-usage-1..9`，`src/renderer/lib/usage-colors.ts:10-18` 另存一份 hex 数组并注入 DOM 进度条（同文件 RISK_TOKENS 走 `var(--color-*)`，模式不一致）；`src/renderer/views/settings-view/lib.ts:47` 还有第三份 swatch 副本。
- accent 预设 hex 第三份副本：`appearance_section.tsx:8` 的 `ACCENTS` 数组与 `:17` 兜底 hex（`lib/theme.ts:31-35` 的 ACCENT_PRESETS 是规范 380 授权的映射表，合规）。
- about 页 8 处 `tint: "#3d7afd"` 裸 hex + 内联 color-mix（`about_section.tsx:70-151`）。

双源意味着 token 改色后部分界面不跟随，是正确性隐患。

## 契约区

### 范围

- nine-cycle 九色收口：`usage-colors.ts` 删除本地 hex 数组，运行时从 `--color-usage-*` token 解析（或注入 DOM 的色值经统一 resolver）；`settings-view/lib.ts` swatch 从同一来源取值。
- accent 预设收口：`appearance_section.tsx` 的 ACCENTS 与兜底 hex 改为引用 `lib/theme.ts` 的 ACCENT_PRESETS。
- about 页 tint：8 处裸 hex 改为 token 引用或语义映射（新增 token 须走 DESIGN.md 导出流程）。

### 非范围

- 不改九色/accent 的色值本身；不改配色方案（risk-current/risk-projected/nine-cycle）的语义与设置项。
- 不动 ECharts 图表配色 resolver（已合规）。

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

- [ ] AC-001：九色 hex 在代码库中只剩 token 一份定义；`usage-colors.ts` 与设置 swatch 的渲染色随 token 修改而联动（可用临时改变量验证）。
- [ ] AC-002：accent 五档预设 hex 只存在于 `lib/theme.ts` 映射表；`appearance_section.tsx` 不再持有 hex 副本。
- [ ] AC-003：about 页不再含裸 hex tint；入口图标配色追溯到 token。
- [ ] AC-004：设置页配色预览、用量条九色渲染观感不回归（单测 + [deploy] 目检）。
- [ ] AC-005：现有测试套件不红。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- AC-001~003：单测 + grep 断言可自动测试（jsdom 中 token 解析用 getComputedStyle mock 或注入固定值）。
- AC-004 观感部分：`[deploy]` 人工目检。

## 上下文区

- 来源：DESIGN.md 合规审计（2026-08-16）；规范条款：DESIGN.md 367（token 追溯）、379-380（派生规则与历史值映射）、386（九色定义）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 单测：usage 九色解析函数断言取值来源为 token；grep 断言 hex 数组清零。
- 设置页预览：组件测试断言 swatch 渲染与 ACCENT_PRESETS 一致。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

无

### 风险与回退

- 风险：jsdom/SSR 场景下 token 解析不到值时需 fallback——fallback 取值逻辑单测覆盖，fallback 值本身也从 token 定义导入而非新写 hex。
- 回退：git 还原即可，无数据迁移。

### 依赖与约束

- 无前置依赖；与 t406/t415 同涉颜色 token 消费侧，可并行。

### Finalization 时更新的 blueprint

- 无
