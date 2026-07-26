---
tid: t121
slug: add_account_manifest_catalog
diff_anchor: "931bfa135fe683235745ee9070a1d1891995acce"
branch: t121_add_account_manifest_catalog
---

# Task t121_add_account_manifest_catalog

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

只记有追溯价值的进展、踩坑、中途决策、偏离 plan、关键验证；不写命令流水账。

- Step 1-4：catalog IPC + createInstance IPC + AddAccountDialog catalog 驱动 + SettingsView 改 createInstance。typecheck 过，全量测试 1749/1749 绿。
- Step 5 双审 Round 1：code FAIL（5 finding，f001 违反 AC4 参数落盘）、test FAIL（7 finding，f001/f002 恒真断言）。
- Step 6 处置后回 Step 3 修代码与测试，再进 Step 4。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 解决不了；满轮后进 blocked，在「遗留」与口头报告中列出
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

### Round 1 零 finding

两轴均 0 finding 时写：「Round 1 零 finding，未进处置表。」不必建表。

### Round N (YYYY-MM-DD HH:MM UTC+8)

（有 finding 时用本表；每条 finding 一行。）

### Round 1 (2026-07-26 11:30 UTC+8)

| finding_id     | severity  | status | rationale                                                                   | fix_ref                                          |
| -------------- | --------- | ------ | --------------------------------------------------------------------------- | ------------------------------------------------ |
| t121_code_f001 | important | 已修   | savePluginSettings 改合并 parameterValues，保留 createInstance 写入的默认值 | src/renderer/views/SettingsView.tsx              |
| t121_code_f002 | minor     | 已修   | find_vendor 两阶段查找：先 manifest_id 精确，再 supported_providers         | src/renderer/components/AddAccountDialog.tsx     |
| t121_code_f003 | minor     | 已修   | 删除 metadata ?? { name } 不可达兜底                                        | src/main/ipc/connector-ipc.ts                    |
| t121_code_f004 | minor     | 已修   | find_vendor 显式返回 manifest_id，不再隐式经 metadata.name                  | src/renderer/components/AddAccountDialog.tsx     |
| t121_code_f005 | important | 遗留   | SettingsView 2345 行过大；本 task 不拆，收尾报告记拆分计划                  | —                                                |
| t121_test_f001 | important | 已修   | catalog secret 测试改为在 config.plugins 放真实 secret 值再断言不泄漏       | tests/unit/ipc/connector-ipc.test.ts             |
| t121_test_f002 | important | 已修   | catalog 测试显式构造 removedConnectorIds 墓碑，断言仍返回                   | tests/unit/ipc/connector-ipc.test.ts             |
| t121_test_f003 | minor     | 已修   | 补 manualDefault=true 分支测试                                              | tests/unit/ipc/config-ipc.test.ts                |
| t121_test_f004 | minor     | 已修   | createInstance 测试改用独立 secretsStore stub，避免复用 claude 实例 mock    | tests/unit/ipc/config-ipc.test.ts                |
| t121_test_f005 | important | 已修   | settings_view 第二测试改名 + 断言 createInstance 仅调一次入参 cpa           | tests/unit/renderer/views/settings_view.test.tsx |
| t121_test_f006 | minor     | 遗留   | on_save secrets 断言已覆盖 secret_name 端到端；表单层 aria 断言增益有限     | —                                                |
| t121_test_f007 | minor     | 已修   | popup_view 三处 createInstance mock 补 mockResolvedValue 与风格一致         | tests/unit/renderer/views/popup_view\*.test.tsx  |

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep {tid}` 查，不在此记。

### 验收标准勾选

- [x] 存在一条不依赖 `config.plugins` 的 catalog 通道，能列出全部已发现连接器的 manifest id、auth descriptor 与 provider，且 manifest id 在 `removedConnectorIds` 中时仍然返回。
- [x] `resolve_auth_method` 对 catalog 中存在 auth descriptor 的连接器返回 manifest 声明值；对 catalog 中不存在的 vendor 仍返回 `"apikey"` 兜底。
- [x] 在 `config.plugins` 为空且 `removedConnectorIds` 含全部四个 id 的前提下，添加对话框对 grok 渲染 `OAuthDeviceForm`、exa 渲染 `ExaServiceKeyForm`（两个必填密钥输入框）、opencode_go 渲染 `WebLoginForm`、cpa 渲染 `CpaMgmtForm`（含必填接口地址）。
- [x] 上述前提下完成任一 vendor 的添加流程后，`config.plugins` 中出现该 manifest 对应的新实例，且 `executablePath` 指向该 manifest 目录、参数与密钥正确落盘。
- [x] 添加某 vendor 后，`config.removedConnectorIds` 不再包含该 manifest id；其他 id 保持不变。
- [x] 墓碑对自动 seed 的抑制行为不变：未经用户主动添加时，重启不复活墓碑内连接器（既有 `tests/unit/main/core/config/auto-seed.test.ts` 与 `tests/e2e/electron/auto_seed.spec.ts` 保持通过）。
- [x] `pnpm test` 全绿。

### Reviewer verdict

- Round 1 code：FAIL
- Round 1 test：FAIL
- Round 2 code：PASS
- Round 2 test：PASS

### 遗留

- `t121_code_f005`：`SettingsView.tsx` 2345 行超 800 行 important 阈值；本 task 不拆，后续 task 抽出 `AccountDialogHost` / `useConnectorCatalog` / `useAccountDialogState`。
- `t121_test_f006`：`OAuthDeviceForm` 表单层未断言 secret_name 绑定到内部 input；on_save secrets 断言已覆盖端到端 secret_name 流向，增益有限。

### 结果摘要

- 新增 `connector:catalog` + `config:createInstance` 两条 IPC，添加账号流程按 manifest catalog 解析 auth 并直接建实例，绕过墓碑；grok/exa/opencode_go/cpa 四表单在无实例+墓碑场景下正确渲染。
