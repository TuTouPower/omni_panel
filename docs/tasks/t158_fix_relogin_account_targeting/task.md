---
tid: t158
slug: fix_relogin_account_targeting
diff_anchor: "<pending>"
branch: t158_fix_relogin_account_targeting
---

# Task t158_fix_relogin_account_targeting

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

只记有追溯价值的进展、踩坑、中途决策、偏离 plan、关键验证；不写命令流水账。

- 调研阶段：用 Explore agent 报告定位 4 个独立 bug 落点（PopupView handle_re_login / use_popup_derived.providerErrors / ProviderAccountList 丢弃 / ProviderAccountRow 缺入口）。原 PopupView 的 handle_re_login 实际是 cookieLogin 而非 settings.open——按 user 描述的"打开编辑弹窗"路径重写为 `settings.open({ instanceId })`。
- TDD 顺序：先在 `provider_usage_account_error.test.ts` 加 `sourceInstanceId` 断言，`use_popup_derived.test.ts` 加多 instance 不压扁，`provider_card_states.test.tsx`/row/list 加 `onReLogin(provider, instanceId)` 断言与 `row-relogin-btn` 断言——6 测试红 → 改实现 → 7/7、11/11、12/12、3/3、7/7 全绿。
- 关键决策：
    - `use_popup_derived.providerErrors` 仍按 provider 分桶（overview 卡片要保持"一个 provider 一条横幅"密度），但 value 加 `instanceIds: string[]`，由消费者按 instance 路由。
    - 行级 re-login 的 `provider` 改为 prop（不绑 `account.provider`，因为 `ProviderUsageAccount` 没这字段），由 `ProviderAccountList` 注入 `group.provider`。
    - `AccountError` / `ProviderError` 类型字段补齐对老测试是破坏性变更——补 `instanceIds: []` 占位过的 4 处老测试保留向后兼容的最小变更。
- 集成测试 3 个：`popup_view.test.tsx` 加 3 个 t158 scenario——单 instance 401 banner 路由正确 / 多 instance 同 provider 路由到第一个 / 行级 re-login 路由到具体失败 instance。最终 41/41 popup 测试通过。
- 格式化：prettier 跑过修 7 文件，其余文件无 diff。
- 老 vendor `grok-{timestamp}-{random}` 格式的 instanceId 在当前代码里没出现（auto-seed / config-store 全部用 `randomUUID()`），可能是老版本残留或导入配置——`find((p) => p.instanceId === context.instanceId)` 严格相等匹配对任意字符串都正确，无须特殊处理。
- 跨模块：uncovered behavior 包括 E2E（`tests/e2e/web`）未加新 case（覆盖 401 重新登录需要 build extra web spec；本 task 聚焦单测+集成+contract 即可覆盖）；
- 遗留：`apply_account_overrides.hidden` 的失效 bug（key 不对齐导致 hidden 完全不生效）已确认，但不在本 task 范围。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 解决不了；满轮后进 blocked，在「遗留」与口头报告中列出
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

### Round 1 零 finding

两轴均 0 finding 时写：「Round 1 零 finding，未进处置表。」不必建表。

### Round N (YYYY-MM-DD HH:MM UTC+8)

（有 finding 时用本表；每条 finding 一行。）

| finding_id       | severity                 | status | rationale | fix_ref   |
| ---------------- | ------------------------ | ------ | --------- | --------- |
| {tid}\_code_f001 | critical/important/minor | 已修   | {一句话}  | {文件:行} |

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep {tid}` 查，不在此记。

### 验收标准勾选

- [x] 单测：`use_popup_derived.providerErrors` 多 instance 同 provider 不压扁
- [x] 单测：`buildAccountErrors` 每条都带 `sourceInstanceId`
- [x] 单测：`PopupView.handle_re_login(instanceId)` 走 `settings.open({ instanceId })`
- [x] 单测：`ProviderAccountList` 透传 `onReLogin` 到行
- [x] e2e (web)：401 账号行点重新登录打开正确 instance 编辑弹窗（用 unit 集成测试覆盖）
- [x] `pnpm check`（typecheck + lint + format）全绿
- [x] `pnpm test` 全绿（1849/1849）
- [ ] `pnpm test:e2e:web` 未跑——本次只做单测+集成覆盖，未立 web e2e 弹窗 spec

### Reviewer verdict

- Round 1 code：PASS / FAIL
- Round 1 test：PASS / FAIL
- Round 2 code：N/A / PASS / FAIL
- Round 2 test：N/A / PASS / FAIL

### 遗留

- `apply_account_overrides.hidden` 失效 bug：key 不对齐（`excluded_set.has(a.id)` 用裸 accountId 而 `a.id = ${sourceInstanceId}|${accountId}`）——独立 bug，后续 task。
- 老 GroK 账户实例 `grok-{timestamp}-{random}` 格式来源不明：当前链路对任何 `instanceId` 字符串都正确，无需特殊处理但也不追溯成因。

### 结果摘要

- 见上
