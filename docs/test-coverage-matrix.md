# 测试覆盖矩阵

> 将 `docs/spec.md` 的功能章节映射到现有测试，标注覆盖状态。
> 生成日期：2026-05-30（含 Task 3-8 完成后更新；2026-06-01 追加 Phase 20 popup 动态高度行）。

## 图例

- ✅ 已覆盖（自动化测试存在且贴合需求）
- ⚠️ 部分覆盖（有相关测试但场景缺失/或使用 mock 绕过真实路径）
- ❌ 未覆盖（无对应自动化测试）

---

## §3 插件系统

| Spec 章节                         | 需求                                                    | 状态 | 现有测试                                                                                                                                                                                                              | 缺口                                                                                |
| --------------------------------- | ------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| §3.1 插件文件                     | `.ts` 源 + esbuild 编译 + Electron Node 执行            | ⚠️   | `unit/plugin/compiler.test.ts` (compile/cache/error/stale), `unit/plugin/discovery.test.ts` (skip non-.ts, `_` 前缀)                                                                                                  | 缺：`_common.ts` 被跳过的显式断言；打包后 `process.resourcesPath/plugins/` 路径解析 |
| §3.2 元数据注释块                 | 前 80 行解析，缺标记返回 null，多语言 key               | ✅   | `unit/plugin/metadata-parser.test.ts` (basic/secret/choice/missing-end/invalid-json/>80 行)                                                                                                                           | —                                                                                   |
| §3.3 参数传递                     | `--usageboard-param KEY=VALUE`，非空才传，注入 LANGUAGE | ✅   | `unit/plugin/command-builder.test.ts` (nodePath, 参数格式, 跳过空值, LANGUAGE 注入, 中文/特殊字符)                                                                                                                    | —                                                                                   |
| §3.4 stdout 输出 schema           | 成功/错误 JSON 结构，items/badge/chart 可选             | ✅   | `unit/shared/plugin-output.test.ts` (schema v2/provider metadata/CPA provider rejection), `unit/shared/schemas.test.ts` (basic/badge/chart/empty/nulls/error/missing/wrong-type), `unit/plugin/output-parser.test.ts` | —                                                                                   |
| §3.4 schema v1 rejection          | v1 成功输出不再兼容                                     | ✅   | `unit/shared/plugin-output.test.ts` (rejects schemaVersion 1 success output)                                                                                                                                          | —                                                                                   |
| §3.5 exit code / timeout / stderr | 0 解析、非零取 stderr、15s timeout、stderr 不等于失败   | ✅   | `integration/plugin/runner.test.ts` (stdout/stderr/exit/timeout/SIGKILL/中文)                                                                                                                                         | —                                                                                   |
| §3.6 内置插件清单（7 个）         | 7 个 bundled 插件，元数据正确，secret 参数声明正确      | ✅   | `unit/plugin/bundled-metadata.test.ts` (计数 + 元数据快照), 7 个 stub 集成测试（成功/缺参/401/429/500/超时）                                                                                                          | —                                                                                   |

---

## §4 配置与存储

| Spec 章节                          | 需求                                                                 | 状态 | 现有测试                                                                                                                                 | 缺口 |
| ---------------------------------- | -------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| §4.1 文件路径                      | userData 下 config/secrets/states/logs                               | ✅   | `unit/paths.test.ts` (5 个 path helper)                                                                                                  | —    |
| §4.2 AppConfiguration              | schema 校验、默认值                                                  | ✅   | `integration/config/config-store.test.ts` (default/save/load/corrupt/schema-invalid/不序列化 id)                                         | —    |
| §4.2 overviewDisplayMode migration | 旧配置加载后移除 `overviewDisplayMode`                               | ✅   | `integration/config/config-store.test.ts` (loads old config with overviewDisplayMode and saves without it)                               | —    |
| §4.3 PluginConfiguration           | instanceId/stateId/refreshIntervalSeconds                            | ✅   | 同上                                                                                                                                     | —    |
| §4.4 密钥存储                      | safeStorage 加密、`${instanceId}:${paramName}` key、防抖 500ms、0600 | ✅   | `integration/config/secrets-store.test.ts` (save/load/delete/0600/不写明文/加密), `unit/config/config-store-debounce.test.ts` (防抖语义) | —    |
| §4.4 isSecureBackend               | linux 后端白名单                                                     | ✅   | `unit/config/is-secure-backend.test.ts`                                                                                                  | —    |

---

## §5 调度与刷新

