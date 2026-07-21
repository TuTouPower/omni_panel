---
tid: t036
slug: test_app_packaging
diff_anchor: "22f3a69"
branch: t036_test_app_packaging
---

# Task t036_test_app_packaging

过程总账。

## 过程记录

- t035 测试实例靠 env 运行时切换，打包 exe 无 env 注入。本 task 建独立测试打包配置（永久两套）。
- productName 定 "OmniUsageTest"（无空格，避 NSIS/路径问题）。
- extraResources 同名映射（icon-test.png -> icon.png），paths.ts 图标逻辑零改动，仅加 is_test_build 判端口。
- diff_anchor = 22f3a69（main HEAD）。

## Review 处置

（收尾填）

## 收尾报告

SHA 由 `git log --grep t036` 查。

### 验收标准勾选

- [x] electron-builder.test.yml 产出 OmniUsageTest.exe（黄 PE 图标，artifacts/test/win-unpacked/）
- [x] 测试 exe 启动：setName=OmniUsageTest、local-api 17864（curl health ok）、userData %APPDATA%/OmniUsageTest 独立
- [x] 单实例锁独立（test.marker + setName 让测试 exe 不被正常实例锁住，两者共存）
- [x] 正常 make:win 不受影响（electron-builder.yml 未改；正常 exe 无 test.marker → is_test_build=false → 不 setName、端口 17863）
- [x] pnpm test 1432 绿 + typecheck + check 全绿

### Reviewer verdict

- 增强功能，未走双审。

### 遗留

- 正常与测试 exe 同时运行需各自独立打包（artifacts/ + artifacts/test/）；dev 同理靠 start:test。

### 结果摘要

两套永久打包配置：electron-builder.yml（正常，蓝图标 17863）+ electron-builder.test.yml（测试，OmniUsageTest 黄图标 17864）。测试 exe 靠 extraResources 的 test.marker 标志 + main 早期 app.setName("OmniUsageTest") 实现锁/userData/端口全隔离，不依赖运行时 env。package.json 加 make:test:{win,mac,linux}。已打包验证 OmniUsageTest.exe 启动 local-api 17864 正常。
