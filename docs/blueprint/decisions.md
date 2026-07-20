# 决策记录（ADR）

只记录已经确认、影响后续工作的非显然决策。追加新条目，不重写历史；决策被替代时，新条目通过“替代”字段引用旧编号。

条目格式：

```markdown
## NNN 标题（YYYY-MM-DD）

- 背景：为什么需要决策
- 选项：考虑过什么
- 结论：选了什么，为什么
- 替代：旧决策编号；无则写“无”
```

## 001 从 omni_powers 迁移到 repo_template 工作流（2026-07-20）

- 背景：OmniUsage 原用 omni_powers 三区工作流（`op_blueprint`/`op_execution`/`op_record`）+ 全局 skill（`/opintake` 等），与用户维护的 `repo_template` 通用仓库模板不兼容。
- 选项：A) 保留 omni_powers；B) 全量迁移到 repo_template 纯文档工作流（`AGENTS.md` + `blueprint/tasks/specs/reviews/spikes/archive`）。
- 结论：选 B。废弃 omni_powers 三区（整体归档至 `docs/archive/omni_powers_sunset/`），引入 `AGENTS.md` + `blueprint/tasks/specs/reviews/spikes/archive` 结构。task ID 从 T001 起编。本次元重构本身不挂 TNNN，由本 ADR 追溯。
- 替代：无

路径映射（供 `git log -S` 与旧路径追溯）：

- `op_blueprint/architecture.md` `domain.md` → `docs/blueprint/`
- `op_blueprint/conventions.md` → `docs/blueprint/conventions.md`（合并 template 元约定 + 项目编码约定）
- `op_blueprint/specs/*.md` → `docs/specs/`
- `op_blueprint/spec_index.md`（功能目录，2 列）→ 内容并入 `docs/specs_index.md`（状态台账，5 列）；按域分类见 `docs/blueprint/architecture.md` §4 数据流
- `op_blueprint/prd.md` → 一句话定位 + 介绍拆入 `README.md` / `AGENTS.md`；明确不做拆入 `docs/blueprint/domain.md`；原件归档
- `op_blueprint/test.md` → `{test_cmd}` / `{blackbox_cmd}` 填入 `AGENTS.md` 硬约束；测试规范并入 `docs/blueprint/conventions.md` “编码与测试”小节；详细命令清单入 `docs/guides/testing.md`；原件归档
- `op_record/decisions.md`（空）→ `docs/blueprint/decisions.md`（本文件）
- `op_record/progress.md`（空）→ `docs/handoff.md`
- `op_execution/*` + `docs/tasks/T1-T8_*` → `docs/archive/`（T1-T8 入 `archive/tasks/`）
- `docs/research/` `docs/design/` → `docs/archive/research/` `docs/archive/design/`
- T1-T8 历史提交 SHA：`5efb68a`、`30d078b`（原编号 T1..T8；`git log --grep` 仍可用原编号）

## 002 横屏响应式选 CSS 容器查询而非 @media（2026-07-20）

- 背景：T004 让 usage 窗在 472–1400px 宽度范围自适应（窄 popup / 横屏管理台 / web 浏览器）。需选响应式机制。
- 选项：A) `@media`（按窗口宽度）；B) CSS 容器查询（`container-type: inline-size` + `@container`，按容器宽度）。
- 结论：选 B。容器查询按容器宽度响应，Electron 窗口拖宽、浏览器 web 版、未来内嵌模拟框共用一套布局逻辑；`@media` 无法区分容器 vs 窗口。断点 1024/640 沿用 demo 阈值。Electron 42（Chromium 105+）满足 container queries 支持。
- 替代：无

## 003 不新增 Electron 横屏主窗，放开 usage 窗 maxWidth 承担横屏（2026-07-20）

- 背景：demo 设想新增 1440×900 Electron 横屏主窗。本项目 web 构建版（`vite.web.config.ts` → `out/web/`）已承担浏览器横屏载体。
- 选项：A) 新增 Electron 横屏主窗（demo 原版）；B) 放开 usage 窗 `maxWidth`（780→1400）+ 容器查询，同一份渲染层覆盖桌面横屏。
- 结论：选 B。再开 Electron 横屏窗与 web 版职能重叠；放开 `maxWidth` + 容器查询改动最小，web 版自动复用同一套 `@container` 断点。`maxWidth` 定 1400（不取消——避免 4K 屏拉到极宽 auto-fill 成 10+ 列 UX 恶化）。
- 替代：无

## 004 横屏多列拖拽补 clientX hit-testing（D2=B，2026-07-20）

- 背景：现有 `compute_drag_reorder` 仅 `clientY` 垂直 midpoint guard（单列假设）。横屏多列同行水平拖拽时垂直 guard 阻止 commit，视觉与语义不一致。
- 选项：A) 多列下禁用拖拽；B) 补 `clientX` 多列 hit-testing；C) 多列按单列 DOM 语义不标注。
- 结论：选 B。`compute_drag_reorder` 加 `axis: "x" | "y"` 参数（默认 "y" 向后兼容）；caller（`PopupView.handle_drag_over`）按 `drag_rect.top` vs `over_rect.top` 判定 same_row 选轴。`drag_rect` 在 `onDragStart` 捕获、`onDragEnd` 清理。已知遗留：reorder 后 `drag_rect` state 过时，多步拖拽退化垂直 guard（见 T004 task_report）。
- 替代：无

## 005 账号展开区 sparkline 出图，解除「第一版不出图」边界（2026-07-20）