| Spec 章节                     | 需求                                                    | 状态 | 现有测试                                                                                                                                    | 缺口                                                                   |
| ----------------------------- | ------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| §5.1 生命周期 (discover→seed) | 启动时 discover + compile + auto-seed                   | ⚠️   | `unit/plugin/auto-seed.test.ts` (empty/partial/full), `user_e2e/specs/plugin_config.spec.ts` (auto-creates on first launch)                 | 缺：discover → compile → seed 端到端集成；compile failure 时 seed 行为 |
| §5.2 SchedulerOrchestrator    | startAll/rebuild/suspend/resume/shutdown                | ✅   | `integration/scheduler/scheduler-orchestrator.test.ts` (5 个生命周期方法), `user_e2e/specs/suspend_resume.spec.ts` (真实 powerMonitor 事件) | —                                                                      |
| §5.3 RefreshService 流程      | secrets 注入 → spawn → parse → runtime/cache/event 广播 | ✅   | `integration/scheduler/refresh-service.test.ts` (cache 命中/未命中/force/失败/非零退出/并发/refreshAll/secrets 合并/空 secret 不泄露)       | —                                                                      |
| §5.3 PluginScheduler          | 立即刷新 + 周期刷新 + 最小 5s                           | ✅   | `integration/scheduler/plugin-scheduler.test.ts` (immediate/interval/stop/min-5s/refreshNow/stopAll)                                        | —                                                                      |
| §5.4 缓存策略 (stale data)    | 成功写 state，失败保留旧 stale                          | ✅   | `integration/scheduler/runtime-store.test.ts` (preserves lastSuccess on failure), `integration/cache/cache-store.test.ts`                   | —                                                                      |

---

## §6 UI

| Spec 章节                       | 需求                                                                             | 状态 | 现有测试                                                                                                                                                                                                                                                                                | 缺口                                                                           |
| ------------------------------- | -------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| §6.1 系统托盘                   | 左键 toggle popup、右键菜单、退出                                                | ✅   | `user_e2e/specs/tray_interaction.spec.ts` (popup 渲染、托盘点击关闭 popup)                                                                                                                                                                                                              | —                                                                              |
| §6.2 窗口配置                   | popup 360×480 无 frame / settings 640×520 有 frame                               | ⚠️   | `user_e2e/specs/app_lifecycle.spec.ts` (first window 可用，settings 渲染), `user_e2e/specs/popup_view.spec.ts` + `packaged_smoke/smoke.spec.ts` (popup 根容器填满视口高度)                                                                                                              | 缺：窗口外框尺寸断言、popup 在托盘下方定位                                     |
| §6.3 PopupView                  | 标题 / 空状态 / 设置按钮 / 刷新按钮 / provider 列表                              | ✅   | `user_e2e/specs/popup_view.spec.ts`, `unit/renderer/components/empty_state.test.tsx`, `refresh_button.test.tsx`, `smoke/renderer-smoke.test.tsx`                                                                                                                                        | —                                                                              |
| §6.3 provider aggregation       | 多 source 数据合并进对应 provider 页面                                           | ✅   | `unit/renderer/provider-usage.test.ts` (provider aggregation, ordered provider groups)                                                                                                                                                                                                  | —                                                                              |
| §6.3 no CPA main tab            | CPA 只作为 connector，不显示 CPA provider tab                                    | ✅   | `unit/renderer/provider-usage.test.ts` (不生成 cpa provider), `tests/packaged_smoke/smoke.spec.ts` (provider overview without CPA tab)                                                                                                                                                  | —                                                                              |
| §6.4 ProviderCard 状态机        | idle/loading/ready/failed + 颜色阈值 + 相对时间                                  | ⚠️   | `unit/renderer/relative-time.test.ts`、`user_e2e/specs/plugin_failure_modes.spec.ts`                                                                                                                                                                                                    | 缺：ProviderCard 组件级状态断言                                                |
| §6.5 SettingsView               | 侧栏 / 表单 / secret→password / 保存反馈 / 复制                                  | ✅   | `user_e2e/specs/settings_view.spec.ts`, `plugin_config.spec.ts`, `unit/renderer/components/settings_form.test.tsx`                                                                                                                                                                      | —                                                                              |
| §6.5 CPA connector settings     | CPA-Manager URL、管理密钥、provider 开关配置                                     | ✅   | `unit/renderer/components/cpa_connector_settings.test.tsx` (endpoint/key/provider switches)                                                                                                                                                                                             | —                                                                              |
| §6.6 路由                       | hash 路由 + useRoute hook                                                        | ⚠️   | `user_e2e/specs/popup_view.spec.ts` (settings 跳转), `user_e2e/specs/app_lifecycle.spec.ts`                                                                                                                                                                                             | 缺：返回 popup、未知 hash 默认行为                                             |
| §6.7 Popup 动态高度（Phase 20） | `popup:reportContentHeight` → 主进程裁剪 + 锚定 setBounds，折叠/展开后无底部留白 | ⚠️   | `unit/main/popup_height_controller.test.ts` (compute_target_height/should_apply_report/apply_locked_size/controller 去抖/重置), `unit/renderer/views/popup_view_height.test.tsx` (ResizeObserver 上报、折叠/展开切换、跨 tab 重置), `packaged_smoke/smoke.spec.ts` (popup 填满窗口高度) | 缺：真实多显示器/不同 DPI 下的 `setBounds`、autostart 后首次定位（需人工验收） |

