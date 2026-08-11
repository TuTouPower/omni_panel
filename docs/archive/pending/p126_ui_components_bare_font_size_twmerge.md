# p126 ui 组件库多组件裸自定义字号类被 tailwind-merge 吞色

- 来源：t298 实施顺手发现
- 内容：d032 机制（tailwind-merge 误判自定义字号 token 为颜色类吞掉 `text-[var(--color-*)]`）在 ui 组件库多组件仍存在。受影响的典型位点：`Input`/`SecretInput`/`Textarea`/`Select`/`PanelTitleBar` 等 `cn()` base 内 `text-body-md` 与 `text-[var(--color-on-*)]` 并存；`ListRow` 的 subtitle div（`text-body-sm` + 颜色类，根 cn() 无字号）；`SessionRow`/`SessionCard`/`SessionPane`/`SessionLibrary`/`RecentSessionsModal`/`SessionShell`/`SessionRail` 等会话侧组件同模式。修法同 Button：自定义字号一律 `text-[length:var(--text-*)]`。
- 处理：t302
