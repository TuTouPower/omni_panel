# Intensive Review — Full Repository @ eac8623b 2026-09-25

## Summary

- Scope: All files in repository (src/, connectors/, tests/, docs/, configs, scripts, assets) — 600+ tracked files
- Findings: C/H/M/L/Info = 0/2/4/3/1
- Verdict: REQUEST CHANGES (命中确定性矩阵：存在 High 级缺陷且当前自动化单测套件 `pnpm test` 校验失败)

______________________________________________________________________

## Critical / High (必修)

### 1. [H][95] `src/renderer/views/PopupView.tsx:589,781` & `ProviderOverview.tsx:102` — 卡片默认展开状态修改引入翻转 Bug 并破坏 5 个单测

- **位置**：
    - `src/renderer/views/PopupView.tsx:589-593, 780-786`
    - `src/renderer/components/ProviderOverview.tsx:99-105`
    - `tests/unit/renderer/views/popup_view_height.test.tsx:450, 470`
    - `tests/unit/renderer/views/popup_view_upcoming.test.tsx:79, 234, 313`
- **证据**：
    Commit `d1917ac8` 将 Provider 卡片默认展开状态由折叠（false）改为展开（`expandedProviders[provider] ?? true`），同时将切换逻辑修改为 `!(expanded_providers[provider] ?? true)`。然而：
    1. 在 `PopupView.tsx:781` 中，`UpcomingResetCard` 依然传入 `expanded_providers[UPCOMING_RESET_CARD_ID] ?? false`（默认折叠）。
    2. 当用户点击折叠的 `UpcomingResetCard` 时，触发 `toggle_expand_provider(UPCOMING_RESET_CARD_ID)`，计算得到 `!(undefined ?? true) = false`，导致卡片不但无法展开，反而被固化置为 `false`。
    3. 该改动未完整适配单测，直接破坏了 2 个测试文件共 5 个用例（找不到展开按钮或展开状态断言失败），导致当前主干 `pnpm test` 报错失败。
- **修复方案**：
    1. 在 `PopupView.tsx` 中区分常规 Provider 与特定系统卡片（`UPCOMING_RESET_CARD_ID`）的初始状态与切换逻辑，或者根据组件当前的真实布尔状态执行取反，防止 `undefined ?? true` 对初始为 false 的卡片产生翻转反噬。
    2. 更新并对齐 `popup_view_height.test.tsx` 与 `popup_view_upcoming.test.tsx` 中的断言预期，恢复 `pnpm test` 门禁全绿。

### 2. [H][90] `connectors/muse/connector.ts:37-38` — 硬编码 Next.js Server Action ID 与 Deployment ID 导致连接器高危脆弱

- **位置**：`connectors/muse/connector.ts:37-38`
- **证据**：
    ```ts
    const ACTION_ID = "407c800bb93d1539e5152b02e7f8ed6a82a7729a86";
    const DEPLOYMENT_ID = "dpl_8qUvxpGTkFRhdjPKF4KXaVBdQCk3";
    ```
    Next.js Server Action 的 `next-action` ID 与 `x-deployment-id` 是由 Next.js 构建系统在每次源码编译时生成的瞬态哈希。一旦 Muse AI 线上发布任意更新（即使是微小补丁），该 ID 即刻失效，服务端将返回 404 或 `Invalid Server Action ID`，导致连接器彻底停摆，无任何运行时自愈机制。
- **修复方案**：
    在请求前通过 HTTP 请求获取 Muse AI 页面 HTML，动态提取当前的 `x-deployment-id` 与 Action ID（类似 `opencode_go` 网页抓取的方式）；或至少在文档、测试与注释中明确记录该版本耦合缺陷，并在遇到请求失败时抛出包含排查指南的明确错误。

______________________________________________________________________

## Medium / Low / Info (建议)

### 3. [M][85] `src/main/core/connector/net-client.ts:528-535` — 本地文件沙箱未能防御上级目录符号链接逃逸

- **位置**：`src/main/core/connector/net-client.ts:528-535`
- **证据**：
    ```ts
    const stat = await lstat(resolved_path);
    if (stat.isSymbolicLink()) {
        const real = await realpath(resolved_path);
        if (!is_within_allowed(real, allowed)) {
            throw new Error("Local file path is not allowed");
        }
    }
    return readFile(resolved_path, "utf8");
    ```
    `lstat` 仅判断目标叶子节点本身是否为软链接。如果白名单路径内的中间目录是指向沙箱外目录的软链接（例如 `~/.config/app/link -> /etc`），`stat.isSymbolicLink()` 为 false，`readFile` 将直接读取沙箱外文件。