- 背景：`domain.md §6` 原「不做趋势图 UI（SQLite 留了历史数据，但第一版不出图）」是第一版产品边界。T006 计划在账号展开区引入近 7 天 sparkline 迷你走势，打破该边界。
- 选项：A) 新开 T007 先解除边界 + 记录决策，T006 实施；B) T006 单 task 内同时改 domain + 实施；C) 放弃 sparkline。
- 结论：选 A（审阅 adoption D1=A 决策）。`domain.md §6` 改写为「完整多维趋势仍归 TokenStats 独立窗口；账号展开区出 sparkline」。符合「长期真相延后」「单 task 单 commit」硬约束。T006 实施时引用本条。
- 替代：无（原边界追溯：`domain.md §6` 第一版 commit）

## 008 web e2e 不进 CI + webServer 顶层保留（2026-07-21）

- 背景：T010 web e2e 需本机录制 fixture（`tests/e2e/fixtures/data/` gitignore，含真实账号），CI 干净环境无 responses.json 跑不了。`playwright.config.ts` `webServer` 顶层配置致 electron/packaged project 跑时也启 vite preview（浪费，5174 空闲时不阻塞）。
- 选项：CI web e2e A) synthetic seed fixture 入库供 CI smoke；B) 跳过 web project（CI 只 vitest + packaged smoke）。webServer A) 拆 web 独立 playwright config；B) 保留顶层。
- 结论：CI 选 B（web e2e 作本地开发反馈，不作 CI 门禁；CI 由 vitest 单元/集成 + packaged smoke 覆盖产物可用性；Electron 驱动 nightly 跑）。webServer 选 B（Playwright 无 project 级 webServer，拆独立 config 增维护成本 > 节省的 vite preview 启动开销）。
- 替代：无
- 落地（T015, 2026-07-21）：CI web e2e 通道已恢复——`scripts/e2e/gen_synthetic.mjs` 从真实 responses 脱敏取 3 instance 子集 → `tests/e2e/fixtures/synthetic.json` 入库；CI `MOCK_FIXTURE=synthetic pnpm test:e2e:web` 跑 web smoke。CI 选项 B 的"不作门禁"被 synthetic fixture 取代（CI 现跑 synthetic web smoke）；webServer 保留顶层。
- 遗留：无（CI web 通道已恢复；real fixture 仍仅本地）。

## 006 dev CSP 放开 'unsafe-inline' 让 @vitejs/plugin-react preamble 能注入（2026-07-20）

- 背景：`pnpm start`（electron-vite dev）启动后 renderer 全黑。带 `ELECTRON_ENABLE_LOGGING=true` 抓 console 看到 `@vitejs/plugin-react can't detect preamble`——plugin-react 注入的 React Refresh preamble 是 inline `<script type="module">`，被 dev CSP `script-src 'self' http://localhost:5173 'unsafe-eval'`（无 `'unsafe-inline'`）拦截，所有 `.tsx` 模块加载失败。打包版（prod CSP `'self'`、无 React Refresh）不受影响。
- 选项：A) dev CSP `script-src` 加 `'unsafe-inline'`；B) 给 preamble 用 nonce/hash；C) 关闭 React Refresh（`@vitejs/plugin-react` 设 `fastRefresh:false`）。
- 结论：选 A。dev 本地无攻击面，`'unsafe-inline'` 可接受；nonce/hash 需改 plugin-react 注入方式，成本高；关 fastRefresh 丢失 HMR 体验。prod CSP 严格不变（仍 `'self'`）。CSP 构造抽到 `src/main/security/csp.ts` 纯函数 + 单测覆盖 dev/prod 两路防回退。
- 替代：无

## 007 web e2e 用 mock local-api 回放录的真实响应，不开桌面 app（2026-07-21）

- 背景：T009 改名后 e2e 仍靠 Electron 驱动（开桌面 app），平台绑定、慢、CI 重。用户要求日常 e2e 跑浏览器测网站。web SPA（`out/web`）数据全来自 local-api（端口 17863），后端必须有。
- 选项：A) Electron 后端（浏览器前端 + 真实 Electron 提供 local-api，仍开桌面 app）；B) mock local-api（录本机真实响应，Playwright chromium 纯浏览器驱动）；C) 读 config/snapshot 文件合成 mock（零 Electron 但合成逻辑要复刻 local-api）。
- 结论：选 B。A 仍开桌面 app 违背初衷；C 合成逻辑易漏字段。B 录真实响应 100% 保真，mock 回放零 Electron、跨平台、CI 友好（fixture gitignore，CI 策略另定）。
- 子决策：
    - **mock 形态**：vite preview plugin middleware（`mock_api_plugin`）内嵌回放，单 server；非 preview.proxy 双进程（省进程 + 端口管理简）。
    - **脱敏**：黑名单正则 `secret|password|token|cookie|key|bearer|credential` 递归替换字符串字段为 `***`，实测覆盖本仓库全部 secret 字段名；非白名单（白名单需逐字段列举，新增字段易漏，黑名单 + `key` 兜底更稳）。
    - **fixture 存放**：`tests/e2e/fixtures/data/` gitignore（含本机真实账号邮箱，不入库）；`pnpm e2e:gen-data` 手动录制（需 app 跑着提供 local-api）。
- 替代：无（A/C 否决理由见上）
- 遗留：CI fixture 策略（T013）、webServer 顶层污染（T013）、trend query 覆盖（T011）。
