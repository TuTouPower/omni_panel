# Task spec

## 背景

AddAccountDialog can_add('opencode_go') 检查 plugin_infos active/supportedProviders，若 connector 未注册/启用 -> 按钮 disabled -> 用户点击无反应。

## 范围

- 确认 opencode_go 在 plugin_infos 暴露（manifest 加载 + auto_seed）；can_add 逻辑核实；若 connector 未启用也允许添加（先添加再启用）。单测覆盖 can_add 对各 provider 判定。

## 非范围

- 不改其他模块。

## 验收标准

- [ ] 见范围具体条目。
- [ ] pnpm test / typecheck / lint 全绿。

## 依赖与约束

- 无外部依赖。
