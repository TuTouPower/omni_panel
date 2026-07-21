# Task spec

## 背景

Kimi 配置两个直连账号，一个采集成功、一个采集失败；主面板只显示成功账号，失败账号完全消失。用户期望：失败账号也显示一行并标注采集失败，而非隐藏。

根因（已确认，真实打包实例稳定复现两次）：主面板账号列表只从 `snapshot.items`（MetricRecord）构建（`src/renderer/lib/provider-usage.ts:185-196` `build_provider_usage_groups`）。采集失败的直连 connector `snapshot.status==="failed"`、`items:[]`，不产生任何 MetricRecord → 该 provider 的 group.accounts 不含此账号 → `ProviderAccountList` 不渲染该行。

已有 per-account error 机制（T026-T029）只覆盖**曾成功过**的账号：refresh-service 复制上次成功观测为 stale 副本（`refresh-service.ts:274-296`），stale observation 经 `observation_to_metric_record` 带 `last_error → MetricRecord.error`。**首次采集即失败**的账号无任何历史 observation → 无 stale 副本 → 无 MetricRecord → 无账号行。`providerErrors`（`PopupView.tsx:303-313`）只做 provider 级错误映射给概览用，不产生 account 行。

复现命令（Phase 1 反馈环，真实 local-api :17863，已运行 ≥2 次）：

```bash
node -e 'fetch("http://127.0.0.1:17863/v1/connectors").then(r=>r.json()).then(xs=>{
const d=xs.filter(x=>String(x.name).toLowerCase()==="kimi");
for(const x of d) console.log(JSON.stringify({displayName:x.displayName,enabled:x.enabled,status:x.snapshot?.status,items:x.snapshot?.items?.length??0,error:x.snapshot?.error??null}));
const configured=d.filter(x=>x.enabled).length;
const visible=new Set(d.flatMap(x=>(x.snapshot?.items??[]).filter(i=>i.provider==="kimi").map(i=>`${i.sourceInstanceId}|${i.accountId}`))).size;
console.log(`configured=${configured} visible=${visible}`);
if(visible<configured) throw "Kimi 所有已配置账号都应在主面板出现，包括采集失败账号";})'
# 输出：成功实例 items=2；失败实例 status=failed items=0 error=HTTP 401
# configured=2 visible=1 → throw
```

## 范围

- `src/renderer/lib/provider-usage.ts` `build_provider_usage_groups`：遍历 connectors 时，对 `enabled && snapshot.status==="failed" && (snapshot.items??[]).length===0 && source!=="gateway"` 的**直连** connector，合成一个失败账号占位加入对应 provider group（status=`"unknown"`、error=`snapshot.error`、accountLabel 取 `displayName||name`、accountKey 用 `sourceInstanceId` 派生），使 `ProviderAccountList` 能渲染该行、`ProviderAccountRow` error badge（T027）显示失败。
- `buildAccountErrors`：合成占位须同时进入 accountErrors，保证 badge 数据通路一致。
- 回归测试：
    - `tests/unit/provider_usage_failed_account.test.ts`（新）：直连 connector failed+0 items → 该 provider group 含 1 个失败 account 占位；CPA（gateway）failed 不合成；成功 connector 不受影响。
    - `tests/e2e/web/`：synthetic fixture 加一个"首次失败无 observation"的直连 provider，断言失败账号行可见 + error badge（参照 `account_error_badge.spec.ts`）。

## 非范围

- CPA（gateway source）失败账号：CPA 多账号、失败时无法确定具体哪个上游账号，不合成（保留现有 provider 级 error 行为）。
- 不改 refresh-service stale 机制（T028 已覆盖有历史账号）。
- 不改 observation-store / MetricRecord schema。
- 不在主面板为失败账号发明用量数字（占位行只示状态 + error，不示 used/limit）。

## 验收标准

- [ ] 直连 connector enabled+failed+0 items 时，主面板对应 provider 显示失败账号行（单测 + e2e）
- [ ] 失败行显示"采集失败"badge + error 文案，不显示伪造用量
- [ ] CPA gateway 失败不合成 account 占位（单测，不误伤）
- [ ] 成功账号不受影响（`pnpm test` 全绿）
- [ ] `pnpm test:e2e:web` 新 case pass
- [ ] `pnpm typecheck` 过
- [ ] 真实打包启动验证：Kimi 两账号一失败，主面板显示两行，失败行标注采集失败

## 依赖与约束

- 约束 domain.md 不变量 8：直连 1 数据源 = 1 账号（可据此用 connector 信息合成占位）；CPA 子账号存在性由远端决定，不合成。
- 约束 domain.md 不变量 2：失败账号保留展示 + 错误可见，不静默隐藏。
- 与 t039 互补：t039 修"成功响应零数据被误判正常导致历史被清"；t040 修"失败/无数据账号从主面板消失"。两者可独立实施，建议 t039 先（避免零观测误 ready 污染本 task 的失败判定）。