- **修复方案**：
    统一对 `resolved_path` 执行 `const real = await realpath(resolved_path)`，并在 `is_within_allowed(real, allowed)` 验证通过后方允许读取。

### 4. [M][85] `package.json:36` & `docs/blueprint/conventions.md:91` — `pnpm check` 复合门禁脚本遗漏 `pnpm test`

- **位置**：`package.json:36`、`docs/blueprint/conventions.md:91`
- **证据**：
    `package.json` 的 `"check"` 定义为 `"pnpm typecheck && pnpm lint && pnpm format:check && pnpm deadcode && pnpm arch"`，并未执行 `pnpm test`。然而 `conventions.md:91` 明确写道“合并前跑 pnpm check 与 pnpm test”。这直接导致开发者在本地执行 `pnpm check` 全绿后未察觉单测失败，将破坏性提交合入分支。
- **修复方案**：
    将 `package.json` 中的 `check` 脚本补齐为包含 `pnpm test`，实现真正的全量本地预检门禁。

### 5. [M][80] `docs/handoff.md:3-5` & `docs/specs_index.md` — 核心交接文档与 Spec 索引严重脱节滞后

- **位置**：`docs/handoff.md:3-5`、`docs/specs_index.md:19-100`、`docs/blueprint/architecture.md:73`
- **证据**：
    1. `docs/handoff.md` 最后更新日期为 2026-08-16，commit 为 `eb9bb45d`，记录着已过时的 CDP 挂起调试内容，已滞后一个多月，违反了 AGENTS.md 中“项目级交接（仅最新一节），含 branch 与交出时 head_commit”的要求。
    2. `docs/specs_index.md` 缺少近期已归档的 `t507` (Grok Bot PKCE)、`t508` (Muse AI)、`t492` 等任务的 spec 索引。
    3. `docs/blueprint/architecture.md:73` 仍声称“17 个内置连接器”，实际已有 20 个内置连接器（新增了 grok_bot, kimi_web, muse 等）。
- **修复方案**：
    更新 `docs/handoff.md`，将过时章节迁入 `docs/archive/handoff.md`，记录当前 HEAD；在 `docs/specs_index.md` 中按 task 归档补齐最新 specs。

### 6. [M][80] `src/renderer/views/DevPanelView.tsx:94-96` — 挂载即开启 1000ms 高频无条件 IPC 轮询

- **位置**：`src/renderer/views/DevPanelView.tsx:94-96`
- **证据**：
    ```tsx
    useEffect(() => {
        void refresh_status();
        const timer = window.setInterval(() => {
            void refresh_status();
        }, 1000);
        return () => {
            window.clearInterval(timer);
        };
    }, [refresh_status]);
    ```
    在未处于扫描状态（idle）或者窗口不可见时，依然保持每秒 1 次的固定 IPC 调用 `getStatus()`，持续唤醒事件循环与主进程。
- **修复方案**：
    根据 `state.status` 动态调整轮询周期（仅在 scanning 时 1s，其余状态降为 10s 或按需触发），并监听 `visibilitychange` 事件在窗口隐藏时暂停。

### 7. [L][85] 全库目录与文件名命名规范割裂（kebab-case 与 snake_case 并存）

- **位置**：`src/main/`、`src/renderer/`、`src/shared/`、`docs/specs/` 等 360+ 文件与 170+ 目录
- **证据**：
    `conventions.md:21` 规定“变量、函数、文件名、目录名一律 snake_case”。但项目中大量核心目录（`dev-panel`, `local-api`, `main-panel`, `session-history`, `token-stats`）与大量生产文件（`net-client.ts`, `config-store.ts`, `auth-ipc.ts`）均为 kebab-case，而新文件则命名为 `grok_bot_auth_ipc.ts`, `device_code_oauth_manager.ts`。规范文档未对历史文件和目录制定明确的豁免或渐进式迁移规则。
- **修复方案**：
    在 `conventions.md` 中补充“历史非 renderer 代码与目录保持既有 kebab-case 不做全量重命名，避免跨分支冲突，新模块统一采用 snake_case”的明确规则。

### 8. [L][80] `public/` 目录下放置中文字符压缩包与完整 demo 前端项目

