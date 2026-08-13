# p149 设置侧铃铛斜杠测试覆盖补全

- 来源：t333 遗留（t333_gen_f002，minor）
- 内容：t333 给设置侧两处铃铛（SettingsForm + LabelMapDialog）未监控状态加斜杠（bell_off）。组件层斜杠断言只覆盖 SettingsForm 内嵌路径（settings_view_watched.test.tsx 两用例 = AC-001）；AC-002（LabelMapDialog 对话框路径）仅靠 e2e cpa_label_map_watch.spec.ts 兜底，label_map_dialog.test.tsx / settings_view_cpa.test.tsx 未加 data-slash 断言；SettingsForm 路径的 AC-004「斜杠随切换即时更新」无组件测试（mock 不更新 watched props）。建议后续在 label_map_dialog.test.tsx 直接渲染 LabelMapDialog 并断言未监控/已监控 data-slash 显隐，补齐组件层覆盖。
- 处理：未开
