# Task spec

## 背景

t064 I19：migration 测试改 import 生产迁移入口。

## 范围

- observation_store_migration 测试改 import + 调生产迁移入口（非手写 PRAGMA+ALTER）。

## 验收标准

- [ ] 生产迁移改测试失败（测真实入口）；测试绿。

## 依赖与约束

- 需导出生产迁移函数或改集成入口。
