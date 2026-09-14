# Task spec

## 背景

主进程的「自启」与「暂停」两个状态各有两套实现且互不同步（d058）：

- 自启：设置页只写 config `launchAtLogin`，主进程无消费者读出并应用；真正生效的是 tray toggle（`index.ts:1162`）与 CLI（`client.ts:230`）各自的 `setLoginItemSettings`。二者都不回写 config，设置页与真实 OS 状态因此可漂移。
- 暂停：tray 用本地布尔 `is_paused`（`index.ts:1077`，toggle 于 `:1149`）；CLI/Web 经 control deps 直调 `orchestrator.suspend/resume("user")`（`index.ts:718-723`），二者不互相广播，tray 勾选态会过期。

本仓核实（2026-09-14）：

- `orchestrator`（`src/main/core/scheduler/scheduler-orchestrator.ts:41-48`）公开接口只有 `startAll/rebuild/reconcile/suspend/resume/shutdown`，内部 `pauseReasons: Set<PauseReason>` 与 `shutdownStarted` 是闭包私有，**当前没有可查询暂停态的 API**。因此「暂停态只读查询」是本 task 需新增的实现，不是既有内部 API。
- Linux 无 `setLoginItemSettings`：`index.ts:1078` 用 `hasLoginItemApi` 判定，tray toggle 直接 return；CLI `autostart`（`client.ts:230-240`）在非 macOS/Windows 打印「不受支持（可手动配置 systemd 自启动）」。本批明确：Linux 上该能力不可用，按能力不可用回报，不再作为「未定产品问题」保留。

## 契约区

### 范围

- **自启以 config 为准、双向应用**：主进程启动时读 config `launchAtLogin` 并调用 `setLoginItemSettings` 应用一次（config 为真而 OS 项为假时补齐；config 为假而 OS 项为真时关闭——由 config 决定 OS 状态）；设置页保存后立即生效。
- tray 与 CLI 切换自启时，同时更新 OS 状态与 config `launchAtLogin` 并广播；删除「回退只补开启、不做反向关闭」的旧矛盾表述——config 为假时也应关闭 OS 登录项，使 config 成为唯一真相。
- **暂停态唯一来源为 orchestrator**：新增 orchestrator 只读查询（如 `is_suspended(reason?)` / `paused()`，返回当前暂停态与原因集合）；删除 tray 本地 `is_paused` 影子状态；tray toggle 与 control `pause`/`resume` 走同一路径并广播统一状态。
- **三入口同一实际调度状态**：Web（`/v1/control/pause|resume`）、CLI、tray 读到/驱动的暂停态一致；任一处暂停后其他两处查询到已暂停。
- **Web 自启操作以宿主为目标**：Web 面板的自启开关由宿主（Electron 主进程）执行 `setLoginItemSettings`，Web 端不直接改 OS；Web 与桌面读到同一 config 值与同一实际状态。
- 平台差异显式：Linux/无 `setLoginItemSettings` 平台返回能力不可用，不崩溃。

### 非范围

- 不改 CLI autostart/pause 子命令语法。
- 不改 orchestrator `suspend/resume` 的 reason 语义（`"user"`/`"system"`）与刷新调度其他行为。
- 不改 packaging/安装器逻辑。
- 不为 Linux 新增 .desktop autostart 实现（明确能力不可用，可手动配置 systemd）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：设置页切换「开机自启」后，`getLoginItemSettings().openAtLogin` 与 config `launchAtLogin` 一致，重启应用后保持一致。
- [ ] AC-002：tray menu 的 autostart 勾选态来自真实 OS 状态，与设置页/CLI 修改后的值同步（任一处修改，其他两处可见）。
- [ ] AC-003：CLI `autostart` 切换后 config `launchAtLogin` 被更新，设置页重新打开显示一致。
- [ ] AC-004：应用启动时按 config `launchAtLogin` 应用一次 OS 登录项设置：config 为真而 OS 项为假时补齐；config 为假而 OS 项为真时关闭（config 双向决定 OS 状态）。
- [ ] AC-005：经 CLI/Web 暂停后 tray 菜单勾选态显示为「已暂停」；经 tray 暂停后 CLI/Web 查询到已暂停（同一来源）。
- [ ] AC-006：暂停态只存在一个来源，代码中不再有 tray 本地布尔影子状态；暂停态经 orchestrator 新增的只读查询获取。
- [ ] AC-007：连续在 tray 与 CLI 交替切换，不出现状态反向（每次切换结果与应用实际调度一致）。
- [ ] AC-008：Web 面板自启开关触发后，由宿主调用 `setLoginItemSettings`，Web 与桌面读到的 config 值与实际 OS 状态一致。
- [ ] AC-009：无 `setLoginItemSettings` 平台（Linux）调用自启操作返回明确的能力不可用结果，不崩溃，UI 可见该状态。
- [ ] [deploy] AC-010：macOS/Windows 实际重启后自启生效；Linux 无 `setLoginItemSettings` 时返回能力不可用且不崩溃。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- AC-001..009：以注入的 `setLoginItemSettings`/`getLoginItemSettings` mock 与 orchestrator/control 单测可证；Web 路径以 LocalAPI 集成测试断言宿主执行。
- AC-010：需真实 OS 重启，标 `[deploy]`。

## 上下文区

- 来源：日常审计 d058（2026-09-14）；原 t475 合并入本 task；用户 2026-09-14 裁定 Linux 能力不可用、自启以 config 为准双向应用

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 真实登录项在 OS 注册表/plist 的写入细节：由 mock 边界覆盖，不测 OS 内部。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- mock `app.setLoginItemSettings`/`getLoginItemSettings` 与 orchestrator/事件总线；断言 config 与 OS mock 状态双向一致、双向切换后暂停态一致、事件广播。
- orchestrator 只读查询以真实 orchestrator 实例 + suspend/resume 调用断言返回值。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无（orchestrator 无暂停态查询已由本仓 `scheduler-orchestrator.ts:41-48` 核实，为本 task 新增项而非未知契约；Linux 无法支持已由 `index.ts:1078` 与 `client.ts:230-240` 核实，按能力不可用处理）。

### 风险与回退

- 风险：启动时按 config 写 OS 项可能覆盖用户手工设置；改 tray 状态源影响现有 toggle 行为。
- 回退：自启应用始终以 config 为真相；暂停保留原 toggle 语义，仅换状态读取来源。若 orchestrator 查询新增引发问题，可回退为读 `pauseReasons` 的只读投影，不改 suspend/resume 行为。

### 依赖与约束

- 前置：无。
- 平台：`setLoginItemSettings` 仅 macOS/Windows；Linux 明确不可用。
- 与 t480 的交界：Web 自启开关的 bridge/HTTP 接线若涉及 Web 侧方法，由 t480 负责；本任务要求宿主执行语义。

### Finalization 时更新的 blueprint

- `docs/specs/platform-services-api.md` / settings spec：自启单一来源（config 为准、双向应用）。
- `docs/specs/scheduler.md`：暂停态单一来源与只读查询 API。
- `docs/blueprint/decisions.md`：自启以 config 为真相、Linux 能力不可用决策。
- `docs/specs_index.md`：挂 t474。
