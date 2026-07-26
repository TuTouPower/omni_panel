# Task spec

## 背景

review_20260726_054747 采纳项 14：`calendar_date_of`、`num` 在三个 reader 逐字重复，日期 bucket 需跨 provider 一致。

## 范围

- 新建 `reader-utils.ts` 导出完全等价的 `calendar_date_of`、`num`；三 reader 改为 import，删本地副本。

## 非范围

- 不提取 `extract_user_text`（消息结构不同）。

## 验收标准

- [ ] 三 reader 共用同一实现；token-stats 测试不回归。

## 依赖与约束

- 仅提取逐字等价函数。
