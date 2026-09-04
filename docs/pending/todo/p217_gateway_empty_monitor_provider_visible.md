# p217 CPA 网关 monitor 空 provider 仍渲染空卡

- 现象：删除全部直连 kimi 账号后，用量面板仍显示 kimi 空卡「暂无账号请添加数据源」（总览卡 + kimi tab）。用户期望删除后该 provider 不再出现。根源非残留账号：config.plugins 无 KIMI、removedConnectorIds 含 kimi，但 CPA 网关实例 `parameterValues.monitor_kimi=true`，其采集 items 不含任何 kimi 记录。
- 影响：CPA（gateway）connector 监控开关为 true 但网关侧零该 provider 数据的 provider，面板渲染无内容空卡且文案「添加数据源」误导（直连已删，须在网关侧配账号）。受影响功能：用量面板 provider 卡与 tab 可见性。
- 根因（产品缺陷）：`visible_providers_from_groups`（provider-usage.ts:430-442）把 enabled connector 的 `activeProviders` 全量并入可见集。gateway(CPA) 的 activeProviders 由 `monitor_xxx` 开关推导（connector-ipc.ts:90-104），开关表达「用户希望监控」，不等于「有该 provider 账号/用量」。CPA ready 且 items 无该 provider 时，monitor 空 provider 被渲染成空卡。对照 t040：failed 直连无 items 合成占位（有失败态可看），而 gateway ready + 空 monitor provider 无可看内容却占位渲染。
- 同类位点（已确认，合并单点）：`visible_providers_from_groups` 是唯一渲染源（ProviderOverview 卡、ProviderNav tab、activeGroup 明细均派生），修一处覆盖；`get_visible_providers`（444）同源。`use_popup_derived` providerErrors（87-107）依赖 visible 挂失败 banner——CPA failed 时须保留 monitor provider 可见性，不得误删。
- 测试缺口：现有测试无「gateway ready + items 缺某 monitor provider」用例（provider-usage 单测只覆盖直连/CPA 全量返回）；应补：CPA ready items 含 codex/antigravity 不含 kimi、monitor_kimi=true → visible 不含 kimi；CPA failed → monitor provider 仍可见。
- 线索：`~/.config/OmniPanel/config.json` CPA 实例 monitor_kimi=true；snapshot-cache CPA items 6 条全 codex/antigravity。
- 处理：未开
