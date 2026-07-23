# 已知待修问题

## T029 connector 脚本 per-account error 改进

- 现状：`observation_to_metric_record` 已映射 `last_error`（T028）。refresh-service 已记 stale `last_error`。但 connector 脚本多用 `throw`（整体 failed），不调 `ctx.report_failed_account(...)` per-account。
- 需改：connector 脚本 per-account catch → `ctx.report_failed_account(provider, account_id, account_label, error)` + continue。
- 工作量：中等，分 connector 迁移。
- 关联 task：t084（connector per-account error 迁移）。
- t059 已对 cpa/mimo/minimax 空响应加 report_failed_account；本条扩展到 per-account catch（多账号 connector 如 CPA 逐 auth_file）。

## OpenCode Go 添加账号无弹窗

- 报告时间：2026-07-24。
- 现象：设置 > 账号 > 添加账号 > 选择 OpenCode Go，点击后无弹窗（应有登录流程或 cookie 输入）。
- 需确认：openCode Go connector 是 session 型（cookie），添加流程应触发登录弹窗或 cookie 输入框；可能 AddAccountDialog 对 session 型 connector 的分支缺失或 opencode_go 未在 ADD_COMMON_SERVICES 以外单独处理。
- 关联：connectors/opencode_go/manifest.json capabilities=["session"]；AddAccountDialog 组件。

## 用量条监控重置按钮仅 Tavily 有，其他厂商缺失

- 报告时间：2026-07-24。
- 现象：用量面板 Tavily 账号的用量条有监控重置（bell）按钮，其他所有厂商账号都没有。
- 期望：所有厂商所有账号的用量条都应有监控重置按钮，统一放在刷新时间后面同一行。
- 现状：tavily 的 bell 按钮放到了第二行（应与刷新时间同行）。
- 关联：t043（metric 级监控开关）+ t046（bell 透传 ProviderAccountRow → UsageBarList）+ t048（设置页 bell）。bell 透传链可能有条件分支导致仅部分厂商渲染。

## 添加账号弹窗前出现黑色横线

- 报告时间：2026-07-24。
- 现象：设置 > 账号 > 添加账号时，弹窗出现前先闪现一条黑色横线。
- 猜测：AddAccountDialog 或其父容器的 CSS border/transition 在 dialog 打开瞬间渲染了一帧 border/border-top/border-bottom 但内容尚未渲染。
- 关联：src/renderer/components/AddAccountDialog.tsx；可能 dialog container CSS border 在 animation/render 首帧可见。
