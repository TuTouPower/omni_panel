# Task spec

## 背景

review_20260723_opus：P2 固定 account_id 字符串；I6（`connectors/deepseek/connector.ts:65`）`account_id:"deepseek"` 固定；I7（`connectors/firecrawl/connector.ts:67`）同；glm/kimi/mimo/minimax/tavily/grok/codex 均写死 provider 名。`/balance` 类接口不返回账号标识，多 API key 实例在 store collapse，违反 domain.md §4 不变量 3（accountId 必须稳定且唯一）。

## 范围

- 抽统一 `account_id_from_key(key)` 工具（对 API key 做稳定 hash 生成区分后缀），或 host 层对「无稳定远端 id 的 poll 型连接器」自动加 key hash 后缀。
- 应用到无远端稳定 id 的连接器：deepseek、firecrawl、tavily、glm、mimo、minimax、codex（grok 走 OAuth 有稳定 id，评估是否需改）。
- account_id 格式：`{provider}` → `{provider}:{key_hash8}`（或 label 友好形式），保证同 provider 多 key 不 collapse。

## 非范围

- 不改有远端稳定账号 id 的连接器（如返回 accountId 的）。
- 不改 store schema（account_id 字段语义不变，仅值生成规则）。

## 验收标准

- [ ] 同 provider 多 API key 实例 account_id 不同（不 collapse）。
- [ ] key hash 稳定（同 key 每次生成同 account_id）。
- [ ] 单测覆盖 hash 稳定性 + 不同 key 不同 id。
- [ ] 现有连接器测试适配新 account_id 格式。

## 依赖与约束

- hash 不含密钥明文（单向）；account_id 不泄露 key 可逆。
- 执行时注意 t049-t051 新连接器（exa/getoneapi/tikhub）也遵循此规则（tikhub 已用 email，exa/getoneapi 按 key hash）。
