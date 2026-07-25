---
tid: t110
slug: fix_add_account_wiring
diff_anchor: "12fea92b6624ecdc563580667609f77df9b8e239"
branch: t110_fix_add_account_wiring
---

# Task t110_fix_add_account_wiring

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

只记有追溯价值的进展、踩坑、中途决策、偏离 plan、关键验证；不写命令流水账。

- 双审 Round 1/2 的 finding 已全部修复，`pnpm test` 1685 绿、`pnpm test:e2e:electron tests/e2e/electron/add_account.spec.ts` 4 个测试绿、`pnpm typecheck`/`pnpm lint` 通过。
- 已达默认双审轮次上限（max_review_round=2），Round 2 两份 review verdict 仍为 FAIL（各有 1 条新 finding，已修复）。按工作流转为 blocked，等待用户决定加轮或 dropped。
- 用户决定：所有 task 双审轮次上限提升到 5，恢复 goal 模式继续推进。`max_review_round` 更新为 5。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 解决不了；满轮后进 blocked，在「遗留」与口头报告中列出
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

### Round 1 (2026-07-25 18:35 UTC+8)

| finding_id     | severity  | status | rationale                                                       | fix_ref                                                        |
| -------------- | --------- | ------ | --------------------------------------------------------------- | -------------------------------------------------------------- |
| t110_code_f001 | important | 已修   | 删除 name/provider 启发式回退，仅按 source_instance_id 精确匹配 | src/renderer/views/SettingsView.tsx:2118                       |
| t110_code_f002 | important | 已修   | 复用 savePluginSettings，新增 base_config 参数避免闭包覆盖      | src/renderer/views/SettingsView.tsx:957, 2135                  |
| t110_code_f003 | minor     | 已修   | ExaServiceKeyForm 渲染条件收窄为 exa 专属                       | src/renderer/components/AddAccountDialog.tsx:300               |
| t110_code_f004 | minor     | 已修   | configRef 改在 useEffect 中同步                                 | src/renderer/views/SettingsView.tsx:733                        |
| t110_code_f005 | minor     | 已修   | 回退 config-store 范围外日志增强                                | src/main/core/config/config-store.ts:171                       |
| t110_test_f001 | minor     | 已修   | 重命名 CPA 测试以反映 CpaMgmtForm 行为                          | tests/unit/renderer/components/add_account_dialog.test.tsx:262 |

### Round 2 (2026-07-25 18:40 UTC+8)

| finding_id     | severity  | status | rationale                                                      | fix_ref                                                             |
| -------------- | --------- | ------ | -------------------------------------------------------------- | ------------------------------------------------------------------- |
| t110_code_f006 | minor     | 已修   | form_handles_save 与 ExaServiceKeyForm 渲染条件对齐为 exa 专属 | src/renderer/components/AddAccountDialog.tsx:102                    |
| t110_test_f002 | important | 已修   | exa/cpa 保存测试追加 source_instance_id 透传断言               | tests/unit/renderer/components/add_account_dialog.test.tsx:111, 285 |

### Round 3 (2026-07-25 22:47 UTC+8)

| finding_id     | severity  | status | rationale                                                                                                        | fix_ref                                                                           |
| -------------- | --------- | ------ | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| t110_test_f003 | important | 已修   | AddAccountDialog 其余保存路径（apikey/session/oauth_device/web_login/local_cli）追加 source_instance_id 透传断言 | tests/unit/renderer/components/add_account_dialog.test.tsx:70, 156, 203, 240, 333 |

### Round N (YYYY-MM-DD HH:MM UTC+8)

（有 finding 时用本表；每条 finding 一行。）

| finding_id     | severity                 | status | rationale | fix_ref   |
| -------------- | ------------------------ | ------ | --------- | --------- |
| t110_code_f001 | critical/important/minor | 已修   | {一句话}  | {文件:行} |

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t110` 查，不在此记。

### 验收标准勾选

- [x] cpa 添加账号时显示 `CpaMgmtForm`，保存后新账号为 cpa 厂商，非 deepseek。
- [x] exa 添加账号时显示 `SERVICE_KEY` + `API_KEY_ID` 双字段，保存后 connector 启动不抛错。
- [x] 所有厂商添加账号后 `displayName` 为用户输入的备注，非空。
- [x] E2E 四个厂商添加流程通过。
- [x] `pnpm test` 全绿；`pnpm typecheck` 通过。

### Reviewer verdict

- Round 1 code：FAIL
- Round 1 test：FAIL
- Round 2 code：FAIL
- Round 2 test：FAIL
- Round 3 code：PASS
- Round 3 test：FAIL
- Round 4 code：PASS
- Round 4 test：PASS

### 遗留

- 无

### 结果摘要

- 修复 SettingsView source 查找为 `source_instance_id` 精确匹配，复用 savePluginSettings 写入新账号参数；AddAccountDialog 接线 cpa_mgmt/exa 专属表单；E2E 四厂商流程与单元测试覆盖透传参数；双审 Round 4 两轴均 PASS。
