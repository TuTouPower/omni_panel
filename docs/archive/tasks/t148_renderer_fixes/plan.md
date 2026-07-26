# Task plan

## 步骤与验证

1. 占位按钮加 disabled + 提示，记录功能待定义 → 验证：渲染测试断言不可点击。
2. token-stats spec 声明独立持久化 → 验证：不宣称主配置同步。
3. noopener、托盘分隔符字段、refresh_providers 声明顺序 → 验证：行为测试与分隔符数量不变。
4. 新增 record_bool_equal 替换 JSON.stringify → 验证：key 顺序测试通过。
5. 运行 renderer 定向测试与 `pnpm test` → 验证：无 UI 回归。

## 风险与回退

- 风险：disabled 样式偏差；分隔符位置偏移；比较函数漏 key 数量。
- 回退：逐项独立回退，保留行为测试。

## Finalization 时更新的 blueprint

- 无。
