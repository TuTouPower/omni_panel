# Adoption T004

逐条处置 `review_code.md` 和 `review_test.md` 的 finding。流程见 AGENTS.md step 6。

| finding_id     | decision | rationale                                                                                                                     | status |
| -------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------- | ------ |
| T004_code_f001 | 采纳     | drag_rect 多步失效：dragStart 记录的 rect 在 reorder 后过时，多步拖拽 axis 判定退化为垂直 guard（单列语义），不破坏功能       | 遗留   |
| T004_code_f002 | 采纳     | 视觉快照需 Playwright resize BrowserWindow + 跨平台基线，本 task 环境无法跑 test:visual；CSS 文本断言+drag 单测覆盖规则与语义 | 遗留   |
| T004_code_f003 | 采纳     | .overview-grid 加 align-items: start 防同行高度不齐拉伸留白                                                                   | 已修   |
| T004_code_f004 | 采纳     | same_row 是 DOMRect 比较（Math.abs(top 差)<height/2），提取纯函数增抽象但价值低；DOMRect 来自浏览器单测要 mock                | 遗留   |
| T004_test_f001 | 采纳     | 同 code_f002：视觉快照环境限制，靠 CSS 文本断言+drag 单测+后续 test:packaged 兜底                                             | 遗留   |
| T004_test_f002 | 采纳     | AC-2 断言不完整，补 1024 多列 minmax(320px,1fr) 与默认 1fr 断言                                                               | 已修   |
| T004_test_f003 | 采纳     | maxWidth=1400 是配置值，靠 typecheck + 手动验证；单测需 vi.mock("electron")，价值偏低                                         | 遗留   |
| T004_test_f004 | 采纳     | web 版用同一份 globals.css（已被 globals_css 断言覆盖）；mirror 隔离行为侧靠 test:packaged 验证                               | 遗留   |

字段说明：

- `decision`：采纳 / 不采纳。
- `rationale`：一句话理由；`遗留` 项在此写未修原因。
- `status`：
    - `已修`：在本 task commit 内修复。
    - `遗留`：未在本 commit 修复。
    - `无需修改`：不采纳项专用。

遗留汇总（task_report 体现）：

- **T004_code_f001 / f004**：多列拖拽 axis 判定的多步/启发式边界，首次拖拽正确，多步退化到垂直 guard 不破坏功能；后续若强需求横屏排序，另开 task 完整重写 hit-testing（含 ProviderCard data-provider + 实时 rect 查询）。
- **T004_code_f002 / T004_test_f001**：四档宽度视觉快照（test:visual）需 Playwright resize + 跨平台基线，本 task 环境跑不了；CSS 文本断言已覆盖 @container 规则与双列强制，drag-reorder 单测覆盖多列 axis 语义；真实布局行为靠后续 test:packaged 真实启动验证（testing.md「自动化路径通过，packaged 行为未验证」模式）。
- **T004_test_f003**：maxWidth=1400 单测需 mock electron，价值偏低；靠 typecheck + E2E popup_window_constraints 覆盖。
- **T004_test_f004**：web 版同套断点（同一份 globals.css）+ mirror 隔离行为侧，靠 packaged smoke。
