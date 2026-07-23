# Task spec

## 背景

t064 I22：setupFiles 拆 renderer-only。

## 范围

- setupFiles 拆 renderer-only 或仅 smoke 套件加载，避免 unit/integration 被全局 mock 污染。

## 验收标准

- [ ] unit/integration 默认不拿完整 mock API；mock 仅 renderer/smoke。

## 依赖与约束

- vitest.config setupFiles 架构改。