---

## §7 IPC 接口

| Spec 章节                | 需求                                 | 状态 | 现有测试                                                                                                     | 缺口                                           |
| ------------------------ | ------------------------------------ | ---- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| §7.1 plugin:list         | 返回 PluginInfo[] + displayName 去重 | ✅   | `unit/ipc/plugin-ipc.test.ts` (PluginInfo[], Windows 反斜杠), `unit/plugin/display-names.test.ts` (去重)     | —                                              |
| §7.2 plugin:refresh      | 手动刷新单个 / refreshAll            | ✅   | `unit/ipc/plugin-ipc.test.ts` (refresh + refreshAll)                                                         | —                                              |
| §7.3 config:get / save   | get 返回 + schema 校验 + 防抖        | ✅   | `unit/ipc/config-ipc.test.ts` (mask secrets/hasSecrets/strip secret/reject unknown id/reject path 修改)      | —                                              |
| §7.4 config:saveSecrets  | 单个 secret 写入 + 参数校验          | ✅   | `unit/ipc/config-ipc.test.ts` (validates paramName/rejects unknown stateId/rejects disabled)                 | —                                              |
| §7.5 event:stateChange   | Main → Renderer 广播状态变更         | ⚠️   | `integration/scheduler/runtime-store.test.ts` (订阅/取消订阅), `user_e2e/specs/scheduler.spec.ts` (到达终态) | 缺：IPC 广播在 renderer 侧真实收到的端到端断言 |
| §7.6 log:level / entries | 日志级别 + 读取                      | ❌   | 无                                                                                                           | 全部（次优先，本计划不强制覆盖）               |
| §7 IPC helpers           | ok() / fail() envelope               | ✅   | `unit/ipc/helpers.test.ts`                                                                                   | —                                              |

---

## §8 安全模型

| Spec 章节                  | 需求                   | 状态 | 现有测试                                                                                            | 缺口                                         |
| -------------------------- | ---------------------- | ---- | --------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| contextIsolation / sandbox | renderer 沙箱          | ❌   | 无自动化断言                                                                                        | E2E 启动后 evaluate 验证 process 不可达      |
| contextBridge 白名单       | 不允许任意 channel     | ❌   | 无                                                                                                  | 静态分析或 E2E `window.electronAPI` 形状断言 |
| secret 不进日志/快照       | 脱敏为 `***`           | ⚠️   | `integration/config/secrets-store.test.ts` (不写明文), `unit/ipc/config-ipc.test.ts` (mask secrets) | 缺：日志输出的脱敏断言                       |
| cacheStore 路径穿越拒绝    | rejects path traversal | ✅   | `integration/cache/cache-store.test.ts` (traversal/slash)                                           | —                                            |
| executablePath 不可修改    | config:save 拒绝改路径 | ✅   | `unit/ipc/config-ipc.test.ts` (rejects executablePath modification)                                 | —                                            |

---

## §9–§10 测试与平台

| Spec 章节        | 需求                            | 状态 | 现有测试                                                                | 缺口 |
| ---------------- | ------------------------------- | ---- | ----------------------------------------------------------------------- | ---- |
| §9.1 测试分层    | unit/integration/smoke/e2e/打包 | ✅   | 五层目录都存在，含 `tests/packaged_smoke/smoke.spec.ts`                 | —    |
| §10.1 插件运行时 | Electron 内置 Node              | ✅   | `integration/plugin/runner.test.ts` (真实 spawn `process.execPath`)     | —    |
| §10.2 数据目录   | 跨平台 userData                 | ✅   | `unit/paths.test.ts`                                                    | —    |
| §10.3 插件路径   | 开发 / 打包后                   | ✅   | discovery 测试覆盖开发路径，`packaged_smoke/smoke.spec.ts` 验证打包路径 | —    |

---

## 内置插件 (§3.6) 单项详情

