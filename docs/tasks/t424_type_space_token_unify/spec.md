# Task spec

## 背景

DESIGN.md 合规审计（2026-08-16）发现两类字面量漂移：

- 排版：九级字号之外自造值 30+ 处（28/16/15.5/14/13/12/11/9px，集中于 popup 面板、provider/cpa 卡片系、MarkdownMessage）；字重五档（450/550/600/650/700）之外 `font-medium`(500) 18 处、`font-normal`(400) 2 处；canvas/SVG 图表（Heatmap/MetricDonut/BarChart/TrendSparkline）字号为散落数字。
- 布局：`p-*`/`gap-*`/`m-*` 非 4px 倍数值数十处（0.5 步进 2px、`gap-1.5`=6px、`2.5`=10px、3/5/7/11/13/15/22px 等，集中于表单区、CpaConnectorSettings、ProviderNav、session 体系）；圆角六档（6/8/10/14/18/999）之外 `rounded-[9px]`/`[7px]`/`[4px]` 约 6 处。

DESIGN.md 规定「新界面不得在这九级之外自造字号」「字重轴用五档」「布局层的 p-*/gap-*/m-\* 直接用整数倍」「圆角尺度收敛为六档」「任何散落的字号字面量都视为缺陷」。

## 契约区

### 范围

- tsx/css 中九级之外的自造字号全部归位到就近 `--text-*` token（如 28→display-num 30、15.5→title-sm 15、13/12/11→body-sm/label-md/label-caps 等，逐点就近映射并在实施笔记记录映射表）。
- 字重归五档：`font-medium`→550（或按语义 600）、`font-normal`→450；Tailwind 默认未被 token 覆盖的字号档（如 `text-sm`=14px）一并归位。
- canvas/SVG 图表字号（Heatmap、MetricDonut、BarChart、TrendSparkline）经 token resolver 或共享常量取九级 token 值，无散落数字。
- 内联 `style={{ fontSize: "13px" }}`（`App.tsx:50`）等内联字号一并归位。
- 布局层间距归位：非 4px 倍数的 `p-*`/`gap-*`/`m-*`（含 arbitrary 值与 0.5 步进）归位到 4px 基网或语义 token（card-gap/card-padding/section-gap/panel-padding/row-height）。
- 圆角归档：7/9/4px 等 arbitrary 圆角归位到就近六档。
- 间距/圆角逐点映射记录在实施笔记；组件 token 定义值（按钮 9/18、输入框 9/12、列表行 10/12）与语义 token 值（12/14/16/24）属豁免，不算违规。

### 非范围

- 不改九级字号的数值定义与字体资产。
- 不改文案内容；仅收敛字级/字重。
- 图表配色不在本 task（已有 resolver 合规）；只收口字号。
- 不改间距/圆角 token 数值定义；不改组件结构。
- 内容卡片圆角已全部合规（lg/14px），不动。
- canvas 图表 borderRadius（Heatmap 3px）随本 task 就近归档或记录为例外。

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

- [ ] AC-001：src/renderer 与 src/web 中不存在九级之外的字号（grep `text-[<N>px]` 与未映射 Tailwind 字号档清零）。
- [ ] AC-002：字重只使用 450/550/600/650/700 五档（`font-medium`/`font-normal` 等档外值清零）。
- [ ] AC-003：canvas/SVG 图表配置中的 `fontSize` 数字字面量清零，取值追溯到九级 token。
- [ ] AC-004：字号/字重逐点映射表写入 task 实施笔记（含每处旧值→新档）。
- [ ] AC-005：src/renderer 与 src/web 布局层 `p-*`/`gap-*`/`m-*` 全部为 4px 倍数或语义/组件 token 值（grep 审计清零，豁免清单写入实施笔记）。
- [ ] AC-006：圆角只使用六档（`rounded-[<N>px]` arbitrary 值清零或登记为例外）。
- [ ] AC-007：间距/圆角逐点映射表写入实施笔记（旧值→新值）。
- [ ] AC-008：[deploy] 人工目检用量面板/设置/会话/统计四窗口排版无肉眼退化、布局无肉眼错位。
- [ ] AC-009：现有测试套件不红（含语义字号断言与受影响类名断言的更新）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- AC-001~003、AC-005/006：grep/构建产物断言可自动测试。
- AC-008：观感标 `[deploy]` 人工目检。

## 上下文区

- 来源：DESIGN.md 合规审计（2026-08-16）；规范条款：DESIGN.md 394-410（Typography）、412-428（Layout）、438-449（Shapes）、495/503（散落字面量禁则）。由 t416 + t417 合并。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 逐窗口排版与布局观感：由 AC-008 目检覆盖，不写快照测试。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- grep 断言九级外字号、档外字重、非基网间距、档外圆角清零；`session_typography.test.tsx` 等既有字号断言随新档更新；涉及既有测试类名断言的同步更新。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：就近归位会改变部分文字实际大小（如 15.5→15、28→30），个别密集区域可能换行；间距微调可能改变紧凑表单视觉节奏。映射表逐点记录，AC-008 目检兜底；拿不准的间距（如 11/22px）就近取 12/24 并在笔记标注。
- 回退：git 还原即可，无数据迁移。

### 依赖与约束

- 体量大但机械；与 t406-t413 会话窗口批次同触部分文件（SessionPane 等），顺序由 task-schedule 排，建议排在该批之后减少冲突。

### Finalization 时更新的 blueprint

- 无
