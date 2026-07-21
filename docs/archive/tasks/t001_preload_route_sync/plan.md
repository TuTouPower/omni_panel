# Task plan

## 步骤与验证

1. Edit `preload/index.ts` L335 fallback + L341 case → 验证：`grep -n "popup\|\"settings\"" src/preload/index.ts` 无 route 相关残留
2. Edit `route_api.ts` L8 → 验证：`grep -n "settings" src/preload/route_api.ts` 无残留
3. Edit `route_api.test.ts` L28 + L39 断言 → 验证：`pnpm test tests/unit/preload/route_api.test.ts` 绿
4. `pnpm test` 全量 → 验证：全绿

## 风险与回退

- 风险：其他 test 或代码引用旧 route 值 `"popup"` / `"settings"`
- 回退：`git checkout src/preload/ tests/unit/preload/route_api.test.ts`

## Finalization 时更新的 blueprint

- 无（route 实现细节，blueprint 不涉；文档同步在 T002）
