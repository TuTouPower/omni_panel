# Task plan

## 步骤与验证

1. 逐个读 9 spec，按"可平移（纯 DOM）/ 强依赖 fake 状态（留 electron）"细分 → 验证：分类表
2. 可平移 spec：`git mv electron/ web/` + 改 fixture import + omni→webPage + 删 seed_fake_plugin + 断言泛化 → 验证：grep 无 omni/seed_fake_plugin 残留
3. `pnpm test:e2e:web` 跑全 → 验证：新迁 spec 绿；失败 case 删或留 electron（log 记）
4. review×2 + adoption + task_report + 归档 + commit

## 风险与回退

- 风险：spec case 造特定状态（used=100% critical）mock 无法复现 → 该 case 删或留 electron
- 风险：断言泛化过度（只断非空，无业务价值）→ 保留状态/结构断言（如 critical/warning/normal 枚举、card count > 0）
- 回退：失败 spec `git mv web/ electron/`

## Finalization 时更新的 blueprint

- 无
