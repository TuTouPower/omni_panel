# p105 web e2e synthetic fixture 重建丢失手工 connector 条目（2026-08-10）

- 来源：t277 实施期全量 Web E2E；t277/t278 黑盒复测补充
- 内容：`tests/e2e/fixtures/synthetic.json` 的 `synthetic-kimi-failed` 与 `synthetic-opencode-go` 为手工写入条目（`synthetic-opencode-go` 无对应配置 plugin）；`tests/e2e/fixtures/mock_server.mjs` 的 `sync_connectors()` 依据 `/v1/config` 重建 connector 时，这两类无 config 匹配的 synthetic connector 会被丢弃。后果：`tests/e2e/web/account_error_badge.spec.ts` 与 `opencode_go_usage.spec.ts` 在 `MOCK_FIXTURE=synthetic` 下稳定失败（基线问题，非 t277/t278 引入，主仓同失败）。关联历史：`gen_synthetic.mjs` 重生成覆盖手工条目曾在 p021 登记；修法候选：让 mock 的 config 重建保留 synthetic-only connector，或 sync 时跳过无 config 匹配的 synthetic connector，或补充 fixture 生成脚本产出。
- 处理：t281
