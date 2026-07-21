# Task spec

## 背景

Grok 添加账号后设置页显示采集正常，但主面板显示"暂无账号"。

根因（已确认，真实打包实例 + 日志稳定复现两次）：Grok billing 上游对当前 token 返回 HTTP 200 + 413 字节 body，但该 body 解析后 `config.creditUsagePercent` 非有限数 / 缺失 / `config` 为空，connector 返回空 observations 数组且**未** `report_failed_account`。`refresh-service` 把 `observations.length===0` 的成功返回直接写成 `status:"ready"` + `items:[]`（`refresh-service.ts:298-306`），runtime-store 清空，主面板无 MetricRecord → "暂无账号"。

日志证据（`app-2026-07-21.log`，trace `refresh-mruvrlja-4xsmfo` / `refresh-mruvl4in-wgdly8`）：`GET /v1/billing → 200, body=413 bytes` → `Connector grok: 0 valid observations (from 0 raw)` → `refreshed: 0 items`。对比有数据时 trace `refresh-mrulikm1`：失败重试后 `3 items`。

复现命令（Phase 1 反馈环，真实 local-api，已运行 ≥2 次）：

```bash
node -e 'fetch("http://127.0.0.1:17863/v1/connectors").then(r=>r.json()).then(xs=>{
const g=xs.filter(x=>String(x.name).toLowerCase()==="grok");
console.log(g.map(x=>JSON.stringify({enabled:x.enabled,status:x.snapshot?.status,items:x.snapshot?.items?.length??0,error:x.snapshot?.error??null})).join("\n"));
if(!g.some(x=>x.enabled&&x.snapshot?.status==="ready"&&(x.snapshot?.items??[]).some(i=>i.provider==="grok"))) throw "Grok 采集正常时主面板应至少存在一个 Grok 账号数据项";})'
# 输出：{"enabled":true,"status":"ready","items":0,"error":null} → throw
```

## 范围

- `connectors/grok/connector.ts`：当 `creditUsagePercent` 无效且无任何有效 `productUsage[].usagePercent` 时（即零可用指标），`ctx.report_failed_account("grok", ...)` 上报失败并返回空数组，让 refresh-service 走 stale 保留 / failed 状态，而非 ready+空。
- refresh-service 语义校正：connector 脚本成功返回但 `observations.length===0` 且 `failed_accounts.length===0` 时，不应无条件 `ready`；至少保留上次成功数据（不覆盖清空）。具体策略见 plan（最小侵入：零观测且无 failed 时复用 prior lastSuccess，不写空 items）。
- 回归测试：
    - `tests/integration/connector/grok_connector.test.ts` 加 "200 但无有效百分比字段时上报 failed_account"。
    - `tests/integration/scheduler/refresh-service.test.ts` 加 "connector 返回零观测零失败不得清空历史 / 不得标 ready 误导"。

## 非范围

- 不改 Grok OAuth 刷新逻辑（token 失效走 401 路径，已有 failed_account 处理）。
- 不重构 refresh-service 重试骨架。
- 不改主面板账号聚合（账号来源仍是 MetricRecord）。

## 验收标准

- [ ] Grok billing 200 但零有效指标时，connector 上报 failed_account（单测）
- [ ] refresh-service 对"零观测零失败"不得写 ready+空 items 清空历史（单测）
- [ ] 设置页在该场景下不再显示"采集正常"误导（应为失败/stale）
- [ ] `pnpm test` 全绿；`pnpm typecheck` 过
- [ ] 真实打包启动验证：Grok 场景下主面板展示失败状态而非"暂无账号"

## 依赖与约束

- 约束 domain.md 不变量 2：采集失败保留上次成功观测，挂 stale + lastError，绝不覆盖删除。当前"ready+空"违反该不变量。
- 与 t040 相关但独立：本 task 修"成功响应零数据被误判正常"；t040 修"失败账号无历史时不显示账号行"。
