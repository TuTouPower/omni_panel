---
tid: "t489"
slug: "commandcode_balance_connector_and_official_icon"
title: "Command Code 额度连接器与官方品牌图标"
status: "done"
branch: "t489_commandcode_balance_connector_and_official_icon"
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: "3f4c6c788e6a0bbcb97d4ba54bd5c09afd0d390d"
depends_on: ""
conflicts_with: ""
note: "来源 p233：新增 commandcode 连接器(poll)、添加账号与官方 ⌘ 图标"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

1. 品牌与 UI 集成：
    - 提取 Command Code 官方品牌矢量徽标（黑底圆角矩形 + 白色 ⌘ 环路），生成 `src/renderer/assets/vendor_logos/commandcode.svg`。
    - 更新 `src/renderer/components/Icon.tsx`，导入并注册 `commandcode_svg` 至 `VENDOR_LOGOS`，并升级 `VENDOR_MARKS.commandcode` 为官方 ⌘ 矢量图。
    - 在 `src/renderer/lib/common-services.ts`、`src/renderer/lib/provider-usage.ts` 和 `src/shared/schemas/plugin-output.ts` 注册 `commandcode`，统一标签为 "Command Code"。
2. 连接器实现：
    - 声明 `connectors/commandcode/manifest.json`：能力声明为 `"poll"`，配置必填 `API_KEY`（secret）与可选 `API_BASE`。
    - 实现 `connectors/commandcode/connector.ts`：请求携带 `User-Agent: curl/8.7.1` 规避 Cloudflare 1010 拦截与 `Authorization: Bearer <key>`，调用 `/alpha/whoami`、`/alpha/billing/credits`、`/alpha/billing/subscriptions`。
    - 精确计算月额度（结合社区已知各套餐上限，如 individual-pro=30）、5 小时窗口用量与周窗口用量（含 `resetAt` 解析），并在 401/403/网络超时场景捕获产出包含 `last_error` 与 `status: critical` 的异常观察量。
3. 测试验证：
    - 编写 `tests/unit/connector/commandcode.test.ts`，覆盖 AC-001 ~ AC-004，8 个用例全部通过。
    - 更新 `tests/unit/renderer/components/icon.test.tsx`，验证 VendorMark 渲染官方 Command Code 资产。
    - 门禁 `pnpm typecheck`（0 error）与 `pnpm eslint`（0 error / 0 warning）均校验通过。

## Review 处置

Round 1 零 finding。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`tests/unit/connector/commandcode.test.ts` (8/8 PASS), `tests/unit/renderer/components/icon.test.tsx` (27/27 PASS)
- 黑盒：沙盒执行模拟验证 401、超时、常规用量解析与各窗口重置时间
- review：code review 与 test review 均 PASS（scope 82789bac759c81f0）
- AC 证据：见 `handoff.json`

### 结果摘要

- 实现了 Command Code 官方用量与余额连接器，配置 curl/8.7.1 UA 与 Bearer 鉴权，支持月额度、5 小时窗口和周窗口查询，遇到鉴权与网络异常安全产出 critical 观察量；
- 添加了 Command Code 官方 ⌘ 品牌图标并打通添加账号与用量视图全流程。
