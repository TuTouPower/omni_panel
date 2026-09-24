---
tid: "t507"
slug: "grok_bot_usage_connector"
title: "Grok Bot 用量连接器与 Browser PKCE 认证"
status: "done"
branch: "t507_grok_bot_usage_connector"
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: "f41e6a441a2e9741e83f351c0485d9ab0bf7542c"
depends_on: ""
conflicts_with: ""
note: "参考 https://github.com/kargatharaakash/grok-bot-mcp"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

1. 在 `src/shared/schemas/plugin-output.ts` 注册 `grok_bot` 到 `usageProviderSchema`，在 `src/shared/schemas/auth.ts` 注册 `oauth_pkce` 到 `authMethodSchema`，执行 `pnpm schema:export` 同步导出 JSON Schema。
2. 构建独立连接器 `connectors/grok_bot/`（`manifest.json` 与 `connector.ts`），在沙箱内纯算法实现 `x-cursor-checksum` 签名与 UUID 生成，调用 official Sand/Period 接口并归一化输出周用量与按需额度指标。
3. 实现主进程 `GrokBotOAuthManager`，封装标准 PKCE 网页登录与后台轮询流，双 Token（Access + Refresh）加密存入应用专有 Vault，并支持 401 时的静默换票与原子更新。
4. 接入主进程 IPC、`refresh-service` 静默刷新依赖与 preload `UsageboardApi`，并在 web bridge 注入对应 stub。
5. 渲染层注册服务目录、图标及 `GrokBotPkceForm` 授权表单（兼支持手动输入 Token 备选）。

## Review 处置

Round 1 零 finding，未进处置表。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`pnpm check`（typecheck + lint + format + deadcode + arch）PASS；`pnpm test` 3930 tests PASS；`pnpm build` PASS
- 黑盒：纯算法签名、沙箱运行、端点请求、PKCE 授权及表单保存全链路测试 PASS
- review：Round 1 code PASS；Round 1 test PASS
- AC 证据：见 `handoff.json`

### 结果摘要

- 独立闭环实现 Grok Bot 用量连接器、主进程 Browser PKCE 登录、Vault 凭据存储与长效静默续期，完全不依赖外部项目与目录。