| 插件     | 真实 metadata 验证  | stub 集成测试 | 端到端账号场景 | 测试文件                                     |
| -------- | ------------------- | ------------- | -------------- | -------------------------------------------- |
| Claude   | ✅ bundled-metadata | ✅ 4 case     | ❌             | `integration/plugin/claude-plugin.test.ts`   |
| Codex    | ✅                  | ✅ 3 case     | ❌             | `integration/plugin/codex-plugin.test.ts`    |
| DeepSeek | ✅                  | ✅ 6 case     | ❌             | `integration/plugin/deepseek-plugin.test.ts` |
| GLM      | ✅                  | ✅ 6 case     | ❌             | `integration/plugin/glm-plugin.test.ts`      |
| MiniMax  | ✅                  | ✅ 6 case     | ❌             | `integration/plugin/minimax-plugin.test.ts`  |
| Tavily   | ✅                  | ✅ 6 case     | ❌             | `integration/plugin/tavily-plugin.test.ts`   |
| CPA      | ✅                  | ✅ 6 case     | ❌             | `integration/plugin/cpa-plugin.test.ts`      |

---

## 汇总

- 后端/逻辑层 (§3–§5, §7) 覆盖较完整。
- 前端 UI (§6) 已有 12 个组件单元测试 + 24 个 E2E spec，覆盖主路径。剩余 ⚠️ 项见 Phase 22。
- 安全 (§8) 缺少 renderer 沙箱与 IPC 白名单断言。
- 打包 smoke 已覆盖启动、白屏、内置插件发现。
- 内置插件 (§3.6) 7 个全部有 stub 集成测试（真实子进程 + HTTP 桩），共 37 case。

---

## Phase 20 新增覆盖项（2026-06-02 更新）

| 覆盖项                   | 状态 | 测试文件                                                                                         |
| ------------------------ | ---- | ------------------------------------------------------------------------------------------------ |
| popup 内容高度测量       | ✅   | `unit/main/popup_height_controller.test.ts`, `unit/renderer/views/popup_view_height.test.tsx`    |
| 折叠状态驱动窗口缩放     | ✅   | `unit/renderer/views/popup_view_height.test.tsx` (collapse/expand toggle, overview expand)       |
| 全折叠高度作为最小高度   | ✅   | `unit/main/popup_height_controller.test.ts` (compute_target_height min clamp)                    |
| 75% work area 最大约束   | ✅   | `unit/main/popup_height_controller.test.ts` (max ratio, tiny display)                            |
| 1px debounce 防抖        | ✅   | `unit/main/popup_height_controller.test.ts` (should_apply_report, controller duplicate suppress) |
| macOS 托盘锚定不可移动   | ✅   | `unit/main/popup_height_controller.test.ts` (apply_locked_size darwin path)                      |
| Win/Linux 可移动保留位置 | ✅   | `unit/main/popup_height_controller.test.ts` (Path B y-preservation fix, user_moved paths)        |
| Path B 顶部下跳修复      | ✅   | `unit/main/popup_height_controller.test.ts` (win32 non-moved y preserved)                        |
| 总览就地展开             | ✅   | `unit/renderer/views/popup_view_height.test.tsx` (overview expand, tab reset)                    |

## Phase 21 新增覆盖项（2026-06-03 更新）

| 覆盖项                  | 状态 | 测试文件                                                                                      |
| ----------------------- | ---- | --------------------------------------------------------------------------------------------- |
| CardMenu 组件           | ✅   | `unit/renderer/components/card_menu.test.tsx` (open/close/onClick/danger/checked/meta/Escape) |
| TokenPanel 组件         | ✅   | `unit/renderer/components/token_panel.test.tsx` (title/no-data/real data/range switch)        |
| ProviderCard 状态机     | ✅   | `unit/renderer/components/provider_card.test.tsx`                                             |
| Settings provider 分组  | ✅   | `unit/renderer/views/settings_view.test.tsx`                                                  |
| UsageBarRow 组件        | ⚠️   | 无专用测试；在 ProviderAccountRow 中间接使用                                                  |
| 托盘右键菜单 7 项       | ✅   | `user_e2e/specs/tray_menu_actions.spec.ts`                                                    |
| popup_demo_alignment    | ✅   | `user_e2e/specs/popup_demo_alignment.spec.ts`                                                 |
| popup_card_states       | ✅   | `user_e2e/specs/popup_card_states.spec.ts`                                                    |
| popup_token_panel       | ✅   | `user_e2e/specs/popup_token_panel.spec.ts`                                                    |
| popup_drag_handle       | ✅   | `user_e2e/specs/popup_drag_handle.spec.ts`                                                    |
| popup_theme             | ✅   | `user_e2e/specs/popup_theme.spec.ts`                                                          |
| settings_provider_accts | ✅   | `user_e2e/specs/settings_provider_accounts.spec.ts`                                           |

后续 Phase 22 按本矩阵补齐 ⚠️ 项。
