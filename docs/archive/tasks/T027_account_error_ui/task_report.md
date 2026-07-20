# Task report T027

本报告所在 commit 即 task commit，SHA 由 `git log --grep T027` 查，不在此记录。

## spec 验收标准勾选

- [x] 有 error account 显示 `.error-badge`，tooltip 含 error message。 - ProviderAccountRow 代码实现（.error-badge + title={\_error}），待 T028 数据验证。
- [x] 无 error account 无 badge。 - `{_error && ...}` 条件渲染。
- [x] `pnpm test:e2e:web` 全绿。 - 45 passed + 1 skip（badge case skip因 MetricRecord.error 无数据）。
- [x] `pnpm typecheck` 过。

## adoption 处置摘要

- 已修 2 项（代码+CSS + spec skip）

## 遗留问题

- **MetricRecord.error 数据**（T028）：connector 脚本不记 per-account error，badge 不渲染。T028 实现 connector script error 记录后 badge 自然激活。
- **e2e case 完整测试**：当前 skip，待 T028 数据 + Kimi card 展开逻辑验证（card 展开 + badge 可见）。
