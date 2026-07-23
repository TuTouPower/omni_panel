# Task spec

## 背景

GetOneAPI（getoneapi.com，OneAPI 站点）按人民币余额计费，用户需在 OmniUsage 查看账户余额。官方 `POST https://api.getoneapi.com/back/user/balance`（header `Authorization: Bearer {apikey}`）返回 `{code, message, data}`，文档示例 `data` 为空对象，真实字段需实测确认（预期含余额数值，参考 OneAPI 同类返回 `balance`/`amount` 等）。

## 范围

- 新增 `connectors/getoneapi/`（`manifest.json` + `connector.ts`）。
- manifest 参数：`API_KEY`（secret）、`LIMIT`（number，CNY 上限，默认 100）。
- `connector.ts`：POST `/back/user/balance`，Bearer。
- 映射 observation：余额 metric（`used=balance`、`limit=LIMIT`、余额反向 status：`balance/limit <=0.1 critical / <=0.2 warning`），`window=total`、`cycleDurationMs=null`、`display_style=ratio`。
- status 用 `status_for_balance(balance, limit)`（与 deepseek 同语义）。
- 契约测试：fixture 基于实测/文档示例。

## 非范围

- 不查「使用记录」接口（仅余额）。
- 不处理多币种（默认 CNY）。
- 不做多账号聚合（OneAPI 单 key 单账户）。

## 验收标准

- [ ] `connectors/getoneapi/manifest.json` 注册成功，参数标签齐全。
- [ ] 输入 API_KEY 返回余额 observation（used=balance、limit=LIMIT）。
- [ ] status 余额反向：余额 0.01 → critical，充足 → normal。
- [ ] code != 200 throw 错误；data 缺关键字段 throw（不静默空数组）。
- [ ] 契约测试覆盖正常 / 错误码。

## 依赖与约束

- 文档示例 `data:{}` 空结构不可直接断言字段名；实现前**必须**用用户提供的真实 key 跑一次确认字段（如 `data.balance` / `data.amount` / `data.quota`），并在 plan/code 注明实测来源。
- 密钥由用户提供，禁止自设默认。
