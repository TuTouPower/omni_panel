# Task plan

## 步骤与验证

1. 复制 logo.svg → logo-test.svg，蓝渐变换黄（#FFEB3B/#FFC107/#FF9800 等） → 验证：svg 颜色
2. render-test-icons.mjs（参考 render*icon.mjs，输出 *-test.\_） → 验证：跑生成 3 文件
3. paths.ts 加 TEST*INSTANCE 切资源 → 验证：env 时返回 *-test.\_
4. server.ts 加 OMNI_USAGE_PORT env → 验证：env 时端口覆盖
5. start-test.mjs 设 TEST_INSTANCE=1 + OMNI_USAGE_PORT=17864 → 验证：启动日志
6. package.json 加 icons:test → 验证：pnpm icons:test 生成
7. 手动验证：start:test 黄图标 + 17864；start 蓝图标 + 17863
8. pnpm test/typecheck 绿

## 风险与回退

- 黄色 hex 选择主观 → 选 Amber 色系（#FFC107 主）保辨识度
- ico 生成多尺寸耗时 → 沿用 render_icon ICO_SIZES
- renderer dev 同时 out/ 冲突 → 非本 task 范围，文档说明
- 回退：分支可丢弃

## Finalization 时更新的 blueprint

- 无（测试实例辅助功能）
