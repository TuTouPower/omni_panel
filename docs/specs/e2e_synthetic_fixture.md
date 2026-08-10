# e2e synthetic fixture

## 行为

- `pnpm e2e:gen-synthetic` 从本机录制的 `tests/e2e/fixtures/data/responses.json` 取前若干 instance 脱敏，写入入库文件 `tests/e2e/fixtures/synthetic.json`。
- 生成物始终包含固化条目 `synthetic-kimi-failed`（KIMI failed + item-level error）与 `synthetic-opencode-go`（多 workspace × rolling/weekly/monthly），供 web e2e 锚点用例使用；再生成不得丢弃。
- 生成写出格式对齐仓库 prettier（tabWidth=4 及短数组折叠等），再生成幂等、`pnpm format:check` 对该文件无 warn。
- mock local-api（`tests/e2e/fixtures/mock_server.mjs`）在按 `/v1/config` 的 `plugins` 重建 connector 列表时，保留 fixture 中初始 config 未收录的 synthetic-only connector；不会把已从 config 删除的真实 plugin 从 initial fixture 复活。

## 验证

- 单测：`tests/unit/e2e/mock_server.test.ts` 守护 synthetic-only 保留与 config 删除不复活。
- 黑盒：`MOCK_FIXTURE=synthetic pnpm test:e2e:web`（含 `account_error_badge` / `opencode_go_usage`）；`pnpm e2e:gen-synthetic` 后 connector 仍在且 prettier / format:check 通过。
