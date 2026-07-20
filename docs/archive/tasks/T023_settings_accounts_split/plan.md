# Task plan

## 步骤与验证

1. 写 web/settings_provider_accounts.spec.ts（about 2 case + accounts 1 case 泛化）→ 验证
2. 重写 electron/settings_provider_accounts.spec.ts（只 restart case）→ 验证
3. `pnpm test:e2e:web` → 验证：about 过，accounts 过/skip
4. `playwright --project=electron --list` → 验证：含 restart case
5. review×2 + adoption + task_report + 归档 + commit

## 风险与回退

- 风险：web SPA accounts 页无 `.ao-item`（T011 `.acct-row` 失败先例）→ accounts case skip 或留 electron
- 回退：accounts case 失败留 electron

## Finalization 时更新的 blueprint

- 无
