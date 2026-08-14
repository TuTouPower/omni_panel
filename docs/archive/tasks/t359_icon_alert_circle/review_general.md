# Task review t359（reviewer_focus: 通用）

- task：`t359_icon_alert_circle`
- spec：`docs/tasks/t359_icon_alert_circle/spec.md`
- diff_anchor：`ac584e8df1e9bf7da25a11be88c82c27d4a58cf2`
- target：`git diff ac584e8df1e9bf7da25a11be88c82c27d4a58cf2`
- round：1
- reviewed_at：2026-08-14 02:04 UTC+8

## Findings

### t359_gen_f001 - AC-001 直接渲染断言缺失，未按 spec 测试策略写 `<Icon name="alert_circle">` 非空测试

- 严重度：minor
- 锚点：AC-001（可测试性声明「组件测试：渲染 `<Icon name="alert_circle">` 断言 SVG 非空」）
- 位置：`tests/unit/renderer/components/icon.test.tsx:10-65`
- 问题：spec 测试策略明确要求组件测试断言 alert_circle 渲染非空 SVG，但 `Icon` describe 块只覆盖 refresh/gear/close/check/back/chat_square/未注册名，无 alert_circle 直接渲染断言。行为本身正确（alert_circle 已注册 `CircleAlert`，AC-003 守卫断言其 ∈ 注册键且被三处登录段引用；通用渲染测试证明注册 lucide 图标路径非空），故风险低；属 spec 测试策略字面偏差，非行为缺陷。
- 建议：在 `Icon` describe 块补 `<Icon name="alert_circle" />` 断言 `svg` 非空、`innerHTML` 非空（参照 chat_square 用例样式）。

## 结论

- 前轮 finding 复核：无（Round 1）
- 本轮新发现：1 条（minor）
- 未进表的提示：
  - AC-003 引用守卫只扫字面量 `name="…"`，动态 `name={...}`（LabelMapDialog.tsx:282 / SettingsForm.tsx:661 的条件 `bell`/`bell_off`、TrayMenu item.icon、about_section c.icon、SettingsView n.icon）不在其覆盖内；这些由 tsc 收窄兜底（about_section / SettingsView 均 `as const` 派生字面量联合，TrayMenu 字段即 IconName），与 spec 测试策略「静态扫描 `<Icon name="…">` 字面量」一致，非缺口。
  - 守卫键提取正则 `\b([a-z_]+):\s*[A-Z]` 对非 snake_case 新键会静默漏检；但 tsc 收窄仍兜底，且项目约定 snake_case，不判 finding。
- 总体判断：AC-001/002/003 实现正确，name 收窄全仓 tsc 通过（含 TrayMenu、as const 调用点）；守卫测试真实非恒真（used=25>10、registered=49，missing 为空，注入未注册字面量必红）；lucide 来源守卫正则已随 satisfies 写法同步更新。仅有 1 条 minor，无 critical/important。
- 系统性 follow-up：无

verdict: PASS
