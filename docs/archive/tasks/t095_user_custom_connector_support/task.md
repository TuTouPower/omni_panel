---
tid: t095
slug: user_custom_connector_support
diff_anchor: "15a7e27b9e6c90701fbd5630a8739e7180819536"
branch: t095_user_custom_connector_support
---

# Task t095_user_custom_connector_support

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 用户要求：支持在脚本目录自行添加 connector（manifest.json + connector.ts）；需放开 provider schema + 文档。入口按钮见 t094，弹窗结构调整见 t092。
- 双审已达 max_review_round=2（实际 R1/R2/R3 三轮）：R1 三 finding（compare_providers 排序、valid_providers 白名单、fallback 测试）全修；R2 两 finding（observation-mapping JSDoc、plugin-metadata supportedProviders 一致性）全修；R3 一 minor（use_tab_navigation setActiveTab 类型签名半完成）已修。test 侧 R1/R2/R3 均 PASS。因 code R3 出新 finding 触发 max_review_round，blocked 等用户裁决。
- 用户批准加轮：max_review_round=3（计数累计不清零）。开 R4 验证 f005 修复与全 diff 终检。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

### Round 1 (2026-07-24 07:28 UTC+8)

| finding_id     | severity  | status | rationale                                                                                                                                              | fix_ref                                                             |
| -------------- | --------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| t095_code_f001 | important | 已修   | compare_providers 对未知 provider indexOf=-1 返回负数排到开头，违反 spec「未知 provider 排末尾」。改 rank 映射 -1→+∞。                                 | src/renderer/lib/provider-usage.ts compare_providers                |
| t095_code_f002 | minor     | 已修   | PopupView valid_providers 白名单过滤 config.providerOrder，自定义 provider 拖拽位置不持久化。删 valid_providers 过滤，信任 config（残留 prune 兜底）。 | src/renderer/views/PopupView.tsx apply_config/onConfigChange        |
| t095_test_f001 | important | 已修   | 缺 renderer fallback label 测试。补 provider-usage.test.ts 两用例：未知 provider label=provider 名 + 未知 provider 排已知之后。                        | tests/unit/renderer/provider-usage.test.ts custom provider fallback |

### Round 2 (2026-07-24 07:36 UTC+8)

| finding_id     | severity | status | rationale                                                                                                                                                                      | fix_ref                                                  |
| -------------- | -------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| t095_code_f003 | minor    | 已修   | observation-mapping 模块 JSDoc 仍称 "provider validation"，删 safeParse 后误导。改注释为「trust manifest provider，无 enum re-filter」。                                       | src/main/core/scheduler/observation-mapping.ts JSDoc     |
| t095_code_f004 | minor    | 已修   | plugin-metadata supportedProviders 放宽为 z.array(z.string())，比兄弟 schema（connectorProviderSchema regex）宽，违反 snake_case 一致性。改 z.array(connectorProviderSchema)。 | src/shared/schemas/plugin-metadata.ts supportedProviders |

### Round 3 (2026-07-24 07:48 UTC+8)

| finding_id     | severity | status | rationale                                                                                                                                                               | fix_ref                                               |
| -------------- | -------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| t095_code_f005 | minor    | 已修   | use_tab_navigation setActiveTab 类型签名半完成，sed 删 UsageProvider 后联合退化为 \| ("overview")，缺 string 补全。typecheck 因逆变未拦，运行时无影响。补 string 分支。 | src/renderer/hooks/use_tab_navigation.ts setActiveTab |

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t095` 查，不在此记。

### 验收标准勾选

- [x] 用户在 `userData/connectors/my_vendor/` 放 manifest.json + connector.ts，app 启动后自动发现并 seed。
- [x] manifest provider 为任意 snake_case 字符串均被接受。
- [x] renderer 对未知 provider 显示 vendor mark fallback + provider 名作 label。
- [x] 文档 `docs/guides/custom-connector.md` 含完整模板 + 示例。
- [x] `pnpm test` / `pnpm typecheck` / `pnpm lint` 全绿（本 task 文件零 lint，预存 UsageRows/exa 不计）。

### Reviewer verdict

- Round 1 code：FAIL（f001 compare_providers 排序 / f002 valid_providers 白名单）-> 全修
- Round 1 test：FAIL（f001 缺 fallback label 测试）-> 全修
- Round 2 code：FAIL（f003 JSDoc / f004 supportedProviders 一致性）-> 全修
- Round 2 test：PASS
- Round 3 code：FAIL（f005 setActiveTab 类型签名）-> 已修（用户加轮 max=3）
- Round 3 test：PASS
- Round 4 code：PASS（零新发现，终检通过）
- Round 4 test：PASS（零新发现，终检通过）

### 遗留

- 无。残留 `as UsageProvider` cast 均为 pre-existing 渐进迁移风格（CPA monitor 过滤、account-overrides、AddAccountDialog META），运行时无影响，后续可彻底清理。

### 结果摘要

- connectorProviderSchema 从 enum.or(cpa) 改 `z.string().regex(/^[a-z][a-z0-9_]*$/)`；usageItemSchema.provider 同 regex；plugin-metadata supportedProviders 用 connectorProviderSchema 保持一致。
- 删 observation-mapping safeParse（信任 manifest provider，不再 drop）；connector-ipc 非 CPA 分支返回 manifest.provider。
- config.ts 的 Partial<Record<UsageProvider>> 改 Record<string>；provider-usage 派生类型/Map/Set/PROVIDER_LABELS/ORDER 宽化 string，label fallback `?? provider`，compare_providers 未知 provider rank=+∞ 排末尾。
- 组件/hook prop 类型 UsageProvider->string、VendorId->string、ConnectorInfo.activeProviders/supportedProviders 改 readonly string[]；PopupView 删 valid_providers 白名单过滤（自定义 provider 拖拽位置持久化）。
- 测试：manifest-loader 新增、observation-mapping/plugin-output 反转断言、provider-usage fallback 两用例、auth-ipc 去 cast、dot->bracket 机械改写。
- 文档：docs/guides/custom-connector.md（manifest schema + connector.ts 模板 + vm sandbox 约束 + ctx 能力 + 示例）。
