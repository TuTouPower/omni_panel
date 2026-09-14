# Task spec

## 背景

Web bridge（`src/web/usageboard-web.ts`）多处与桌面 IPC 不等价或直接降级（d058）：

- `sessionHistory.recent`（`:755-764`）忽略 `source/env/limit` 入参，硬编码取 `/v1/sessions` 前 20，且 LocalAPI 无 `/v1/sessionHistory/recent` 端点。
- `connector.snapshot` 返回 `{}`（`:326`），静默伪造空值。
- `tokenStats.forceCollect` no-op（`:518-519`，返回 `null`）。
- `tokenStats.getBuckets` 忽略 filters（`:520` 调 `/v1/buckets` 不传参）；`getRecords`（`:552`）调 `/v1/records` 不传 filters/limit。
- 日志导出对文件缺失返回 200 空文件（`server.ts:1091` 起）而桌面返回错误（`log-ipc.ts:43`）。
- 主题在 `usageboard-web.ts:124`（`apply_theme_dom`）与 `renderer/lib/theme.ts:4` 逐字重复；且 `config.save({theme})` 不更新主进程 `nativeTheme`（`event-ipc.ts:78` 仅 THEME_SET 更新）。

用户裁定（2026-09-14，与 t473 一致）：Web 与桌面**同权限**，共享业务操作不得仅因 Web 降只读/禁用；宿主能力由宿主执行。调用图用于确定实现方式，**不得**据「未被调用」就直接砍功能；不支持的呈现可不同，但业务能力必须等价。

本仓核实调用图（2026-09-14）：`connector.snapshot`、`tokenStats.getBuckets`、`tokenStats.getRecords` 当前在 renderer 无调用点；`tokenStats.forceCollect` 唯一调用点是 `SessionShell.tsx:163`（刷新触发）；`sessionHistory.recent` 当前无 renderer 调用点。即便当前未接线，也不得静默返回伪造空值——必须实现为等价的宿主/HTTP 调用或返回明确错误（若能力确实不存在），由后续接线复用。

## 契约区

### 范围

- **共享业务能力 Web 等价实现**（宿主执行，Web 只做 HTTP/bridge 调用），逐项行为对齐桌面：
    - `sessionHistory.recent(source, env, limit)`：尊重入参，调 LocalAPI 对应端点（补 `/v1/sessionHistory/recent`）或在等价查询上过滤；返回与桌面同结果集与排序；`limit` 走 t476 的 [1,10000] 校验。
    - `connector.snapshot`：返回真实运行时快照（对齐桌面 `CONNECTOR_GET_STATE` 语义），不返回 `{}`。
    - `tokenStats.forceCollect`：触发宿主采集（对齐桌面 `TOKEN_STATS_FORCE_COLLECT`），返回同一语义；宿主能力由宿主执行。
    - `tokenStats.getBuckets(filters)`：透传 `source/env/from_date/to_date`（对齐桌面 `TOKEN_STATS_BUCKETS`），不丢 filters。
    - `tokenStats.getRecords(filters)`：透传 `session_id/source/env/start/end/limit`（对齐桌面 `TOKEN_STATS_RECORDS`），不丢 filters 与 `limit`。
- 补齐 LocalAPI 缺失端点所需者（如 `/v1/sessionHistory/recent`），使 Web 与桌面同源；端点分层遵循 t473 基线（无认证，两端同权限）。
- **不保留「实现或者禁用或者移除」的随意降级**：不存在静默返回假值/no-op 的 bridge 方法；无法等价的宿主专属能力必须返回明确错误（且仅当该能力确为宿主专属、Web 无法执行时）。
- 日志导出：文件缺失时 Web 与桌面返回一致的错误语义（不再 200 空文件）。
- 主题：`apply_theme` 去重为单一实现（renderer 一份，web 复用）；config 保存 `theme` 时同步主进程 `nativeTheme`，导入配置后也一致，无需重启/重进设置页。
- 宿主能力（窗口控制、系统托盘、nativeTheme、`setLoginItemSettings` 等）由宿主实现；Web 以 bridge 调用宿主，呈现方式可不同，权限不降级。

### 非范围

- 不改桌面 IPC 已有业务实现（除主题同步点）。
- 不改 token-stats 校验规则与会话查询逻辑（→ t476），本 task 只做 bridge 接线。
- 不改鉴权/认证（→ t473）。
- 不新增认证或凭据。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：Web bridge 不再有「静默返回假值/no-op」的方法：每个宿主专属或不支持的方法要么返回真实等价结果，要么返回明确错误；任何方法都不得返回 `{}`、`null` 之类伪造空值作为成功。
- [ ] AC-002：`sessionHistory.recent` 在 Web 端遵守传入的 `source/env/limit`，与桌面同输入同结果；不得硬编码 20 或忽略参数。
- [ ] AC-003：`connector.snapshot` 在 Web 端返回真实运行时快照（与桌面 `getState` 语义一致），不再返回 `{}`。
- [ ] AC-004：`tokenStats.forceCollect` 在 Web 端触发宿主采集并返回与桌面同语义结果（不再 no-op）。
- [ ] AC-005：`getBuckets(filters)` 与 `getRecords(filters)` 的 `filters` 与 `limit` 被透传，结果与桌面同参数一致，不丢参数。
- [ ] AC-006：日志导出在文件不存在时两端返回一致的错误语义（Web 不再返回 200 空文件）。
- [ ] AC-007：`apply_theme` 只有一份实现，renderer 与 web 复用同一函数。
- [ ] AC-008：通过导入配置或其他窗口保存修改 `theme` 后，主进程 `nativeTheme` 与页面主题一致（无需重启或重进设置页）。
- [ ] AC-009：宿主专属能力（窗口控制/托盘/nativeTheme 等）在 Web 端经 bridge 调用宿主执行，权限与桌面一致；两端业务结果一致，仅呈现可不同。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- AC-001..009 可自动测试（web bridge 单测 + LocalAPI 集成 + 主题同步集成；宿主调用以 mock 断言被触发）。
- 真实 Electron `nativeTheme` 与真实托盘：`[deploy]` 人工签收，自动化覆盖调用路径与结果映射。

## 上下文区

- 来源：日常审计 d058（2026-09-14）；用户 2026-09-14 裁定 Web 同权限、不因入口降级

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 当前未被渲染层调用的 bridge 方法（`snapshot`/`getBuckets`/`getRecords`/`recent`）：调用图已核实（见背景），但不据此删功能；按等价实现 + 单测覆盖，不因「暂时没接线」跳过。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- mock fetch / 宿主 bridge；断言 web bridge 每个方法透传参数、返回与桌面同语义、无伪造空值；主题同步断言宿主调用被触发。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无（各 bridge 方法调用图与桌面对应 IPC/端点已由本仓 `usageboard-web.ts`、`preload/index.ts`、`server.ts` 逐一核实，见背景）。

### 风险与回退

- 风险：改动 web bridge 影响 Web panel 既有功能。
- 回退：按方法逐个迁移，先补主题同步（独立且低风险）；无伪造空值的要求不回退。

### 依赖与约束

- 前置：无。与 t476 有交集：t476 定义共享查询契约与校验，本 task 只做 bridge/HTTP 接线，建议 t476 之后。
- 与 t473 一致：无新增认证，两端同权限；宿主能力由宿主实现。

### Finalization 时更新的 blueprint

- `docs/specs/web_config_parity.md`：bridge 能力对齐表（逐方法：桌面 IPC ↔ LocalAPI 端点 ↔ 行为）。
- `docs/specs_index.md`：挂 t480。
