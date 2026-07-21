# Task plan

## 步骤与验证

1. 红灯：`tests/unit/provider_usage_failed_account.test.ts` 新建 → 断言"直连 failed+0 items connector 产生 1 个失败 account 占位" / "gateway failed 不合成" / "成功 connector 不受影响" → 验证：`pnpm test tests/unit/provider_usage_failed_account.test.ts` 失败。
2. 红灯：synthetic fixture（`tests/e2e/fixtures/synthetic.json`）加一个直连 provider 的 failed+0 items 实例；`tests/e2e/web/failed_account_placeholder.spec.ts` 断言该 provider card 展开后失败账号行 + `.error-badge` 可见 → 验证失败。
3. 实现 `build_provider_usage_groups`（`src/renderer/lib/provider-usage.ts`）：
    - 第一轮遍历先按现有逻辑从 items 建 periods/accounts。
    - 增补一轮：对每个 `connector.enabled && snapshot.status==="failed" && items.length===0 && connector.source!=="gateway"`，按 `connector.activeProviders[0]`（或 supportedProviders）定位 provider group，合成 account 占位：
        - `id`：复用 `accountKey` 规则派生（`sourceInstanceId` + 稳定占位 accountId，如 `__failed__`）。
        - `accountLabel`：`connector.displayName || connector.name`。
        - `status`：`"unknown"`。
        - `periods`：`[]`（不伪造用量）。
    - 同步把该 account 注入 `buildAccountErrors`（error = `snapshot.error`），保证 badge 通路。
4. 确认 `ProviderAccountRow` 对 `periods:[]` 的占位 account 渲染稳定（只显 vendor + label + 失败 badge，不渲染用量条）；必要时在该组件对空 periods 做最小分支。
5. 绿灯：上述两测试通过；`pnpm test` 全绿。
6. 打包验证：`pnpm package` → 真实 Kimi 两账号一失败 → 主面板两行，失败行标注"采集失败"。

## 风险与回退

- 风险 A：合成的占位 accountId（`__failed__`）日后该账号采集成功时与真实 accountId 不一致，导致出现"失败占位 + 真实账号"两行。→ 缓解：成功后 items 进入正常聚合；占位仅当 items 为空时存在，两者互斥（同一 connector 有 items 即不合成）。补单测覆盖"失败→成功过渡只留一行"。
- 风险 B：直连多账号 connector（理论存在）失败时只合成一行，与实际多账号不符。→ 当前直连模型 1 数据源 = 1 账号（domain 不变量 8），不处理；若将来出现直连多账号，本合成需重审。
- 风险 C：概览（ProviderOverview）聚合若把占位 account 误计入 used/limit。→ 占位 periods 为空，`build_overview_for_group` 的 `has_valid_quota` 过滤会跳过；补断言概览不含该占位用量。
- 回退：合成逻辑是 `build_provider_usage_groups` 末尾增补分支，还原即恢复旧行为。

## Finalization 时更新的 blueprint

- `docs/blueprint/domain.md`：不变量 2 补"首次采集失败的直连账号须在主面板保留失败占位行，不静默隐藏"。
- `docs/blueprint/architecture.md`：renderer 聚合段补"failed 直连 connector 合成 account 占位"规则。
