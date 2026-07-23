# 直连连接器（direct connectors）

一对一型：一实例 = 一账号 = 一 provider。运行时契约见 `connector-runtime.md`。术语见 `domain.md`。

## 内置清单（`connectors/<id>/`）

| id            | provider    | 能力    | 形态 | 说明                                                                                                                                |
| ------------- | ----------- | ------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `claude`      | claude      | local   | 直连 | 读 `~/.claude` 本地用量                                                                                                             |
| `codex`       | codex       | local   | 直连 | 读 `~/.codex` 本地用量                                                                                                              |
| `deepseek`    | deepseek    | poll    | 直连 | 官方用量 API                                                                                                                        |
| `glm`         | glm         | poll    | 直连 | 智谱 API                                                                                                                            |
| `minimax`     | minimax     | poll    | 直连 | MiniMax API                                                                                                                         |
| `tavily`      | tavily      | poll    | 直连 | Tavily API                                                                                                                          |
| `firecrawl`   | firecrawl   | poll    | 直连 | Firecrawl API                                                                                                                       |
| `exa`         | exa         | poll    | 直连 | Exa 团队 API（`x-api-key` service key）；成本型 `total_cost_usd` + `cost_breakdown`，无远端 limit，用户自定预算 LIMIT（t049）       |
| `mimo`        | mimo        | session | 直连 | 受控网页登录捕获 cookie                                                                                                             |
| `kimi`        | kimi        | poll    | 直连 | Kimi Code API（API Key）                                                                                                            |
| `opencode_go` | opencode_go | session | 直连 | 受控网页登录捕获 cookie                                                                                                             |
| `antigravity` | antigravity | local   | 直连 | 读 `~/.antigravity/session.json`                                                                                                    |
| `grok`        | grok        | poll    | 直连 | Grok API（OAuth device-code）；billing 200 但零有效 usage 字段时 connector 须 `report_failed_account`，不得静默 `return []`（t039） |

## 能力分发（`refresh-service.execute_connector`）

- 有 `script` → 跑脚本（vm 沙箱，见 `connector-runtime.md`）
- 否则 `poll` → `tier1-poll-executor`（宿主发 HTTP，`resolve_json_path` 取 `map`，盖 `observed_at` / `source:"poll"`）
- 否则 `observe.probe` → `probe-executor`（取响应头，`source:"probe"`）
- `local` / `session` 无独立 executor —— 都靠 script 分支 + `ctx.files` / vault cookie

## poll 型行为

- manifest `poll.request`（endpoint/path/method/auth/body）+ `poll.map`（used/limit/remaining 须 `$` 开头）。
- secret 经 `apply_auth`（bearer/header/query）注入宿主请求，**不进沙箱**。
- 例：tavily / firecrawl / deepseek / glm / minimax / exa（脚本读 `total_cost_usd`+`cost_breakdown`，成本正向 status，无远端 limit）。

## local 型行为

- manifest `local.paths[]`（≥1）。
- 脚本经 `ctx.files.read` / `ctx.files.list` 读本地凭证或用量文件。
- 例：claude（`~/.claude`）、codex（`~/.codex`）。

## session 型行为

详见 `connector-session.md`。受控网页登录捕获 cookie，存 vault，脚本经 `ctx.http` 带 cookie 采集。

session 连接器在 manifest 声明 `loginDomains: string[]`（允许的登录域名白名单）与 `cookieNames: string[]`（命中即视为捕获成功的 cookie 名，支持 `"*"` 通配）。schema 定义见 `src/shared/schemas/manifest.ts:91-92`；实例见 `connectors/mimo/manifest.json`、`connectors/opencode_go/manifest.json`。

## observe 型行为（被动观测）

- manifest `observe.headers[]`（≥1）+ 可选 `probe`。
- `probe-executor` 发最小请求从响应头提取用量，`source:"probe"`。
- 探测自适应（arch-v2 §6.1 规划，部分实现）：剩余多低频、剩余少高频。

## 多账号

直连同一 provider 可配多实例（如 GLM 两个 key = 两个独立直连数据源，两行）。每个 `accountId` 由 manifest/脚本返回的稳定标识生成（host-authority，非 script-declared，见 commit `3238d1e`/`13c3737`）。
