---
tid: "t108"
slug: "auth_flow_registry"
title: "auth flow registry 替代 VENDOR_AUTH_MAP"
status: "done"
branch: "t108_auth_flow_registry"
worktree: ""
review_level: "full"
diff_anchor: "593654c420c53787556bf88ab7ce9ef2c370ae5d"
depends_on: ""
conflicts_with: ""
schedule_status: ""
note: ""
---

# Task t108_auth_flow_registry

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

只记有追溯价值的进展、踩坑、中途决策、偏离 plan、关键验证；不写命令流水账。

- 2026-07-25 start。分支 `t108_auth_flow_registry`，diff_anchor `593654c`。
- 实现：
    - 新建 `src/renderer/lib/auth-flow-registry.ts`：导出 `resolve_auth_method` / `resolve_auth_descriptor` / `fallback_secret_name` 与 `ResolvedAuthMethod`。
    - 改写 `src/renderer/components/AddAccountDialog.tsx`：删除 `VENDOR_AUTH_MAP`、`AUTH_APIKEY_META`、`AUTH_SESSION_META`、`OPENCODE_GO_COOKIE_SCRIPT`；按 descriptor/source 路由子表单；`web_login`/`oauth_device`/`cpa_mgmt` 渲染占位；apikey/session/local_cli 走现有表单。
    - 简化 `ProviderCard.tsx`：移除对 `VENDOR_AUTH_MAP` 的依赖，统一显示「凭证失效」。
    - 更新 `docs/blueprint/architecture.md` 跨模块契约说明。
- 测试：新增 `tests/unit/renderer/lib/auth-flow-registry.test.ts`；重写 `tests/unit/renderer/components/add_account_dialog.test.tsx` 为 descriptor 驱动断言。
- 回归：`pnpm test` 160 files / 1660 tests 通过；`pnpm typecheck` 通过。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 解决不了；满轮后进 blocked，在「遗留」与口头报告中列出
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

### Round 1 (2026-07-25 16:15 UTC+8)

| finding_id     | severity  | status | rationale                                                                               | fix_ref                                                    |
| -------------- | --------- | ------ | --------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| t108_code_f001 | important | 已修   | placeholder auth method 仍允许保存空账号；在 `handle_save` 提前 return 并禁用主按钮     | src/renderer/components/AddAccountDialog.tsx               |
| t108_code_f002 | minor     | 已修   | CPA 查找可能误选非 CPA gateway；改为优先匹配 `metadata.name === "cpa"`                  | src/renderer/components/AddAccountDialog.tsx               |
| t108_code_f003 | minor     | 已修   | `AuthMethod` 遮蔽共享 schema 同名类型；删除本地别名，统一使用 `ResolvedAuthMethod`      | src/renderer/components/AddAccountDialog.tsx               |
| t108_test_f001 | important | 已修   | 未覆盖 `gateway` source 回退；新增对应单测                                              | tests/unit/renderer/lib/auth-flow-registry.test.ts         |
| t108_test_f002 | important | 已修   | 未直接覆盖 `cpa_mgmt` descriptor 分支；新增对应单测                                     | tests/unit/renderer/lib/auth-flow-registry.test.ts         |
| t108_test_f003 | important | 已修   | 未覆盖 `local_cli` 子表单渲染；新增本地扫描表单断言                                     | tests/unit/renderer/components/add_account_dialog.test.tsx |
| t108_test_f004 | minor     | 已修   | 静态源码正则检查不属于行为测试；删除该用例                                              | tests/unit/renderer/components/add_account_dialog.test.tsx |
| t108_test_f005 | minor     | 已修   | 测试标题提到已不存在的 `has_cpa` prop；改为 `shows CPA Manager button in vendor picker` | tests/unit/renderer/components/add_account_dialog.test.tsx |
| t108_test_f006 | minor     | 已修   | 用 `className` 判断启用状态脆弱；改用 `toBeEnabled()`                                   | tests/unit/renderer/components/add_account_dialog.test.tsx |

### Round 2 (2026-07-25 16:16 UTC+8)

Round 2 零 finding，未进处置表。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t108` 查，不在此记。

### 验收标准勾选

- [x] `auth-flow-registry.ts` 单测覆盖所有 method 分支与 fallback。
- [x] `AddAccountDialog.tsx` 删除 `VENDOR_AUTH_MAP`，按 descriptor 渲染子表单。
- [x] `pnpm test` 全绿；`pnpm typecheck` 通过。

### Reviewer verdict

- Round 1 code：FAIL → 已修
- Round 1 test：FAIL → 已修
- Round 2 code：PASS
- Round 2 test：PASS

### 遗留

- 无

### 结果摘要

- `auth-flow-registry.ts` 已落地：descriptor 优先、source 回退、fallback secret name。
- `AddAccountDialog.tsx` 已删除硬编码映射，按解析结果路由 apikey/session/local_cli 表单，web_login/oauth_device/cpa_mgmt 渲染占位并禁用保存。
- `ProviderCard.tsx` 移除 `VENDOR_AUTH_MAP` 依赖。
- 文档 `architecture.md` 已同步。
- 单测覆盖全部 method 与回退分支；全量测试 160 files / 1663 tests 通过。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t108` 查，不在此记。

### 验收标准勾选

- [ ] `auth-flow-registry.ts` 单测覆盖所有 method 分支与 fallback。
- [ ] `AddAccountDialog.tsx` 删除 `VENDOR_AUTH_MAP`，按 descriptor 渲染子表单。
- [ ] `pnpm test` 全绿；`pnpm typecheck` 通过。

### Reviewer verdict

- Round 1 code：PASS / FAIL
- Round 1 test：PASS / FAIL
- Round 2 code：N/A / PASS / FAIL
- Round 2 test：N/A / PASS / FAIL

### 遗留

- 无

### 结果摘要

- {一句话；无额外说明可写「见上」}
