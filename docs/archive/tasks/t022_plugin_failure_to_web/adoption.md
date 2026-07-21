# Adoption T022

逐条处置 review_code + review_test finding。

| finding_id     | decision | rationale                                                                                  | status   |
| -------------- | -------- | ------------------------------------------------------------------------------------------ | -------- |
| T022_code_f001 | 采纳     | spec 范围/验收 drift（手造 items=[] vs 实际 real KIMI stale）                              | 已修     |
| T022_code_f002 | 采纳     | spec 注释 drift（GLM 缺 secret vs KIMI 401 stale）                                         | 已修     |
| T022_test_f001 | 不采纳   | L182 pure failed vs L210 stale banner 是 SPA 实现细节，e2e 测 DOM `.card-state.err` 覆盖够 | 无需修改 |
| T022_test_f002 | 采纳     | retry `if(count>0)` 守卫弱化；KIMI 401 非 auth 必有 retry，去 if 直接断言                  | 已修     |
| T022_test_f003 | 遗留     | crash 路径无 integration 单测，超 T022 e2e 范围                                            | 遗留     |
| T022_test_f004 | 采纳     | multi_account skip 注释 stale（synthetic T022 加 KIMI 后不再 skip），改注释                | 已修     |

## 处置说明

- code_f001/f002：T022 spec.md 范围/验收/背景对齐实际（real KIMI 401 stale，非手造 items=[]）；plugin_failure web spec 注释改 KIMI 401 stale。
- test_f002：plugin_failure case 2 retry 去 `if(count>0)` 守卫，直接 `await expect(retry).toBeVisible()`（KIMI 401 非 auth，onRefresh 条件成立必渲染重试）。
- test_f004：multi_account skip 注释删"synthetic 无"（T022 加 KIMI 后 synthetic 有，skip 守卫留防御但不触发）。popup_card_states 注释 prettier 改过未修（drift 不阻塞）。
- test_f001：L182（isFailed pure）vs L210（stale banner）都渲染 `.card-state.err`，e2e DOM 层覆盖；pure 分支（enabled+failed+items=[]）real 无数据，留 SPA 单测范围。
- test_f003：crash（非零 exit）路径 connector 单测，超 T022 e2e 范围，遗留。
