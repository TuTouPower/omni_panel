# Task spec

## 背景

T016 遗留 settings_provider_accounts（electron/）4 case 用 createTestWithSetup + seed_fake_plugin。case 3/4（about 页 logo + version）web 可跑；case 1（accounts `.ao-item` DOM）web 试；case 2（restart 持久化）留 electron（web 无 restart）。

## 范围

- 新 `tests/e2e/web/settings_provider_accounts.spec.ts`：case 3/4（about logo + version）+ case 1（accounts `.ao-item` 泛化，web fixture connector）。
- 重写 `tests/e2e/electron/settings_provider_accounts.spec.ts`：只留 case 2（restart secret 持久化 + 不明文，seed_fake_plugin + omni.stop/start）。

## 非范围

- 不改 T010 基建/mock
- restart 持久化留 electron（web 无 restart 能力）

## 验收标准

- [ ] web about case（logo + version）跑通
- [ ] web accounts case（`.ao-item`）跑通或 skip（web SPA 无则记）
- [ ] electron 留 restart case（seed + restart）
- [ ] `pnpm test:e2e:web` 全绿
- [ ] `pnpm typecheck` 过

## 依赖与约束

- web fixture（real/synthetic）connector name 不定，accounts 断言泛化
