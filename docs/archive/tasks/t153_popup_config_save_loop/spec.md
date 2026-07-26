# Task spec

## 背景

用户报告「用量面板一直闪烁」。诊断证据（`%APPDATA%/OmniPanel/logs/app-2026-07-26.log`，52MB 撞日志上限）：

- 16 分钟内 `config:save` IPC 调用 19,965 次（约 30ms 一圈的死循环）：renderer `patchConfig` get→save → 主进程广播 `CONFIG_CHANGED` → PopupView `onConfigChange` → `reload()` 重载插件列表并重渲染 → 某个持久化 effect 再次 `patchConfig`。
- 每圈 2 次 `connector:list`（usage 窗 reload + setting 窗 `[config]` effect），面板全量重渲染 + `setAlwaysOnTop` 每圈调用 → 可见闪烁。
- 循环期间 plugins 数从 16 变到 18（用户在加账号），面板为 floating 模式且可见。

根因（不变量破坏）：**renderer 响应配置广播时会反向保存配置**。三处持久化 effect 的「已同步」引用（`synced_order_ref` / `prev_collapsed_ref` / `prev_expanded_ref`）在 `apply_config` 路径不同步，且 `apply_config` 每次广播都用新对象覆盖 state，effect 反复求值；叠加插件结构变化期的剪枝 effect，任何抖动都能让守卫持续失配，形成 closed loop。

## 范围

- `PopupView`：`apply_config` 对所有持久化字段做「同步 ref + 保 identity 的条件 setState」；persist effect 只在真实用户意图（state 偏离已同步 ref）时保存。
- `PopupView` `onConfigChange`：仅当 `config.plugins` 结构签名变化时才 `reload()`；`reload()` 结果与现列表结构一致时保持原引用。
- `use-config`：`onConfigChange` 回显用深比较（IPC 反序列化后引用比较恒 false）跳过 `setConfig`。
- `main-panel-controller.apply_config_change`：`pinToTop` 未变化时不重复 `setAlwaysOnTop`。
- 单元测试覆盖上述守卫逻辑。

## 非范围

- 不改浮动窗口 `save_floating_bounds` 的写盘频率（另议）。
- 不改日志 50MB 上限策略。
- 不重构 SettingsView 的 `[config]` effect（由 use-config 深比较顺带消除其无效触发）。

## 验收标准

- [ ] 打包运行 60s（面板可见）：`config:save` IPC 次数 ≤ 5（仅启动收敛），无持续增长；`Reloading plugin list` 不出现刷屏。
- [ ] 面板可见时不因配置广播发生全量重渲染闪烁（`connector:list` 不随广播反复调用）。
- [ ] 新增单元测试：广播回显不触发 persist；plugins 签名不变不触发 reload；use-config 深比较跳过相同配置。
- [ ] `pnpm test` 全绿，`pnpm typecheck` 通过。

## 依赖与约束

- 保持用户拖拽排序 / 折叠展开 / 阈值切换等真实操作的持久化行为不变。
- 遵循 TDD：守卫逻辑先写失败测试再实现。
