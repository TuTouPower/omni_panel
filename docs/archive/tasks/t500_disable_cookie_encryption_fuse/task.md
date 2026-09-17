---
tid: "t500"
slug: "disable_cookie_encryption_fuse"
title: "关闭打包 Cookie 加密 fuse，启动不再访问钥匙串"
status: "done"
branch: "t500_disable_cookie_encryption_fuse"
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: "8bf9a9e28f6bb25796a42a260752be160d6c938b"
depends_on: ""
conflicts_with: ""
note: "来源 p249；用户要求删除 Chromium Cookie 钥匙串加密。cookie 登录本身保留。"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。
创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

1. 遵循 TDD 原则，新增 `tests/unit/electron_builder_fuses.test.ts` 断言 `electron-builder.yml` 与 `electron-builder.test.yml` 中的 `electronFuses.enableCookieEncryption` 必须为 `false`，且提供逻辑验证当配置为 `true` 时断言拒绝；首跑测试红灯（两项断言失败）。
2. 修改 `electron-builder.yml` 与 `electron-builder.test.yml`，将 `electronFuses.enableCookieEncryption` 改为 `false`；重新运行测试全绿（通过）。
3. 验证既有 `tests/unit/session/session-manager.test.ts`，确认 `persist:session-login:*` 分区读写及捕获路径完备无损。
4. 运行全量静态门禁与测试，`pnpm typecheck`、`pnpm lint`、`pnpm deadcode`、`pnpm arch`、`pnpm format:check`、`git diff --check` 全部通过。
5. 按照项目干扰分级，无窗口测试已通过；真实打包与冷启动验证（AC-004 `[deploy]`）按约束交由用户本机测试。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round 1 (2026-09-18 02:42 UTC+8)

Round 1 零 finding。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`pnpm test`（317 个测试文件全绿）、`pnpm check`（typecheck + lint + deadcode + arch + format:check 全绿）
- 黑盒：自动化测试断言打包配置 fuse 为 false 且防篡改；session partition 自动化测试通过；AC-004 `[deploy]` 写入 handoff 由用户本机验证
- review：full 级 PASS（`review_code.md` PASS、`review_test.md` PASS，Round 1 零 finding）
- AC 证据：见 `handoff.json`

### 结果摘要

- AC-001：`electron-builder.yml` 与 `electron-builder.test.yml` 中的 `electronFuses.enableCookieEncryption` 均已置为 `false`。
- AC-002：`tests/unit/electron_builder_fuses.test.ts` 自动化测试读取两份配置并断言为 `false`，且验证改回 `true` 时测试失败。
- AC-003：持久化 session partition `persist:session-login:*` 读写链路未变动，既有 cookie 登录测试全部绿灯。
- AC-004：打包启动免钥匙串弹窗标记为 `[deploy]`，待用户本机打包验证。
- 未改动任何 Vault 逻辑、未改动代码签名逻辑。
