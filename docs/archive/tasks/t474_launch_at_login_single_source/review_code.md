# Task review t474（reviewer_focus: 代码）

- task：`t474_launch_at_login_single_source`
- spec：`docs/tasks/t474_launch_at_login_single_source/spec.md`
- diff_anchor：`64dc717caf5be8630c1c5dd3516461f68b60140a`
- target：`git -C '/workspace/scratch/816ee2fd705d/omni_panel_t474' diff 64dc717caf5be8630c1c5dd3516461f68b60140a`
- round：1
- reviewed_at：2026-09-14 08:05 UTC

## Findings

reviewed_scope: 3350cf2e0045031f

本轮零 finding。

## 结论

- `launch-at-login.ts` 是唯一 OS 登录项适配层；主进程启动、配置保存、导入、tray 与 LocalAPI 控制均以 config `launchAtLogin` 为目标值，并读取实际 OS 状态返回结果。
- Linux/缺少 Electron API 明确返回 `available:false`，不会调用不存在的 API；CLI 不再在独立瘦客户端进程直接写 OS，而是交给运行中的主进程。
- `scheduler-orchestrator` 内部 `pauseReasons` 仍是唯一暂停状态，`get_pause_state`/`on_pause_state` 向 tray 与 LocalAPI 提供投影；主进程与 renderer 不再维护独立的 tray 暂停影子值。
- LocalAPI status/autostart 路由只增加宿主控制入口，没有改变 ingest 的 Bearer 门禁或既有输入校验/控制动作语义。

### AC 复验方式

|AC|类别|证据|
|---|---|---|
|AC-001|re_verified|配置保存路径调用主进程 `apply_configured_launch_at_login`，适配层单测覆盖 true/false 双向应用；真实 OS 重启属于 AC-010 部署项。|
|AC-002|re_verified|tray 状态从 `read_launch_at_login` 读取实际 OS 值，并由 config/主进程状态广播刷新。|
|AC-003|re_verified|CLI 支持平台 POST `/v1/control/autostart`，由主进程保存 config 与 OS；Linux 明确不可用。|
|AC-004|re_verified|应用启动后立即按 `currentConfig.launchAtLogin` 调用一次适配层，true/false 都会写入。|
|AC-005|re_verified|LocalAPI `/v1/control/status` 返回 orchestrator pause state；tray/control 均调用同一 orchestrator。|
|AC-006|re_verified|源码移除主进程 `is_paused`，只保留 orchestrator 查询/订阅；renderer 只接收广播用于显示。|
|AC-007|re_verified|tray toggle 与 LocalAPI/CLI control 共用 `suspend/resume`，orchestrator reason-set 单测覆盖交替/组合原因。|
|AC-008|re_verified|LocalAPI autostart action 调用主进程 `set_launch_at_login_from_control`，配置与 OS 写入/状态读取在宿主完成。|
|AC-009|re_verified|launch-at-login 与 LocalAPI control 单测断言 Linux/不可用平台返回明确 `available:false` 且无 OS API 副作用。|
|AC-010|deploy_reverified|当前受限 Linux 环境无法执行 macOS/Windows 重启；自动化验证了支持/不支持分支，真实重启留给部署环境签收。|

coverage = 10 / 10

verdict: PASS
