# Adoption T016

逐条处置 `review_code.md` 和 `review_test.md` 的 finding。流程见 AGENTS.md step 7。

| finding_id     | decision | rationale                                                                              | status   |
| -------------- | -------- | -------------------------------------------------------------------------------------- | -------- |
| T016_code_f001 | 采纳     | skip 前 count() 时序敏感；改 isVisible(timeout:3000) 探测防 flake                      | 已修     |
| T016_code_f002 | 不采纳   | drag 注释已说明必要；补 electron 差异注释收益低                                        | 无需修改 |
| T016_code_f003 | 采纳     | log 高度测量描述未区分两 spec；澄清                                                    | 已修     |
| T016_code_f004 | 遗留     | CSS attribute selector 未转义（fixture label 无特殊字符，稳定）；改 getByRole 工作量大 | 遗留     |
| T016_test_f001 | 采纳     | multi_account dedup 断言弱化；加 KIMI card toHaveCount(1) 强校验                       | 已修     |

## 处置说明

- **code_f001（触测试）**：`popup_card_states` stale error banner skip 判断改 `isVisible({timeout:3000}).catch(()=>false)`，替代 `count()` 立即判，给渲染缓冲防 slow CI flake。
- **test_f001（触测试）**：`multi_account` case 1 加 KIMI card `toHaveCount(1)` 强校验（锁"3 connector → 1 card"合并语义）；synthetic 无 KIMI 时 skip（real fixture 覆盖）。重跑 real 37 passed / synthetic 34 passed + 3 skipped。
- **code_f003（仅文档）**：log 关键改动点 3 区分 popup_height_debounce（改测量）vs popup_card_collapse_height（沿用 scrollHeight 仅 selector 泛化）。
- **code_f002（无需修改）**：drag `mouse.move({steps:8})` 注释已说明 web 必要；补 electron 差异注释对未来重构指导有限。
- **code_f004（遗留）**：CSS `button[aria-label="...${label}"]` 未转义 `"`/`]`/`\`，当前 fixture label 均邮箱/provider 名无特殊字符，稳定。改 `getByRole({name, exact})` 涉及多 spec 多处，工作量大，留后续 fixture 引入特殊字符时再改。
