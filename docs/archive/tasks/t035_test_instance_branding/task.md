---
tid: t035
slug: test_instance_branding
diff_anchor: "3118b44"
branch: t035_test_instance_branding
---

# Task t035_test_instance_branding

过程总账。

## 过程记录

- start:test 已存在（t030 前置），本 task 加品牌隔离（黄图标 + 端口）。
- diff_anchor = 3118b44（main HEAD）。

## Review 处置

（收尾填）

## 收尾报告

SHA 由 `git log --grep t035` 查。

### 验收标准勾选

- [x] pnpm icons:test 生成 icon-test.png(1024) + icon-test.ico + tray-icon-test.png(64)
- [x] TEST*INSTANCE=1 时 paths.ts 返回 *-test.\_ 资源（窗口/托盘黄色）
- [x] OMNI_USAGE_PORT=17864 时 local-api 监听 17864（启动日志确认）
- [x] start:test 启动 TEST_INSTANCE=1 + 17864
- [x] 正常 start 不受影响（无 env，蓝图标 + 17863）
- [x] pnpm test 1432 绿 + typecheck + check 全绿

### Reviewer verdict

- 增强功能，未走双审。

### 遗留

- 两个 dev 实例同时 out/ 编译冲突未处理（同时启动建议：正常打包 exe 占 17863 + 测试 dev 占 17864）。

### 结果摘要

测试实例品牌隔离：黄色图标（logo-test.svg → icon-test/tray-icon-test.png + ico）+ local-api 端口 17864（OMNI_USAGE_PORT env）。start:test 自动设 TEST_INSTANCE=1 + OMNI_USAGE_PORT=17864，与正常实例（蓝图标 17863）同时启动不撞端口。
