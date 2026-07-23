# Task spec

## 背景

review_20260723_opus 测试反模式：I18（`tests/unit/main/deep_freeze.test.ts:3-14`）重实现生产 `runtime.ts:19` `deep_freeze` 再测副本，生产改了测试不会失败；I19（`tests/unit/observation_store_migration.test.ts:34-43`）测试内手写 PRAGMA+ALTER TABLE 断言，生产真实迁移 `observation-store.ts:116-132` 从未被调用；I20（`tests/unit/main/tray_menu.test.ts:12-60`）`ZH_LABELS`/`EN_LABELS` 是测试内本地常量，断言数组含自身元素，生产 TrayMenu label 未触碰；I21（`tests/e2e/electron/tray_menu_actions.spec.ts:37-48`、`web/scheduler.spec.ts:37-47`）「triggers refresh」用例只断言按钮可见+1000ms 死等；I22（`tests/smoke/setup.ts:17,205-219`）setupFiles 全局注入 mock，renderer 测试默认拿完整 mock API；I23（`multi_account.spec.ts:39` 等 4 文件）`test.skip(true,...)` 永久跳过关键 case。

## 范围

- I18：导入生产 `deep_freeze` 测试，或改集成入口测副作用。
- I19：导入并调用生产迁移入口（非手写 ALTER）。
- I20：删本地常量重言式，改测真实 TrayMenu label（或仅保留 IPC_CHANNELS 有效部分）。
- I21：断言刷新请求发出或 spinner 状态翻转（非死等）。
- I22：setupFiles 拆 renderer-only 或仅 smoke 套件加载。
- I23：取消 skip（补 real fixture）或显式标明原因 + 跟进。

## 非范围

- 不追求覆盖率数字（I22 是 mock 污染问题，非覆盖率）。
- 不重写整个测试体系（仅整改反模式）。

## 验收标准

- [ ] I18/I19 测试调生产入口（生产改则测试失败）。
- [ ] I20 不再断言本地常量自身。
- [ ] I21 e2e 断言真实刷新行为。
- [ ] I22 setupFiles 不污染 unit/integration。
- [ ] I23 skip 取消或标明跟进。
- [ ] `pnpm test` 全绿。

## 依赖与约束

- I23 取消 skip 可能需 real fixture（CI 环境）；若无法本地复现，标明并留跟进。
