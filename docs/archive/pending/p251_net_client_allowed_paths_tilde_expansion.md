# p251 net-client 本地白名单路径未展开波浪号导致 codex 等连接器无法读取凭证与会话用量

- 现象：配置好的 codex 账号（如 `codex-user@example.com`）在应用中每次刷新均在 2ms 内失败并置为 failed，日志输出 `Connector ... (CODEX) returned no observations and no history; marked failed: connector returned no observations`。实际上本地存在有效的 `~/.codex/auth.json` 且远端接口正常，但无法获取任何配额和用量。
- 影响：所有在 `manifest.local.paths` 中使用 `~` 开头路径的连接器（当前确认：`codex`、`claude`），在真实运行时由 `create_connector_context` 创建上下文后，`ctx.files.read` 和 `ctx.files.list` 均被直接判定为 `Local file path is not allowed` / `Local directory is not allowed`，导致凭证读取与会话扫描完全失败；且连接器内空 catch 吞掉错误，排查隐蔽。
- 根因：
    1. 【产品缺陷】：`src/main/core/connector/net-client.ts` 中的 `is_within_allowed(path, allowed)` 在对白名单路径 `allowed` 执行 `normalize(root)` 时直接调用 `path.resolve(root)`，未调用 `expand_home(root)`。Node.js 的 `path.resolve` 将以 `~` 开头的路径当作当前工作目录下的相对字面量目录解析（如 `${cwd}/~/.codex/...`），而实际传入的待读路径已展开为真实绝对路径（如 `${homedir}/.codex/...`），导致前缀比对永远为 false，拒绝合法文件访问。
    2. 【已确认同类位点清单】：
        - `src/main/core/connector/net-client.ts:503-504`：`files.list` 仅做了 `expand_home` 未做 `resolve` 即传给 `is_within_allowed`，与 `files.read` 行为不对称。
        - `connectors/codex/connector.ts` 与 `connectors/claude/connector.ts`：本地读取 `auth_file` / `data_dir` 时用空 catch 吞没全部异常，未记录任何日志，导致白名单拒绝直接被伪装为「无文件跳过」。
- 测试缺口：
    1. `tests/integration/connector/codex-connector.test.ts`、`tests/integration/connector/codex-quota.test.ts`、`tests/integration/connector/claude-connector.test.ts` 均全部自行 mock `ConnectorContext`，完全绕过了生产代码的 `create_connector_context`。
    2. `tests/integration/connector/net-client.test.ts` 中的测试用例全部使用 `mkdtemp` 的绝对临时路径测试白名单，从未断言过 manifest 声明中以 `~` 开头的路径展开行为。
        应在 `tests/integration/connector/net-client.test.ts` 中补测包含 `~/` 的 manifest 白名单匹配，并在连接器层补充真实上下文集成验证与错误日志记录。
- 线索：`.scratch/repro.ts`（最小路径计算对比）、`.scratch/repro_full.ts`（真实上下文复现白名单报错）、`.scratch/repro_fix.ts`（展开波浪号后端到端成功读出 2 条配额）、`.scratch/test_quota_request.ts`（验证远端 wham/usage 接口及 wangyun 账号正常）。
- 处理：t501
