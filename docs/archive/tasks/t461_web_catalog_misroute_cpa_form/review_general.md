# Task review t461（reviewer_focus: 通用）

- task：`t461_web_catalog_misroute_cpa_form`
- spec：`docs/tasks/t461_web_catalog_misroute_cpa_form/spec.md`
- diff_anchor：`880fd64a3d52af5676dd9e35d24d3d8d9058a0e8`
- target：`git diff 880fd64a3d52af5676dd9e35d24d3d8d9058a0e8`
- round：1
- reviewed_at：2026-09-09 12:00 UTC+8

reviewed_scope: ef6738227e075536

## Findings

无。本轮 0 条 finding。

## 结论

- 本轮新发现：0 条
- 未进表的提示：
    - codex/antigravity 空 catalog 与有 catalog 的逐 vendor 用例未单列，kimi（全路径）+ claude（抽查）已覆盖同一 vendor 无关分支，可按需补 case，不阻断。
    - 回退守卫用 `c.source !== "gateway"` 字面量而非集中式 CPA 判断，当前 gateway ⟺ CPA（`src/main/ipc/connector-ipc.ts:31-39`），无可观测缺陷，仅风格观察。
- 总体判断：diff 精确修复空 catalog 误命中 CPA 网关实例的根因，鉴权与 /v1/connectors 对齐且无 secret 泄漏，测试触达可观察行为且独立复跑全绿，无 blocking 问题。
- 系统性 follow-up：无（spec 上下文区已规划 Web e2e follow-up，不重复建）。

### AC 复验方式

- AC-001（GET /v1/catalog 200，与桌面 connector:catalog 一致，kimi 为 oauth_device）：`re_verified`。`src/main/core/local-api/server.ts:1640-1646` 直接调用桌面 IPC 同源 `handleConnectorCatalog`（`src/main/ipc/connector-ipc.ts:156`，桌面注册于同文件 260 行）；独立重跑 `tests/integration/local-api/server.test.ts -t t461` 通过（真 manifest + 真 HTTP 无 token，断言 200 与 kimi oauth_device）。
- AC-002（点"添加 Kimi"显示 OAuth 设备码表单；Claude/Codex/Antigravity 解析到各自原生表单）：`re_verified`。catalog 命中分支（`AddAccountDialog.tsx:77-86`）未动，新单测 kimi + catalog 共存 CPA 实例时渲染"开始登录"/"OAuth 设备码授权"且无 CPA 表单；其余三 vendor 走同一 vendor 无关 exact-match 分支，既有 grok/exa/opencode catalog 用例佐证该分支。
- AC-003（catalog 为空时四 vendor 不再解析到 CPA 实例）：`re_verified`。守卫 `AddAccountDialog.tsx:87-96`（`vendor_id === "cpa" || c.source !== "gateway"`）；新单测覆盖 kimi 空 catalog 全保存路径（无 CpaMgmtForm/`manifest_id≠cpa`/`source_instance_id` 缺席）+ claude 抽查 + cpa 本体回归。
- AC-004（桌面端行为不变）：`re_verified`。两触及测试文件全量重跑 126/126 通过，无既有测试改动；守卫仅收窄回退分支，catalog 命中路径与 cpa 本体路径均有回归用例守护。

coverage = 4/4

verdict: PASS
