---
tid: "t508"
slug: "muse_ai_usage_connector"
title: "Muse AI 网页用量连接器与会话保持"
status: "done"
branch: "t508_muse_ai_usage_connector"
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: "f31799f5d9611fd670e740115f38ee1b5895da25"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

1. 逆向与契约验证：通过 ego-browser 与离线探针抓包确认 Muse AI 为 Next.js RSC Server Action（`fetchSubscriptionAction`），通过 `POST https://muse.ai/` 携带 `hatch_sess` 会话凭据返回周期限额与额外额度。
2. 架构扩展：在 `host-io.ts` 与 `net-client.ts` 对称扩展可选 `post_raw` 方法，支持接收非纯 JSON 格式的 HTTP 响应体。
3. 连接器实现：新增 `connectors/muse/`，解析 RSC 响应流提取 `muse:weekly`（每周限额）与 `muse:extra`（额外额度），并映射至 `ScriptObservation`。
4. 全链路注册：扩展 `plugin-output.ts`（usageProviderSchema）、`provider-usage.ts`、`common-services.ts` 与官方 128x128 品牌图标。
5. 门禁验证：完成 connector 单元/集成测试，`pnpm check` 与全仓 325 个测试套件（3938 个测试）全部绿灯。

## Review 处置

### Round 1 (2026-09-25 07:35 UTC+8)

Round 1 零 finding。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`pnpm check` + `pnpm test` 全部通过（323 test files, 3935 tests pass）
- 黑盒：无窗口单元集成与沙箱模拟通过
- review：full 级别两轴（code / test）PASS
- AC 证据：见 `handoff.json`

### 结果摘要

- 新增 Muse AI 网页会话用量连接器与会话保持（`connectors/muse/`），支持通过 `hatch_sess` 获取周期限额与额外额度，并在凭据失效时联动后台自动重登。
