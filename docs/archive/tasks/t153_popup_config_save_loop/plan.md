# Task plan

## 步骤与验证

1. 抽出可测纯逻辑：`sync_ui_state_from_config`（给定已同步 ref 值 + 广播值 + 当前 state，返回应采纳的值或 null 表示无需更新）→ 验证：`tests/unit/renderer/` 新测试先红。
2. `apply_config` 接入该逻辑：`provider_order` / `account_orders` / `collapsed_accounts` / `expanded_providers` 全部「先同步 ref、值相等则保留 state 引用」→ 验证：测试转绿。
3. `onConfigChange`：比较前后 `config.plugins` 结构签名（instanceId+enabled+executablePath 序列），不变则不 `reload()` → 验证：测试覆盖。
4. `use-plugins.reload`：返回列表与现列表逐元素浅比较（含 snapshot_equal）全同则 `setPlugins(prev)` 保持引用 → 验证：测试覆盖。
5. `use-config` `onConfigChange`：`JSON.stringify` 深比较 incoming 与 `config_ref.current`，相同则跳过 → 验证：测试覆盖。
6. `main-panel-controller.apply_config_change`：记录上次 `pinToTop`，未变不 `setAlwaysOnTop` → 验证：现有单测更新/新增。
7. 移除临时调试代码（PopupView 三条 info 日志、main-panel-controller `target.show()`）→ 验证：grep 无残留。
8. 黑盒：`pnpm test`；打包运行 60s 数 `config:save` 次数 → 验证：验收标准 1/2/4。

## 风险与回退

- 风险：保 identity 的 setState 让某些依赖引用变化的 effect 不再触发（如高度上报）。镜像 DOM 由 ResizeObserver 驱动，不依赖 state 引用，风险低；黑盒 + 打包实测兜底。
- 风险：plugins 签名漏字段导致真实结构变化不 reload。签名取 connector:list 直接消费的字段（enabled/activeProviders 由 snapshot 通道覆盖）。
- 回退：`git revert` 本 task commit 即恢复原行为。

## Finalization 时更新的 blueprint

- `docs/blueprint/conventions.md`：若「renderer 不得响应配置广播反向保存配置」尚无条目，补一条。
