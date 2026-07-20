# Adoption T005

逐条处置 `review_code.md` 和 `review_test.md` 的 finding。流程见 AGENTS.md step 7。

| finding_id     | decision | rationale                                                                                                   | status                         |
| -------------- | -------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------ | ---- |
| T005_code_f001 | 采纳     | log.md 未更新,finalization 填实现/黑盒/review/adoption 记录                                                 | 已修                           |
| T005_code_f002 | 采纳     | querySelector(".scroll") 绕既有 ref 模式;加 scroll_ref 挂 live .scroll,对齐 tabsRef/content_mirror_ref 模式 | 已修                           |
| T005_code_f003 | 采纳     | Row key 末尾拼 index 削弱 reconciliation;改 `${accountId}:${metricLabel}:${resetAt}` 稳定 key               | 已修                           |
| T005_code_f004 | 采纳     | Banner 空态卡片缺 aria-label;补 `aria-label="即将重置"` 与 CollapsibleCard 语义齐                           | 已修                           |
| T005_code_f005 | 不采纳   | 视觉快照 test:visual 需 Electron GUI,本地 headless 跑不动                                                   | 遗留                           |
| T005_code_f006 | 采纳     | rail max-height 40px magic number;加注释说明 offset 来源                                                    | 已修                           |
| T005_test_f001 | 采纳     | 行点击滚动回顶零覆盖;补 scrollTo spy 单测                                                                   | 已修                           |
| T005_test_f002 | 采纳     | PopupView 装配结构无回归保护;补集成测试(.overview-row + .upcoming-banner + .upcoming-rail DOM)              | 已修                           |
| T005_test_f003 | 采纳     | rail format_reset_time 断言过弱(仅反向);加正向格式断言 `/今天 \d{2}:\d{2}                                   | \d{1,2}\/\d{1,2} \d{2}:\d{2}/` | 已修 |
| T005_test_f004 | 不采纳   | 视觉快照本环境无法验证(GUI/Electron)                                                                        | 遗留                           |
| T005_test_f005 | 不采纳   | @container 两档形态 jsdom 不支持容器查询,需 Playwright 视觉验证                                             | 遗留                           |
| T005_test_f006 | 采纳     | provider 图标渲染未断言;补 .ur-row .vicon DOM 断言                                                          | 已修                           |

## Round 1 (2026-07-20 23:50 UTC+8)

- 9 项采纳当场修:log 填、scroll_ref、Row 稳定 key、Banner aria-label、rail max-height 注释、4 项测试增强(滚动回顶 / 装配集成 / format_reset_time 正向 / VendorMark 断言)
- 3 项遗留(GUI 限制):test:visual + test:packaged 需 Electron GUI 人工签收;@container 两档 jsdom 不可测,需 Playwright
- 重跑黑盒:`pnpm test` 1372 全绿(含 adoption 新增/增强测试)

## 附:review_test agent 误删未跟踪截图

review_test agent 在评审过程误删工作区未跟踪文件 `PixPin_2026-07-20_22-43-54.png`(违反只读约定,agent 自承)。与本 task 产出无关,记录在此备追溯;需用户重生成或找回。
