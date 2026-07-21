# Task plan

## 步骤与验证

1. 建 electron-builder.test.yml（productName/appId/icon/extraResources 映射同名/output 分目录） -> 验证：yml 语法
2. src/main/core/paths.ts 加 is_test_build()（读 app.getName） -> 验证：typecheck
3. local-api server.ts: is_test_build 时默认端口 17864 -> 验证：typecheck
4. package.json: make:test:win/mac/linux + make:test -> 验证：pnpm make:test:win --help 可见
5. 打包测试 exe -> 验证：artifacts/test/win-unpacked/OmniUsage Test.exe 存在、PE 图标黄
6. 启动测试 exe -> 验证：日志 local-api 17864 + 托盘黄 + 窗口标题 Test
7. 正常 make:win 不变 -> 验证：artifacts/win-unpacked/OmniUsage.exe 蓝图
8. pnpm test/typecheck 绿

## 风险与回退

- productName 含空格 "OmniUsage Test" 致路径/NSIS 问题 -> 测试用 "OmniUsageTest" 无空格更稳
- appId 不同避免注册表冲突 ✓
- two exe 同时跑需 both 不绑死端口（正常 17863 测试 17864） ✓
- extraResources 同名映射：icon-test.png -> icon.png，paths.ts 零改动 ✓
- 回退：分支可丢弃，yml 独立文件不影响正常配置

## Finalization 时更新的 blueprint

- 无（打包辅助）
