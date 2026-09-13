# Task spec

## 背景

主进程的「自启」与「暂停」两个状态各有两套实现且互不同步（d058）：

- 自启：设置页 `general_section.tsx:100` 只写 config `launchAtLogin`，主进程无消费者读出；真正生效的是 tray toggle（`index.ts:1162`）与 CLI（`client.ts:230`）各自的 `setLoginItemSettings`。
- 暂停：tray 用本地布尔 `is_paused`（`index.ts:1077`，toggle 于 `:1149`）；CLI/Web 经 control deps 直调 `orchestrator.suspend/resume("user")`（`index.ts:716`），两者不互相广播，tray 勾选态会过期。

## 契约区

### 范围

- 自启单一来源：主进程启动时按 config `launchAtLogin` 应用 `setLoginItemSettings`；设置页保存后立即生效；tray 与 CLI 改 OS 状态的同时更新 config 并广播。
- 暂停态唯一来源为 orchestrator（或 orchestrator 暴露的只读查询）；删除 tray 本地 `is_paused` 影子状态；tray toggle 与 control `pause`/`resume` 走同一路径并广播统一状态。
- 平台差异显式：无 `setLoginItemSettings` API 的平台（Linux）保持降级行为并回报能力不可用。

### 非范围

- 不改 CLI autostart/pause 子命令语法。
- 不改 orchestrator `suspend/resume` 的 reason 语义与刷新调度其他行为。
- 不改 packaging/安装器逻辑。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：设置页切换「开机自启」后，`getLoginItemSettings().openAtLogin` 与 config `launchAtLogin` 一致，重启应用后保持一致。
- [ ] AC-002：tray menu 的 autostart 勾选态来自真实 OS 状态，与设置页/CLI 修改后的值同步（任一处修改，其他两处可见）。
- [ ] AC-003：CLI `autostart` 切换后 config `launchAtLogin` 被更新，设置页重新打开显示一致。
- [ ] AC-004：应用启动时按 config `launchAtLogin` 应用一次 OS 登录项设置（config 为真而 OS 项缺失时补齐）。
- [ ] AC-005：经 CLI/Web 暂停后 tray 菜单勾选态显示为「已暂停」；经 tray 暂停后 CLI/Web 查询到已暂停（同一来源）。
- [ ] AC-006：暂停态只存在一个来源，代码中不再有 tray 本地布尔影子状态（`is_paused` 清零或改为读 orchestrator）。
- [ ] AC-007：连续在 tray 与 CLI 交替切换，不出现状态反向（每次切换结果与应用实际调度一致）。
- [ ] [deploy] AC-008：macOS/Windows 实际重启后自启生效；Linux 无 `setLoginItemSettings` 时返回能力不可用且不崩溃。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- AC-001..007：以注入的 `setLoginItemSettings`/`getLoginItemSettings` mock 与 orchestrator mock 单测可证。
- AC-008：需真实 OS 重启，标 `[deploy]`。

## 上下文区

- 来源：日常审计 d058（2026-09-14）；原 t475 合并入本 task

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 真实登录项在 OS 注册表/plist 的写入细节：由 mock 边界覆盖，不测 OS 内部。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- mock `app.setLoginItemSettings`/`getLoginItemSettings` 与 orchestrator/事件总线；断言 config 与 OS mock 状态一致、双向切换后暂停态一致、事件广播。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- Linux 自启实现（.desktop autostart 文件）是否纳入：UNVERIFIED-BLOCKING，实施期确认是否仅报能力不可用。
- orchestrator 是否已有可查询暂停态的 API：UNVERIFIED-BLOCKING，实施期确认，若无则新增只读查询。

### 风险与回退

- 风险：启动时按 config 写 OS 项可能覆盖用户手工设置；改 tray 状态源影响现有 toggle 行为。
- 回退：自启仅在 config 为真且当前 OS 项为假时补齐，不做反向强制关闭；暂停保留原 toggle 语义，仅换状态读取来源。

### 依赖与约束

- 前置：无。

### Finalization 时更新的 blueprint

- `docs/specs/platform-services-api.md` / settings spec：自启单一来源。
- `docs/specs/scheduler.md`：暂停态单一来源。
- `docs/specs_index.md`：挂 t474。
