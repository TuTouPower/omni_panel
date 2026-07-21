---
tid: t034
slug: sync_infra_specs
diff_anchor: "dd5eccc"
branch: t034_sync_infra_specs
---

# Task t034_sync_infra_specs

过程总账。

## 过程记录

- 接续 t033，同步 6 个基础设施类 spec（secret-vault 最新不动）。
- 3 sub agent 并行实施。
- diff_anchor = dd5eccc（t033 commit）。

## Review 处置

纯文档同步，用户已审批范围。零 finding。

## 收尾报告

SHA 由 `git log --grep t034` 查。

### 验收标准勾选

- [x] ipc：补 tokenStats 6 条（L21）+ trend:get（L22）+ tray:openWeb + config:getSecrets（L36）+ 渲染命名空间 tokenStats/trend（L27）
- [x] platform-services：监听改 0.0.0.0 含安全语义说明（L7）+ 端点清单补全 + observations.sqlite + paths 补全
- [x] ui-views：容器查询 t004（L35）+ error badge t026-28（L36）+ NAV_ITEMS t017/23（L45）+ UpcomingReset t005（L13）+ Icon t014
- [x] config-store：accountOverrides 已在 Zod（L14 修正）+ accountLabels/dirAliases/modelAliases + mainPanelMode system + displayName
- [x] web-panel：补 /v1/trend、/v1/connectors 端点 + SPA fallback 范围 + tray:openWeb
- [x] window-management：maxWidth 1400（L9）+ mainPanelMode system 与 IPC 分裂
- [x] secret-vault 不动（最新）

### Reviewer verdict

- 纯文档 task，未走双审（3 sub agent 分组 + 主控抽查关键点）。

### 遗留

- 无

### 结果摘要

6 个基础设施 spec 同步到当前代码真相。3 个严重落后（ipc/platform-services/ui-views 含事实错误或大面积缺漏）已修正——platform-services 的 `0.0.0.0` 监听安全语义、ipc 的 tokenStats/trend 通道组、ui-views 的 t004/005/006/014/017/023/026-28 八个 task 功能补齐。3 个小 gap（config-store/web-panel/window-management）字段与端点修正。secret-vault 最新不动。至此 14 个 spec 全部同步完成（t033 连接器 7 + t034 基础设施 6 + secret-vault）。
