# Task spec

## 背景

Web bridge（`src/web/usageboard-web.ts`）多处与桌面 IPC 不等价或直接降级（d058）：`sessionHistory.recent` 忽略 `source/env/limit` 硬编码 20（`:755`）；`connector.snapshot` 返回 `{}`（`:326`）；`tokenStats.forceCollect` no-op（`:519`）；`getBuckets`/`getRecords` 忽略 filters（`:520/:552`）；日志导出对文件缺失返回 200 空文件而桌面返回错误（`server.ts:1091` vs `log-ipc.ts:43`）；主题在 `usageboard-web.ts:124` 与 `renderer/lib/theme.ts:4` 逐字重复，且 `config.save({theme})` 不更新主进程 `nativeTheme`（`event-ipc.ts:78` 仅 THEME_SET 更新）。

## 契约区

### 范围

- Web bridge 方法语义对齐桌面：`recent` 尊重入参（或明确标注不支持并在调用点禁用）、`snapshot`/`forceCollect`/`getBuckets`/`getRecords` 要么实现要么在不支持时明确报错而非静默降级（不返回伪造空值）。
- 日志导出错误语义两端统一。
- 主题：`apply_theme` 去重为单一实现（renderer 一份，web 复用）；config 保存 `theme` 时同步主进程 `nativeTheme`，保持一致。
- 补齐 LocalAPI 缺失端点（如 `/v1/sessionHistory/recent`）或明确从 bridge 移除对应能力。

### 非范围

- 不改桌面 IPC 已有实现（除主题同步点）。
- 不改 token-stats 校验规则（→ t476）。
- 不改会话查询逻辑（→ t476）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：Web bridge 不再有「静默返回假值」的方法：不支持的 API 调用返回明确错误或从接口移除，调用方在编译期/运行期可感知。
- [ ] AC-002：`sessionHistory.recent` 在 Web 端遵守传入的 `source/env/limit`（或该 API 在 Web 端明确不可用）。
- [ ] AC-003：日志导出在文件不存在时两端返回一致的错误语义。
- [ ] AC-004：`apply_theme` 只有一份实现，renderer 与 web 复用同一函数。
- [ ] AC-005：通过导入配置或其他窗口保存修改 `theme` 后，主进程 `nativeTheme` 与页面主题一致（无需重启或重进设置页）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试（web bridge 单测 + 主题同步集成测试）。

## 上下文区

- 来源：日常审计 d058（2026-09-14）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 当前未被渲染层调用的 web bridge 方法：先核实调用图，未接线者以「明确不可用」处理，不为死代码写实现测试。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- mock fetch/主进程；断言 web bridge 行为、主题同步。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 各 web bridge 方法是否被渲染层实际调用：UNVERIFIED-BLOCKING，实施期先跑调用图（grep 调用点）确定实现/删除范围。

### 风险与回退

- 风险：改动 web bridge 影响 Web panel 既有功能。
- 回退：按方法逐个迁移，先补主题同步（独立且低风险）。

### 依赖与约束

- 前置：无。与 t476 有交集，建议错开实施。

### Finalization 时更新的 blueprint

- `docs/specs/web_config_parity.md`：bridge 能力对齐表。
- `docs/specs_index.md`：挂 t480。
