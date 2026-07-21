# 已知待修问题

## e2e badge 展开按钮 timeout

- 现象：`account_error_badge.spec.ts` `getByRole("button", {name:"展开"})` within Kimi card timeout (10s)。Page snapshot 显示 Kimi card 有 `button "展开"` accessible name。
- 猜测：`filter({hasText:"Kimi"})` 匹配多个 cards、或展开按钮 accessible name 非 "展开"（aria-label 覆盖）。
- 根因未确认：需调试 Kimi card accessible name + 展开按钮 visibility/strict mode。
- 关联：T027 error badge e2e 完整通过依赖此修复。

## T029 connector 脚本 per-account error 改进

- 现状：`observation_to_metric_record` 已映射 `last_error → MetricRecord.error`（T028）。refresh-service 已记 stale observation `last_error`（L284）。但 connector 脚本多用 `throw`（整体 failed），不调 `ctx.report_failed_account(...)` per-account。
- 需改：connector 脚本 per-account catch → `ctx.report_failed_account(provider, account_id, account_label, error)` + continue（不 throw）。
- 工作量：中等，分 connector 迁移（CPA/KIMI 等）。
- 关联：T028 per-account error 数据源。当前只有 stale observation 有 last_error（整体失败后残留）；改进后实时 failed account 也有 error。

## 设置页删除账号后重启复现

- 报告时间：2026-07-22。
- 现象：在设置页删除账号后，当前运行期间账号消失；关闭并重新打开应用后，已删除账号重新出现。
- 已知范围：GLM、MiniMax 等多个 provider 均可复现，不像单一连接器问题。
- 期望：删除账号须持久化删除对应实例配置及关联凭据；应用重启后不得恢复。
- 根因：删除仅 filter `config.plugins`，无 tombstone；启动 `auto_seed_connectors` 把内置 connector 定义与现有 plugins 对比，缺失即视为首次安装重新 seed → 复活。
- 修复（t038，done）：`AppConfiguration` 加 `removedConnectorIds`（manifest id 数组）；删除时写入，`auto_seed_connectors` 第 3 参跳过命中 id。

## Grok 采集正常但主面板显示暂无账号

- 报告时间：2026-07-22。
- 现象：Grok 添加账号后，设置页显示采集正常；主面板 Grok 区域仍显示"暂无账号"，看不到任何用量数据。
- 期望：采集成功账号须出现在主面板，并展示对应采集数据与新鲜度。
- 根因：billing 返回 200 但零有效 usage 字段时 connector 静默返回空数组（未 report_failed_account），refresh-service 把零观测成功返回写成 `ready + items:[]`，runtime-store 清空 → 主面板无 MetricRecord。
- 修复（t039，done）：connector 零有效字段时 `report_failed_account`；refresh-service 零观测（无论是否 report_failed_account）不写 ready+空，有历史保留 prior、无历史标 failed。

## Kimi 多账号中失败账号未在主面板展示

- 报告时间：2026-07-22。
- 现象：Kimi 配置两个账号，一个采集成功、一个采集失败；主面板仅显示成功账号，失败账号完全消失。
- 期望：所有已配置账号均须出现在主面板；采集失败账号保留账号行并明确显示失败状态与错误信息，不得因无有效 metric 被过滤。
- 关联：可能与"e2e badge 展开按钮 timeout"及"T029 connector 脚本 per-account error 改进"相关，但本条记录用户可见账号被隐藏问题，根因需独立确认。
- 根因：主面板账号列表只从 `snapshot.items`（MetricRecord）构建；首次采集即失败的直连账号无 observation → 无 MetricRecord → 无账号行。已有 stale error 机制（T026-T029）只覆盖曾成功过的账号。
- 修复（t040，done）：`build_provider_usage_groups` 对 enabled 直连（非 gateway）failed 且零 items 的 connector 合成失败账号占位（`periods:[]` + `error`）；CPA/有 items 不合成。

## 网页端数据不实时刷新，桌面端正常

- 报告时间：2026-07-22。
- 现象：同一应用，桌面端运行时用量数据可实时刷新；网页端（浏览器访问 LocalAPI 面板）用量主面板数据不实时刷新，首次加载后冻结。
- 期望：网页端与桌面端刷新行为一致，数据变化应同等呈现。
- 根因：web 端 `src/web/usageboard-web.ts` 的 `event.onStateChange` 为 no-op，而用量主面板数据 hook `use_plugins()` 仅靠该推送更新 connector 快照、自身无轮询；web 端仅 tokenStats 有 10s 轮询，connector/用量面板无任何刷新机制。桌面端靠 IPC 推送（runtimeStore.subscribe → `EVENT_STATE_CHANGE` → webContents.send）实时。
- 修复（t042，done）：LocalAPI 加 `GET /v1/events` SSE 端点（复用 `connector_deps.runtimeStore.subscribe`，与桌面端同一事件源）；`usageboard-web.ts` 的 `onStateChange` 改用 `EventSource` 订阅，推送语义对齐桌面端 IPC。
