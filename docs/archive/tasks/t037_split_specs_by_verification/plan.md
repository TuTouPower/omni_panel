# Task plan

## 步骤与验证

1. 派 sub agent 并行拆分 5 混杂 spec（按 agent 分类建议），旧文件移 docs/archive/specs/ → 验证：新 spec 文件 + archive 旧
2. 改造 specs_index.md（加验证方式列 + 分类说明 + 21 行） → 验证：grep 行数 + 分类
3. grep 核对 specs_index 引用的 spec 文件都存在 → 验证：无断链
4. finish + mv + commit

## 风险与回退

- 拆分内容归属判断（某段属 API 还是 Desktop） → 参考 agent 分类表 + spec 内 Electron-only 关键词（BrowserWindow/utilityProcess/webRequest/nativeTheme）
- 拆分破坏 spec 间交叉引用 → 拆完 grep 旧 slug 引用，更新
- 回退：分支可丢弃

## Finalization 时更新的 blueprint

- 无（spec 文档重构）
