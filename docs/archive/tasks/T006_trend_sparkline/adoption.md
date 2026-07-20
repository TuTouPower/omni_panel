# Adoption T006

逐条处置 `review_code.md` 和 `review_test.md` 的 finding。流程见 AGENTS.md step 7。

| finding_id     | decision | rationale                                                                         | status   |
| -------------- | -------- | --------------------------------------------------------------------------------- | -------- |
| T006_code_f001 | 采纳     | log.md 与实现脱节阻塞追溯,补完整记录                                              | 已修     |
| T006_code_f002 | 采纳     | spec/plan 落位分歧需在 log 留痕,避免读者按 spec 找不到                            | 已修     |
| T006_code_f003 | 采纳     | 不读 display_style 是有意设计,补注释 + 对照用例锁死                               | 已修     |
| T006_code_f004 | 采纳     | IPC/local-api 对 days 容错对齐,Math.floor 统一                                    | 已修     |
| T006_code_f005 | 采纳     | cache key 分隔符脆弱,改 `\|\|` 避免 metricId 含 `:` 碰撞                          | 已修     |
| T006_code_f006 | 采纳     | 与 test_f001 合并,补 ProviderAccountRow 集成测试                                  | 已修     |
| T006_test_f001 | 采纳     | spec 验收 #3/#4 核心交互必须直接测试覆盖                                          | 已修     |
| T006_test_f002 | 采纳     | 全局 mock 遗漏 trend 导致集成测假绿,优先修                                        | 已修     |
| T006_test_f003 | 采纳     | 与 code_f003 合并,加 percent 型对照用例                                           | 已修     |
| T006_test_f004 | 采纳     | EXPLAIN 空表脆弱,seed 1 条 + 收紧正则                                             | 已修     |
| T006_test_f005 | 不采纳   | 现有模式不单测 handler,trend-ipc 复用 store 层覆盖;独立测 ROI 低,留作 polish 建议 | 无需修改 |
| T006_test_f006 | 采纳     | 加一行 disabled_api noop 断言锁契约                                               | 已修     |

字段说明：

- `decision`：采纳 / 不采纳。
- `rationale`：一句话理由；`遗留` 项在此写未修原因。
- `status`：
    - `已修`：在本 task commit 内修复。
    - `遗留`：未在本 commit 修复。
    - `无需修改`：不采纳项专用。
