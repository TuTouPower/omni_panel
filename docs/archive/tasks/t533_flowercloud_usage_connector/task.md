---
tid: "t533"
slug: "flowercloud_usage_connector"
title: "FlowerCloud 花云网页会话用量连接器与重置时间展示"
status: "done"
branch: "t533_flowercloud_usage_connector"
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: "936679d737fb3d987384f3ab42c3738846e64e69"
depends_on: ""
conflicts_with: ""
note: "复用现有 web_login 会话登录与保活基建，新增 FlowerCloud 网页版连接器，真机登录过盾并闭环跑通真实用量抓取与面板展示"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

1. **架构注册与前端元数据集成**：在 `src/shared/schemas/plugin-output.ts`（及对应导出的 JSON Schema）、`src/renderer/lib/provider_registry.ts`、`src/renderer/components/Icon.tsx` 注册 FlowerCloud 厂商枚举、展示标签 `FlowerCloud (花云)` 及专属 SVG 品牌图标。
2. **连接器实现**：创建 `connectors/flowercloud/manifest.json` 与 `connector.ts`，声明 `session` 与 `web_login` 授权方式，通过请求客户区页面解析真实套餐名称（如 `Global Acceleration Max`）、流量比率（如 `297.11GB / 1000GB`）与账单到期日（如 `2026/10/07`），并在缺少日期时支持用户配置 `RESET_DAY` 优雅兜底。
3. **认证失效与保活**：在 `src/shared/lib/auth-error.ts` 匹配会话失效异常，未登录或 Cookie 过期时抛出标准错误触发既有重登管线。
4. **真实全流程走通（Live Dogfooding）**：调起 Electron 窗口，真实账号通过 Cloudflare Turnstile 质询，成功提取真实控制台 DOM 数据（`Global Acceleration Max`、`297.11GB / 1000GB`、`下次重置日: 2026/10/07`），实机验证闭环。
5. **门禁与测试覆盖**：编写 `tests/integration/connector/flowercloud_connector.test.ts`（9 项用例覆盖真实数据提取、服务详情跟进、兜底、401/403/质询拦截/缺失 Cookie 验证），全量 338 个测试套件（4173 项测试）100% 绿灯。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round 1 (2026-09-28 01:00 UTC+8)

Round 1 零 finding。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`pnpm check`（typecheck + lint + format:check + schema:check + deadcode + arch）全绿；全量 338 个测试套件 4173 项测试 100% 通过。
- 黑盒：实机真实账号登录过盾并成功提取用量数据（AC-006）。
- review：code review PASS（Round 1），test review PASS（Round 1），reviewed_scope 90006c8ed566c882。
- AC 证据：见 `handoff.json`

### 结果摘要

- 交付 FlowerCloud 网页版会话连接器及相关元数据与测试，实机闭环验证真实套餐用量与重置日展示。
