# Task spec

## 背景

docs/specs/ 下 7 个基础设施类 spec 自 2026-07-05 迁移后未随 t001-t029 同步。secret-vault 最新不动，其余 6 个需更新（3 严重落后含事实错误）。

## 范围

同步 6 个 spec：

- `ipc.md`（严重）：补 tokenStats 6 条通道、`trend:get`、`tray:openWeb`、`config:getSecrets`
- `platform-services.md`（严重）：LocalAPI 监听 `0.0.0.0`（spec 写 `127.0.0.1`）+ 端点清单补全 + `observations.sqlite`（非 `.db`）+ paths 补 get_token_stats_db_path/getStatesDir 等
- `ui-views.md`（严重）：补 t004 容器查询、t005 即将重置预警、t006 sparkline、t014 Icon、t017/t023 settings nav、t026-028 per-account error badge
- `config-store.md`：accountOverrides 已在 Zod（事实错修正）+ 补 accountLabels/dirAliases/modelAliases + mainPanelMode system + displayName
- `web-panel.md`：补 /v1/trend、/v1/connectors 端点 + SPA fallback 范围 + tray:openWeb
- `window-management.md`：maxWidth 780→1400 + mainPanelMode system

## 非范围

- 不改代码
- secret-vault.md（最新，不动）
- 连接器类（t033 已完成）

## 验收标准

- [ ] 每差距逐条修复
- [ ] spec 提及与 src/ 当前代码一致
- [ ] platform-services 无 `127.0.0.1` 监听错误描述

## 依赖与约束

纯文档；黑盒 = grep 核对。基于 t033。
