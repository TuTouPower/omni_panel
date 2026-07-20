# Task spec

## 背景

T023 settings_provider_accounts electron restart case 改 class（`.ao-item`→`.accent-row`，SettingsView 重构改名），typecheck + class 对照过，但未真跑（Electron 慢）。跑 `test:e2e:electron --grep persists` 验证，class 失效则修。

## 范围

- 跑 `pnpm test:e2e:electron --grep "persists secrets"`
- 若失败（class/selector 差）：对照 SettingsView accounts 页实际 DOM 修 selector
- 全量 `pnpm test:e2e:electron` 确认 electron project 不破

## 非范围

- 不改 web spec
- 不改 mock/vite

## 验收标准

- [ ] restart case 真跑绿（或修复后绿）
- [ ] `pnpm test:e2e:electron` 跑通（或记录已知失败）

## 依赖与约束

- 需 out/main/index.js（pnpm build 产物）+ ensure_electron_abi
