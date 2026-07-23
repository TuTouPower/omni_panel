# Task spec

## 背景

Exa（exa.ai）按 API key 计费（Neural Search / Content Retrieval 等价格项），用户需在 OmniUsage 集中查看某个 API key 的成本用量。官方提供 `GET https://admin-api.exa.ai/team-management/api-keys/{id}/usage`（header `x-api-key: SERVICE-KEY`），返回 `total_cost_usd` 与 `cost_breakdown[]`（每项含 `price_id`/`price_name`/`quantity`/`amount_usd`），周期默认近 30 天。

Exa 是成本累计型（非 quota/余额），无远端 limit；用户需自定预算上限 `LIMIT`（USD），status 正向（成本越接近预算越告警），与 mimo/firecrawl 的 percent/ratio 型语义一致。

## 范围

- 新增 `connectors/exa/`（`manifest.json` + `connector.ts`）。
- manifest 参数：`SERVICE_KEY`（secret，team service key）、`API_KEY_ID`（text，被查询 API key 的 UUID）、`LIMIT`（number，USD 预算上限，默认如 100）。
- `connector.ts`：GET `/team-management/api-keys/{API_KEY_ID}/usage`，header `x-api-key: SERVICE_KEY`。
- 映射 observation：每个 `cost_breakdown` 项 = 一个 metric（`used=amount_usd`、`raw_label=price_id`、`normalized_label=price_name`、`limit=null` 或按预算分摊）；另输出 `total_cost_usd` 汇总 metric（`used=total_cost_usd`、`limit=LIMIT`、正向 status）。
- status：成本/预算正向（`used/limit >= 0.9 critical / >= 0.75 warning`），`limit<=0` 时 `unknown`。
- period 取响应 `period.start`/`period.end`，`cycleDurationMs = end-start`（30 天窗口），`reset_at = period.end`。
- 契约测试：基于文档示例响应 fixture。

## 非范围

- 不实现 List API Keys 自动发现；`API_KEY_ID` 由用户手填。
- 不抓 `group_by` 时间序列趋势（group_by 当前 reserved）。
- 不做 6 个月历史回溯查询（默认 30 天窗口即可）。

## 验收标准

- [ ] `connectors/exa/manifest.json` 注册成功，参数与标签齐全（zh-Hans/en）。
- [ ] 输入 SERVICE_KEY + API_KEY_ID + LIMIT，返回 ≥1 条 observation（total_cost_usd 汇总 + 各 cost_breakdown 明细）。
- [ ] status 正向：成本/预算 ≥0.9 critical、≥0.75 warning，LIMIT 缺失/≤0 时 unknown。
- [ ] period/cycleDurationMs/reset_at 来自响应 period；零用量（total_cost_usd=0、breakdown 空）时仍返回 total=0 的观测而非静默空数组。
- [ ] 契约测试覆盖正常 / 零用量 / 非 200 错误码（throw）。

## 依赖与约束

- `API_KEY_ID` 路径参数需用户从 Exa dashboard 复制 UUID。
- 密钥由用户提供随机值，禁止自设默认。
- response 字段以官方文档示例为准；若实测字段有出入，实现侧标注并在 finalization 更新 blueprint。
