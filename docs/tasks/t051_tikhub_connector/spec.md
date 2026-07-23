# Task spec

## 背景

TikHub（tikhub.io）是开发者数据 API 平台（抖音/小红书/B 站等），预付充值按调用扣费（非订阅制），需在 OmniUsage 查看账户剩余额度。官方接口 `GET https://api.tikhub.io/api/v1/tikhub/user/get_user_info`（header `Authorization: Bearer {token}`）返回 `user_data.balance`（付费余额，USD）与 `user_data.free_credit`（免费额度），以及账户标识 `user_data.email`。无总额度/已用量字段，仅当前剩余。

来源：https://docs.tikhub.io/186826050e0.md（OpenAPI 规格）。

## 范围

- 新增 `connectors/tikhub/`（`manifest.json` + `connector.ts`）。
- manifest 参数：`API_KEY`（secret，Bearer token）、`LIMIT`（number，USD 上限，默认如 100）。
- `connector.ts`：GET `/api/v1/tikhub/user/get_user_info`，header `Authorization: Bearer ${API_KEY}`。
- 映射 observation：
    - `balance` metric（`used=balance`、`limit=LIMIT`、`raw_label=balance`、`normalized_label=付费余额`、余额反向 status）。
    - `free_credit` metric（`used=free_credit`、`limit=null` 或单独标注、`raw_label=free_credit`、`normalized_label=免费额度`、status normal/unknown）。
    - `account_id`：优先 `user_data.email`（稳定标识，避免固定字符串多实例 collapse，符合 P2 建议）；email 缺失时回退 `tikhub`。
    - `window=total`、`cycleDurationMs=null`、`display_style=ratio`、`source=poll`。
- status：balance 用 `status_for_balance(balance, limit)`（反向）；free_credit 无 limit 时 `normal`/`unknown`。
- 契约测试：fixture 基于文档示例。

## 非范围

- 不接 TikHub 业务数据接口（仅账户余额/额度）。
- 不查 `get_user_daily_usage`（每日用量聚合，data 结构未暴露，本 task 不展开）。
- 不做价格计算（`calculate_price`）。

## 验收标准

- [ ] `connectors/tikhub/manifest.json` 注册成功，参数标签齐全。
- [ ] 输入 API_KEY 返回 balance + free_credit 两条 observation。
- [ ] `account_id = user_data.email`（非固定字符串）。
- [ ] balance status 余额反向（≤0.1 critical / ≤0.2 warning）；free_credit 无 limit 时 normal/unknown。
- [ ] code != 200 throw；user_data 缺失 throw（不静默空数组）。
- [ ] 契约测试覆盖正常 / 错误码 / email 缺失回退。

## 依赖与约束

- endpoint 与字段已由 subagent 抓取 OpenAPI 规格确认（见背景来源 URL）。
- 实测数值以用户真实 token 跑一次为准；密钥由用户提供，禁止自设默认。
