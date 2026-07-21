# Task spec

## 背景

T022 test_f003：plugin_failure_modes 原 electron 3 case（error/crash/slow）删除后，crash（process.exit 非零）路径在 integration 无显式单测。实际 vm sandbox 不注入 process（`process.exit` → ReferenceError → throw），等效 runtime.test.ts throw case（L145）。补显式 crash case 强化覆盖（明确 process.exit 场景）。

## 范围

- `tests/integration/connector/runtime.test.ts`：加 1 case `process.exit(2)` 脚本 → vm 内 process undefined → throw → 断言 error。

## 非范围

- 不改 runtime.ts / vm sandbox
- 不补 e2e crash（vm 内 crash = throw，integration 覆盖够）

## 验收标准

- [ ] runtime.test.ts 含 crash case
- [ ] `pnpm test` 全绿

## 依赖与约束

- 无
