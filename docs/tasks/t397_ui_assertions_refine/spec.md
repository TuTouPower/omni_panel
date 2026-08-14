# Task spec

## 背景

UI 组件断言 4 条 minor 遗留合并（t333/t377/t381/t383 review 遗留）：p149 的设置侧铃铛斜杠组件层覆盖不全（AC-002 LabelMapDialog 对话框路径仅靠 e2e 兜底、AC-004 斜杠随切换即时更新无组件测试）；p177 的 route_api/App/CpaLabelMapDialog/AccountDialog 等关键 UI 组件无直接单测；p179 的会话侧边栏混色断言不含百分比（改 70%/8% 不捕获）；p180 的 /v1/trend 集成测试未钉 date 时刻格式（t383 改 UTC ISO 时刻后第三消费方 web 面板链路未显式覆盖）。均为测试断言补强。

## 契约区

### 范围

- 设置侧铃铛斜杠组件层覆盖：`label_map_dialog.test.tsx` 直接渲染 LabelMapDialog 断言未监控/已监控 `data-slash` 显隐（AC-002）；`settings_view_watched.test.tsx` 或对应测试补「斜杠随切换即时更新」（AC-004，mock watched props 更新）
- 关键 UI 组件直接单测：route_api、App、CpaLabelMapDialog、AccountDialog 的关键 UI 状态机/分支补直接单测
- 会话侧边栏混色断言：`session_rail` 相关测试 className 断言补百分比子串（`_70%`/`_8%`）锁定灰阶比例
- `/v1/trend` 集成测试：`server.test.ts` 补 date 时刻格式断言（UTC ISO 保留时刻）

### 非范围

- 组件行为变更（仅补测试断言，不改组件逻辑）
- 其它组件测试覆盖

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

- [ ] AC-001：LabelMapDialog 组件层斜杠断言——直接渲染 LabelMapDialog，断言未监控/已监控状态 `data-slash` 显隐（不依赖 e2e 兜底）。
- [ ] AC-002：斜杠随切换即时更新——设置侧铃铛斜杠在监控状态切换后即时更新有组件测试（mock watched props 更新）。
- [ ] AC-003：关键 UI 组件直接单测——route_api / App / CpaLabelMapDialog / AccountDialog 的关键状态机/分支有直接单测（此前无）。
- [ ] AC-004：混色百分比断言——会话侧边栏混色 className 断言含 `_70%`/`_8%` 百分比（改动比例测试失败，对比现在只验 color-mix 存在）。
- [ ] AC-005：/v1/trend date 断言——集成测试断言响应 date 为 UTC ISO 时刻格式（保留时分，同一天多点可区分）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：组件测试（testing-library）+ 集成测试覆盖。

## 上下文区

- 来源：p149 / p177 / p179 / p180（`docs/pending/todo/`；2026-08-13/14 登记，t333/t377/t381/t383 review 遗留；均按 AC 语义已足判 minor，本 task 补强断言）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 设置铃铛：`label_map_dialog.test.tsx` 补 data-slash 断言；`settings_view_watched.test.tsx` 补 AC-004 即时更新用例（mock watched props 更新）。
- UI 组件：为 route_api/App/CpaLabelMapDialog/AccountDialog 建直接单测，覆盖关键分支。
- session rail：既有混色断言补百分比子串。
- `server.test.ts`：/v1/trend 补 date 时刻格式断言（对齐 build_trend_series 新契约）。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：补直接单测可能暴露既有组件测试环境缺失（需 mock 依赖）；断言收紧可能误挂（百分比子串与实现 className 需对齐）。
- 回退：git 回退；均为测试补强，组件逻辑不变，失败仅测试侧。

### 依赖与约束

- 无前置依赖。实现约束：不改组件生产逻辑；新断言须与当前实现 className/date 格式一致（非把断言改成新实现输出，而是断言既有正确行为）。

### Finalization 时更新的 blueprint

- 无
