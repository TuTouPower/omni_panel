# Task report T005

本报告所在 commit 即 task commit,SHA 由 `git log --grep T005` 查,不在此记录。

## spec 验收标准勾选

- [x] `collect_upcoming_resets` 单测覆盖(13 用例,已合 `5ac7dc2`:空/null/>horizon/=now/=now+horizon/<now/升序/多 metric/ratio 归一/invalid)
- [x] 横屏(≥1024):rail 在 `.overview-row` 第二列 sticky,标题「即将重置(7 天内)」,行显示 provider 图标 + 账号/metric label + `format_reset_time` 时间 + 百分比(按 sev 配色)
- [x] 竖屏(<1024):banner 手风琴,收起「即将重置 N 项」,展开行列表与 rail 同构(共用 `UpcomingResetRow`)
- [x] 行点击切 provider tab(`setActiveTab`)+ 滚动回顶(`scroll_ref.scrollTo`)
- [x] 无符合条件项两形态显空态文案(Banner 空态独立卡片不渲染空 `.ur-list`)
- [x] `pnpm test` 全绿(1372);PopupView 视觉快照需 `test:visual` 人工签收(本环境 headless 跑不动)

## adoption 处置摘要

- 已修 9 项 / 遗留 3 项 / 无需修改 0 项(review_code 6 + review_test 6 = 12 finding)
- T005_code_f001 - log.md 填记录
- T005_code_f002 - 加 scroll_ref 替代 querySelector(对齐既有 ref 模式)
- T005_code_f003 - Row key 稳定 ID(去 index)
- T005_code_f004 - Banner 空态 aria-label
- T005_code_f006 - rail max-height 注释
- T005_test_f001 - 滚动回顶单测
- T005_test_f002 - PopupView 装配集成测试
- T005_test_f003 - format_reset_time 正向格式断言
- T005_test_f006 - VendorMark DOM 断言
- 遗留 3:f005(test:visual)/ f004(test:packaged)/ f005-test(@container jsdom)

## 遗留问题

- **视觉/打包人工签收**:`pnpm test:visual` + `pnpm test:packaged` 需 Electron GUI,本地 headless 无法跑。rail `<1024 / ≥1024` 两档形态切换、sticky 表现、banner 手风琴交互、PopupView 视觉快照(`popup_ready.png` 等)需人工或 CI 签收。与 T004 视觉快照遗留同源。
- **@container 两档 jsdom 不可测**:容器查询在 jsdom 不支持,形态切换需 Playwright 视觉验证。
- **偏离 spec(合理)**:`UpcomingResetRow` 抽独立共享组件(plan step 3-4 说"抽公共行");Banner 空态不用 CollapsibleCard(避免误导 chevron,契合 spec「不渲染空容器」)。
