# Task review t495（reviewer_focus: 通用）

- task：`t495_usage_popup_width_persist`
- round：1

reviewed_scope: d20157c292e2ee98

## Findings

Round 1 零 finding。

## 结论

- AC-001：用户拖动改变 usage popup 宽度后触发 `save_popup_width` 保存，隐藏再显示保持该宽度，经单元测试验证通过。PASS。
- AC-002：重启应用后（注入带 `usagePopupWidth` 的配置）首次显示使用上次保存的宽度，schema 正整数校验通过。PASS。
- AC-003：保存与恢复时的宽度均被 clamp 到 `[USAGE_MIN_WIDTH, workArea.width]` 范围。PASS。
- AC-004：当保存的宽度超过当前显示器工作区时，恢复时钳制到屏幕可用最大宽度内。PASS。
- AC-005：配置缺键（旧配置）时安全回退默认宽度（482 / 测试 mock 460），不报错。PASS。
- AC-006：popup 的托盘锚定重新定位及动态高度控制器逻辑未被破坏。PASS。

coverage = 6 / 6

verdict: PASS