- **位置**：
    - `public/Kimi_Agent_多会话历史工具.zip`
    - `public/Kimi_Agent_多会话查看器.zip`
    - `public/frontend_demo/`
- **证据**：
    1. `public/` 根目录下存在带有中文与空格的 `.zip` 压缩包，在多平台 checkout、构建打包与静态分发时存在编码与跨平台兼容性隐患。
    2. `public/frontend_demo/` 包含一个完整的独立 React 项目（含 package.json、pnpm-lock.yaml、node_modules 规则），混在公共静态资源目录下，容易造成打包产物污染。
- **修复方案**：
    将独立 demo 移至仓库专门的 `demos/` 目录；压缩包等二进制资产通过 Release 附件或专门的 release bucket 分发，避免直接签入源码仓库根级 public 目录。

### 9. [L][75] `src/renderer/components/Icon.tsx:250-258` — MiMo 连接器未在 Icon.tsx 注册为正式 SVG 资源

- **位置**：`src/renderer/components/Icon.tsx:250-258`、`src/renderer/assets/vendor_logos/mimo.svg`
- **证据**：
    资产目录存在 `src/renderer/assets/vendor_logos/mimo.svg`，但在 `Icon.tsx` 的 `VENDOR_LOGOS` 中未引入该文件，而是在 `VENDOR_MARKS` 中内联了一个长达数百字符的 SVG 字符串。相比其他连接器（claude, codex, kimi 等）均走统一的外部资产导入并享有更好的主题与缓存管理，MiMo 成为例外遗留。
- **修复方案**：
    在 `Icon.tsx` 中导入 `mimo_svg from "../assets/vendor_logos/mimo.svg"` 并注册到 `VENDOR_LOGOS.mimo`。

### 10. [Info][70] `src/renderer/components/Icon.tsx:191` — 组件直接调用 `console.warn`

- **位置**：`src/renderer/components/Icon.tsx:191`
- **证据**：
    ```tsx
    if (import.meta.env.DEV) {
        console.warn(`Icon: unregistered name "${name}"`);
    }
    ```
    `conventions.md:71` 明确禁止直接使用 `console.warn`，应统一走 `src/shared/lib/logger.ts`。
- **修复方案**：
    替换为统一 logger：`const log = createLogger("renderer:icon"); log.warn(...)`。

______________________________________________________________________

## Spec Compliance (对照相关 Specs 与 Conventions)

- **conventions.md §测试与质量门**：`pnpm test` 失败，违反“日常测试全部绿”硬约束；`package.json` 缺少 `pnpm test` 作为 `check` 子项。
- **conventions.md §命名与格式**：大量现有目录和文件呈现 kebab-case 与 snake_case 混合分裂，规范未覆盖 main 进程历史兼容策略。
- **AGENTS.md §目录权责**：`docs/handoff.md` 与 `docs/specs_index.md` 滞后超过 1 个月未更新。
- **architecture.md §2 目录结构**：内置连接器数量描述滞后（文中标注 17 个，实际已演进至 20 个）。

______________________________________________________________________

## Strengths

1. **严格的类型系统与边界防护**：`tsconfig.json` 配置了极高的严格级别（包括 exactOptionalPropertyTypes、noImplicitReturns、noUncheckedIndexedAccess 等），全库无类型报错。
2. **严密的 IPC Sender 白名单校验**：所有 IPC Handler 均统一显式调用了 `assert_valid_sender(event)` 进行精确的 URL pathname 比对，彻底杜绝了外部网页恶意 origin 提权。
3. **架构分层清晰且有工具看护**：通过 dependency-cruiser 严格约束主进程、渲染进程、preload、shared 的单向依赖，架构检测 0 违规；并通过 knip 有效清理死代码。
4. **日志脱敏与审计健全**：统一走 `logger.ts` 配合 inline scrubber，开发与生产环境均自动对 secret 脱敏为 `***`。

______________________________________________________________________

## Appendix — Traceability

- `tests/unit/renderer/views/popup_view_height.test.tsx`
- `tests/unit/renderer/views/popup_view_upcoming.test.tsx`
- `connectors/muse/connector.ts`
- `src/main/core/connector/net-client.ts`
- `src/renderer/views/PopupView.tsx`
- `src/renderer/views/DevPanelView.tsx`
- `docs/blueprint/conventions.md`
- `docs/blueprint/architecture.md`
- `docs/blueprint/testing.md`
- `docs/handoff.md`
- `docs/specs_index.md`
