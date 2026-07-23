# Task review t062（reviewer_focus: 代码）

- task：`t062_ipc_route_guard`
- spec：`docs\tasks\t062_ipc_route_guard/spec.md`
- diff_anchor：`428e5b46d2f98c7ce056b5741ca051a50d3be4c9`
- target：`git diff 428e5b46d2f98c7ce056b5741ca051a50d3be4c9`
- round：1
- reviewed_at：2026-07-23 17:05 UTC+8

## Findings

### t062_code_f001 - file:// 校验未与 rendererIndexPath 白名单比对，弱于 spec 要求

- 严重度：important
- 位置：`src/main/ipc/helpers.ts:29`
- 问题：spec（`docs/tasks/t062_ipc_route_guard/spec.md:10`）明确「file:// 校验：与 `rendererIndexPath` 白名单比对，拒绝非打包 index.html 路径」。实现用 `u.pathname.endsWith("index.html")`——任意名为 `index.html` 的 file:// 路径都放行。
    - 复现：`event.senderFrame.url = "file:///D:/attacker/index.html"` → `new URL(url).pathname = "/D:/attacker/index.html"` → `endsWith("index.html")` 为 true → 通过校验。
    - spec 要求比对 `rendererIndexPath`（`src/main/index.ts:113` 传入 `resolve(join(__dirname, "../renderer/index.html"))`，在 `window-manager.ts:89` 作为字段），应只放行打包 renderer 入口那一个具体路径。
    - 安全语义：本 task 背景（I15）是「`url.startsWith("file://")` 任意路径放行」；实现把「任意路径」收窄成「任意 index.html 路径」，门槛降低未消除。若攻击者通过 XSS + 本地文件落盘组合让 renderer 导航到 `file:///D:/attacker/index.html`，该页 IPC 调用会通过 sender 校验。
    - 实现侧未引入 `rendererIndexPath`（helpers.ts 是纯函数模块，未注入该字段）——这是实现选择简化，非 spec 允许的偏差。
- 建议：把 `rendererIndexPath` 注入 `assert_valid_sender`（或模块级），规范化比较 `new URL(url).pathname` 与 `new URL(pathToFileURL(rendererIndexPath)).pathname`；至少比对 `pathname === fileURLToPath(...)` 的规范化路径。保持跨平台（Win pathname 含盘符 `/D:/...`）。

### t062_code_f002 - assert_setting_route 用子串匹配，精确度低于 preload 侧分权

- 严重度：minor
- 位置：`src/main/ipc/helpers.ts:63`
- 问题：`if (!hash.includes("setting"))` 是子串匹配。任何 hash 含 "setting" 字样的 URL 都放行，例如 `file:///index.html#not-setting`、`#my-setting-page` 均通过。preload 侧是 `current_route = window.location.hash.slice(1) || "usage"` 后 `route === "setting"`（`src/preload/index.ts:357`、`src/preload/route_api.ts:8`）——精确匹配。主进程校验反而弱于被它「兜底」的 preload 防线。
    - 攻击增量有限：攻击者可直接 `location.hash = "setting"` 通过本校验，故未实质扩大攻击面。但精确度差导致语义可预测性下降，未来新增含 "setting" 子串的 route 名会意外被放行。
- 建议：改为 `if (hash !== "#setting")` 或 `new URL(url).hash.slice(1) === "setting"`，与 preload 分权保持一致。

## 结论

- 前轮 finding 复核：N/A（Round 1）。
- 本轮新发现：2 条（f001 important、f002 minor）。
- 总体判断：dev_url origin 比对（I15）正确到位；file:// 校验实现偏离 spec 的 rendererIndexPath 白名单要求（f001），assert_setting_route 子串匹配精度低于既有 preload 防线（f002）。CONFIG_GET_SECRETS 双 assert 顺序合理。helpers.ts 113 行未超膨胀阈值；`assert_valid_sender` CC≈9 未超阈值。

verdict: FAIL

## Round 2 (2026-07-23 17:32 UTC+8)

### 前轮 finding 复核

#### t062_code_f001 - file:// 校验未与 rendererIndexPath 白名单比对

- 复核结论：**未修**（adoption 处置：遗留）
- 当前实现：`src/main/ipc/helpers.ts:29` 仍为 `u.pathname.endsWith("index.html")`，diff `428e5b4..HEAD` 未触及该行。
- spec 合规性事实不变：`docs/tasks/t062_ipc_route_guard/spec.md:10` 明确「file:// 校验：与 `rendererIndexPath` 白名单比对」，实现未引入 `rendererIndexPath`，未达 spec。
- 遗留裁决合理性复核（独立验证，非信任 implementer 自述）：
    1. 架构约束成立：`src/main/ipc/helpers.ts:1-3` 仅 import electron 类型与 shared types，是纯函数模块；`assert_valid_sender(event: IpcMainInvokeEvent)` 签名无 `rendererIndexPath` 入参。注入需改签名或加模块级状态——非本 task 范围内改动。
    2. 增量方向正确：原 Round 0（review_20260723_opus I15）描述为「`url.startsWith("file://")` 任意路径放行」；现实现拒绝 pathname 不以 `index.html` 结尾的 file://（如 `.svg`/`.pdf`/无扩展名文件），收紧方向正确。
    3. 残留风险（finding 仍开放的技术依据）：`file:///D:/attacker/index.html` 仍通过校验，与 spec「拒绝非打包 index.html 路径」字面冲突。
- reviewer 立场：遗留处置在本 task 约束下技术合理，但属 adoption 决策范畴；reviewer 不因此撤回 spec 合规性 finding。finding 保持开放，等待 spike 或加轮。

#### t062_code_f002 - assert_setting_route 子串匹配

- 复核结论：**已修**
- 当前实现：`src/main/ipc/helpers.ts:63` `if (hash !== "#setting")`，精确匹配，符合 Round 1 建议。
- 修复正确性：`hash` 来自 `new URL(url).hash`（helpers.ts:59），对 `file://...#setting` 与 `http://localhost:5173/#setting` 均返回 `#setting`，与 preload 侧 `route === "setting"`（`src/preload/route_api.ts:8`）语义一致。
- 边界：空 URL / 无 hash / invalid URL → `hash=""` → 拒绝（helpers.ts:60-62, 63），符合「非 setting route 被拒」AC。

### 本轮新发现

无。修复 diff（`428e5b4..HEAD`）仅触及 `helpers.ts:63` 单行（`includes` → `!==`）+ 注释行，无新逻辑面；`assert_setting_route` 函数体 Round 1 已审，本轮无变化。

### 结论

- 前轮 finding 复核：f001 未修（遗留裁决技术合理，finding 仍开放），f002 已修。
- 本轮新发现：0 条。
- 总体判断：f002 修复到位；f001 因 helpers 模块架构约束（无 rendererIndexPath 上下文）在本 task 内无法闭环，adoption 处置为遗留，等待 spike 或加轮。按共享规则 `PASS ⟰ 前轮全修/撤回`，f001 既未修也未撤回 → FAIL。

verdict: FAIL
