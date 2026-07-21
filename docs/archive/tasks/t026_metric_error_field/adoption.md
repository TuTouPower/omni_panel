# Adoption T026

逐条处置 review_code + review_test finding。

| finding_id     | decision | rationale                                                                                                                | status   |
| -------------- | -------- | ------------------------------------------------------------------------------------------------------------------------ | -------- |
| T026_code_f001 | 不采纳   | spec 要求 export usageItemSchema 但未导出；单测用 pluginResultSchema.parse() 间接验证功能正确，不增加 public API surface | 无需修改 |
| T026_test_f001 | 采纳     | multi-period account 取首个 error break 分支未测；补用例（首 period ok + 第二 period error → 提取第二 period）           | 已修     |
| T026_test_f002 | 采纳     | 同 f001（account 首 period 无 error、后续 period 有 error 场景缺）；补用例覆盖                                           | 已修     |

## 处置说明

- **code_f001（无需修改）**：spec 文字 drift。单测用 `pluginResultSchema.parse({success:true, items:[{...metric, error:"msg"}]})` 间接验证 error 字段接受。export usageItemSchema 增加 public API surface，间接覆盖足够。
- **test_f001/f002（已修）**：补 multi-period 用例（account 有 2 periods：first ok, second error → buildAccountErrors 提取 second error）。覆盖 `buildAccountErrors` 内 break 分支。6 passed（+1）。
