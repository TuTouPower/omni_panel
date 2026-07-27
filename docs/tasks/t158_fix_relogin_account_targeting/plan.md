# Task plan

## 步骤与验证

1. **红：纯函数与数据层单测**
   - `tests/unit/renderer/use_popup_derived.test.ts`（新建或扩展现有）：断言 `providerErrors` 在多 instance 同 provider 时按 instanceId 区分，不再把后续失败静默压扁。
   - `tests/unit/renderer/provider-usage.test.ts`（如有）或新建：断言 `buildAccountErrors` 每条记录都带 `sourceInstanceId`；新增字段不影响旧消费者（type 一致性靠 ts 接口）。
   - 验证：`pnpm vitest run tests/unit/renderer` 红。

2. **绿：数据类型 + 派生层**
   - `src/renderer/lib/provider-usage.ts:369-373`：`AccountError` 增 `sourceInstanceId: string`。
   - `src/renderer/components/ProviderOverview.tsx:11-14`：`ProviderError` 改为含 instanceIds 列表的结构（保留 displayName + error，新增 instanceIds: string[]）。
   - `src/renderer/hooks/use_popup_derived.ts:82-92`：`providerErrors` 改为按 instanceId 分桶（结构：`Map<string, { provider, displayName, error, instanceIds }[]>` 或 `Map<instanceId, ProviderErrorEntry>`，由消费者聚合）；消费者侧更新加法。
   - 验证：单测转绿；`pnpm typecheck` 通过。

3. **绿：`onReLogin` 签名升级**
   - `src/renderer/components/provider_card_states.tsx:23`：`onReLogin` 签名改为 `(provider: string, instanceId: string) => void`；调用点同步。
   - 找出所有 `onReLogin` 消费者（`ProviderCard.tsx` / `ProviderOverview.tsx` / `ProviderAccountList.tsx` / `PopupView.tsx`）同步加 instanceId 参数。
   - `src/renderer/views/PopupView.tsx:436-440`：`handle_re_login(instanceId, provider?)` 直接 `window.usageboard.settings.open({ instanceId })`，删 `activeProviders.includes` 模糊匹配。
   - 验证：`pnpm typecheck` 通过；旧调用点全部找到并改正（grep 兜底）。

4. **绿：`ProviderAccountList` 透传 + 行级按钮**
   - `src/renderer/components/ProviderAccountList.tsx`：删 `_onReLogin; void _onReLogin`，把 `onReLogin(instanceId, provider)` 透传给所有 `ProviderAccountRow`。
   - `src/renderer/components/ProviderAccountRow.tsx`：增 `onReLogin?: (instanceId: string, provider: string) => void` props；error badge 旁显示「重新登录」链接/小按钮（仅当 `error` 非空且 `onReLogin` 存在时）；从 `account.id` 拆 `sourceInstanceId`。
   - 验证：`pnpm test` 相关测试通过；UI 视觉由后续 reviewer 检验。

5. **绿：Settings 路径已通**
   - `src/renderer/views/SettingsView.tsx:55-87` 的 `open_settings_account_dialog` 已支持 `instanceId` 优先匹配（line 60-70），无须改逻辑；只在主流程能从 re-login 传 instanceId 时验证它落到这里。
   - 验证：人工/集成测试：401 → 行级重新登录 → settings 弹窗精确打开 instanceId 对应的 connector 编辑弹窗。

6. **回归 & 黑盒**
   - `pnpm test` 全量；`pnpm test:e2e:web`。
   - 若有 panic/freeze（t096 相关），关注 provider-level error 的 `Map` key 变化是否影响 popup 渲染热路径。

7. **Review 准备**
   - `pnpm check` 全绿；commit 后触发 review。

## 风险与回退

- **风险**：`providerErrors` 结构变更会波及多个消费点（`ProviderOverview` / `ProviderCard` / popup 总览）的渲染分支。最小爆炸面策略：保留 `provider`-keyed 的对外 API，内部改存储结构；或保留旧字段、新字段并列、消费者逐步迁移。
- **风险**：`ProviderCard` 概览层可能现有逻辑假设「每个 provider 最多一条错误横幅」。多 instance 场景下 UI 提示文案（"N 个账号凭证失效"）需要明确，本 task 接受"展示计数+展开后由行 badge 列出"模式，不强制在概览卡片同时开多个编辑弹窗。
- **风险**：`is_auth_error` 在 `provider_card_states.tsx` 是本地 helper；如果 `ProviderAccountRow` 要复用，避免双向依赖，本 task 把判定下沉到 `src/renderer/lib/` 共享文件（接受轻微 refactor）。
- **回退**：`git revert` 本 task commit 即可。数据层（runtime store/refresh service）未改动，回退后状态与当前一致。

## Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：渲染层「401 → 重新登录」链路条目（实例级定位）——若 architecture 文档未涵盖该路径则新增一行；否则补一句明确"重新登录按 instanceId 路由"。
- `docs/blueprint/conventions.md`：若新增共享 `is_auth_error` helper，则在 conventions 中标注位置与使用方。
- `docs/specs/<slug>.md`：归档本次修复为新 spec（slug 如 `relogin-instance-routing`）。
- `docs/specs_index.md`：在表内登记 slug/对应 task t158。
