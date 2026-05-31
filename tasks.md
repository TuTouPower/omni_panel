# OmniUsage 任务清单

> 已完成的 Phase 1–16 移入 `docs/archive/tasks-history.md`。

---

## Phase 17: 添加 CPA 插件 — 通过 CPA-Manager 获取多平台 AI 服务额度数据 ✅

### 背景

`ai_monitor` 项目已实现 CPA（Claude Platform API）额度采集，通过 CPA-Manager 代理服务统一管理 OAuth token。
本项目需将其移植为 omni_usage 的标准插件（Python 子进程 + JSON 协议），复用现有插件调度/缓存/UI 基础设施。

支持的 provider：Claude、Codex、Gemini CLI、Antigravity、Kimi。
（Vertex AI 未实现配额获取，暂不支持。）

参考文档：`docs/cpa-quota-guide.md`

### 架构

```
omni_usage 插件系统
    │
    │  spawn python cpa-usage-plugin.py
    ▼
CPA 插件 (Python 子进程)
    │
    │  HTTP 请求 (httpx)
    ▼
CPA-Manager (http://<your-host>:20224)
    │
    │  用存储的 OAuth token 代发
    ▼
上游 API (Anthropic / OpenAI / Google / Moonshot)
```

### 实现步骤

#### 17.1: 编写 `resources/plugins/cpa-usage-plugin.py`

- [x] 输出 `_METADATA` 注释块，声明插件元数据：
    - `name`: `"CPA"`
    - `refreshInterval`: `1800`（30 分钟）
    - `parameters`:
        - `cpa_mgmt_url` (string, 默认 `"http://localhost:20224"`)
        - `cpa_mgmt_key` (secret)
        - `monitor_codex` (boolean, 默认 `true`)
        - `monitor_claude` (boolean, 默认 `true`)
        - `monitor_gemini` (boolean, 默认 `true`)
        - `monitor_antigravity` (boolean, 默认 `true`)
        - `monitor_kimi` (boolean, 默认 `true`)
- [x] `--usageboard-param` 支持运行时传入覆盖默认值
- [x] 依赖：`httpx`（`pip install httpx`），Python 3.8+ 兼容
- [x] 核心逻辑：
    1. 调用 `GET /v0/management/auth-files` 获取 auth 文件列表
    2. 按 provider 分发：`claude` / `codex` / `gemini-cli` / `antigravity` / `kimi`
    3. 跳过 `disabled` 的 auth 文件
    4. 每个 auth 文件通过 `POST /v0/management/api-call` 代理请求上游
    5. 解析五个 provider 的不同响应格式
    6. 输出标准 `PluginOutput` JSON
- [x] 输出 items 格式（每个账号每个周期一个 item）
- [x] 错误处理：单个账号失败不阻塞其他，失败项输出 warning，全部失败输出 error JSON

#### 17.2: 实现五个 provider 的响应解析

- [x] **Claude**: `GET https://api.anthropic.com/api/oauth/usage`
    - Header: `Authorization: Bearer $TOKEN$`, `anthropic-beta: oauth-2025-04-20`
    - 响应字段：`five_hour.utilization`（0~1），`seven_day.utilization`
    - 时间字段：`resets_at` (ISO 8601)
- [x] **Codex**: `GET https://chatgpt.com/backend-api/wham/usage`
    - Header: `Authorization: Bearer $TOKEN$`, `User-Agent: codex_cli_rs/...`
    - 响应字段：`rate_limit.primary_window.used_percent`，`secondary_window`
    - 时间字段：`reset_at` (Unix 秒/ms)
- [x] **Gemini**: 两步 POST
    - Step 1: `loadCodeAssist` → 获取 `cloudaicompanionProject`
    - Step 2: `retrieveUserQuota` → 获取 `buckets[].remainingFraction`
- [x] **Antigravity**: `POST .../v1internal:fetchAvailableModels`（三 URL 回退）
    - Header: `Authorization: Bearer $TOKEN$`, `User-Agent: antigravity/1.11.5 windows/amd64`
    - Body: `{"project": "{project_id}"}` 或 `{}`
    - 响应：`models.{modelId}.quotaInfo.remainingFraction`（0~1），`quotaInfo.resetTime` (ISO)
    - 每个模型独立配额，一个账号输出多条 item
- [x] **Kimi**: `GET https://api.kimi.com/coding/v1/usages`
    - Header: `Authorization: Bearer $TOKEN$`
    - 响应：`limits[]` 数组，每项含 `used`、`limit`、`reset_at` (ISO)、`duration`、`timeUnit`
    - `used_percent = (used / limit) * 100`

#### 17.3: 集成到插件系统

- [x] 确认 `discoverPlugins()` 能发现 `resources/plugins/cpa-usage-plugin.py`
- [x] 首次启动自动创建 CPA 插件实例（auto-seed 机制复用）
- [x] 参数表单：Settings 中显示 CPA 管理地址、密钥、五个 provider 开关
- [x] 密钥回注：`cpa_mgmt_key` 为 secret 类型，执行前自动注入

#### 17.4: UI 适配

- [x] 插件卡片支持多 item 显示（每个账号每个周期一个进度条）
- [x] 标签显示 provider 名 + 邮箱 + 周期（如 "Claude (user@ex.com) · 5小时"）
- [x] 如果复用现有 PluginCard 即可满足则无需修改 UI

#### 17.5: 测试

- [x] **单元测试**：
    - `parse_claude()` — 正常响应、空响应、fractional utilization
    - `parse_codex()` — primary_window / secondary_window 解析
    - `parse_gemini_buckets()` — bucket 解析
    - `parse_antigravity_models()` — 多模型 quotaInfo 解析
    - `parse_kimi()` — limits 数组解析
    - `extract_email()` — 邮箱提取
- [x] **集成测试**：
    - 缺少 httpx → error JSON
    - 缺少 cpa_mgmt_key → error JSON
    - CPA-Manager 不可达 → error JSON

#### 17.6: 文档更新

- [x] `docs/plugin-contract.md` 补充 CPA 插件说明
- [x] `docs/spec.md` 内置插件表添加 CPA 行

### 修改文件（实际）

| 文件                                           | 变更                               |
| ---------------------------------------------- | ---------------------------------- |
| `resources/plugins/cpa-usage-plugin.py`        | **新建** — CPA 插件脚本            |
| `tests/unit/plugin/cpa_parsers_test.py`        | **新建** — Python 解析函数单元测试 |
| `tests/unit/plugin/cpa-parsers-vitest.test.ts` | **新建** — Vitest 包装器           |
| `tests/integration/plugin/cpa-plugin.test.ts`  | **新建** — CPA 插件集成测试        |
| `tests/unit/plugin/bundled-metadata.test.ts`   | 更新插件数量 6→7 + 添加 CPA 条目   |
| `docs/plugin-contract.md`                      | 补充 CPA 插件说明                  |
| `docs/spec.md`                                 | 内置插件表添加 CPA 行              |

### 验证

1. `pnpm check` 全部通过
2. `pnpm test` 全部通过（含新增 CPA 测试）
3. 打包后 Settings 显示 CPA 插件参数表单
4. 填入 CPA-Manager 密钥后触发刷新，Popup 显示 Claude/Codex/Gemini/Antigravity/Kimi 额度数据
5. 单个 provider 无数据时不阻塞其他 provider 的展示

### 注意事项

- `cpa_mgmt_key` 是 secret，不进 git、不进日志、不进测试快照
- CPA-Manager 地址和密钥作为插件参数（而非硬编码），方便用户自建 CPA-Manager
- `httpx` 依赖需在插件脚本中检测，不可用时输出友好错误
- 代理请求中 header 的 `$TOKEN$` 是占位符，CPA-Manager 会自动替换为真实 token
- Antigravity 有三个回退 URL，按优先级尝试；`project` 需先通过 `loadCodeAssist` 获取
- Kimi OAuth token 由 CPA-Manager 自动刷新，客户端无需处理
- Vertex AI 暂不支持（配额系统走 Google Cloud Service Usage API）

---

## Phase 18: 补齐测试覆盖与真实验收缺口 ✅

> 已完成。执行入口:`docs/superpowers/plans/2026-05-30-test-coverage-improvement.md`(8 个 Task 全部交付)。
> 覆盖现状见 `docs/test-coverage-matrix.md`。
> 关键提交:`b84e8e7` 覆盖率门禁、`108fa79` playwright 多 project + coverage 脚本、`9c14faf` 真实 API 契约、`d3882d5` 插件测试稳定性修复。
>
> 剩余可选项(未做):nightly-contract GitHub Actions(`.github/workflows/`),手工跑 `pnpm test:full` 等效。

---

## Phase 19: UI 与设计 demo 对齐 + 窗口/托盘修复

### 背景

打包产物实际运行后发现两类问题:

1. **窗口装饰**:Settings 窗口 `frame: true` 且未禁用应用菜单,Electron 默认菜单栏(File/Edit/View/Window/Help)仍显示;Popup 窗口虽 `frame: false`,但缺少自绘标题栏拖拽区。
2. **托盘图标**:`src/main/core/paths.ts:37` 的 `get_tray_icon_path()` 返回 `resources/icon.png`(应用大图),未使用已存在的 `resources/tray-icon.png`,导致系统托盘渲染异常(过大/糊/不显示)。
3. **UI 与 `docs/design/omni-usage/` 设计 demo 严重不对齐**:demo 包含 AreaChart(多系列趋势图)、TokenGrid(token 用量网格)、UsageRow(带 tone/invert 进度条)、多账号 tab 切换、Tweaks 面板、托盘菜单自绘窗口等;当前 `PluginCard` 仅渲染简化 `BarRow`,缺图表/token grid/多账号视图。
4. **样式量级差距**:设计三份 CSS 共 2869 行,当前 `globals.css` 1100 行。

### 19.1 窗口装饰修复

- [x] **19.1.1 Settings 窗口去掉默认菜单栏**
    - 文件:`src/main/index.ts` WINDOW_CONFIGS.settings 与 createWindowFor
    - 改动:`autoHideMenuBar: true` + 创建后 `win.setMenuBarVisibility(false)`;或全局 `Menu.setApplicationMenu(null)`(注意 macOS 上需保留最小菜单以避免快捷键失效)
    - 验收:打包产物启动 Settings 窗口顶部无 File/Edit/...菜单

- [x] **19.1.2 Popup 自绘标题栏拖拽区**
    - 文件:`src/renderer/views/PopupView.tsx` + `globals.css`
    - 当前 `.titlebar` 节点应加 `-webkit-app-region: drag`,子按钮加 `no-drag`
    - 验收:鼠标拖标题栏可移动窗口;点击刷新/设置按钮不触发拖拽

- [x] **19.1.3 验证 popup 在托盘下方定位**
    - 文件:`src/main/index.ts` Tray click handler
    - 当前 spec 要求 popup 紧贴托盘弹出,需读取 `tray.getBounds()` 计算坐标
    - 验收:左键托盘,popup 出现在托盘正下方(Win)/正上方(Mac dock)

### 19.2 托盘图标修复

- [x] **19.2.1 `get_tray_icon_path()` 改用专用资源**
    - 文件:`src/main/core/paths.ts:37`
    - 改动:返回 `resources/tray-icon.png`(已存在);打包路径同步 `process.resourcesPath/tray-icon.png`
    - `forge.config.ts` 的 `extraResource` 须包含 `tray-icon.png`
    - 验收:Win 托盘显示 16x16 清晰图标,无空白/默认 Electron 图标

- [x] **19.2.2 多尺寸/HiDPI 支持**
    - 提供 `tray-icon@2x.png` 32x32,或改用 ICO 多帧
    - macOS 加 `tray-iconTemplate.png` 单色模板,自动适配深浅菜单栏

- [x] **19.2.3 托盘 tooltip + 右键菜单贴近设计**
    - 文件:`src/main/index.ts` + 参考 `docs/design/omni-usage/project/tray.jsx`
    - 当前右键菜单缺:暂停自动刷新、开机自启、检查更新等
    - 验收:右键菜单 7 项符合 demo

### 19.3 渲染层对齐设计 demo

- [x] **19.3.1 实现 AreaChart 组件**
    - 来源:`docs/design/omni-usage/project/usageboard.jsx` `function AreaChart`
    - 新建:`src/renderer/components/AreaChart.tsx`
    - 接入:`PluginCard` 在 snapshot.chart 存在时渲染
    - 验收:渲染多系列 SVG 趋势图,y/x 轴 label 与 demo 一致

- [x] **19.3.2 实现 TokenGrid 组件**
    - 来源:`usageboard.jsx` `function TokenGrid`
    - 新建:`src/renderer/components/TokenGrid.tsx`
    - 接入:展示 `snapshot.tokens`(若 schema 缺,先补 `plugin-output.ts` 可选字段)
    - 验收:点状颜色 + 数值 + 单位渲染

- [x] **19.3.3 UsageRow tone/invert**
    - 来源:`usageboard.jsx` `function UsageRow`
    - 现有 `BarRow` 改造:支持 `tone="danger|warn"`,`fillPct >= 65` 时 `data-invert` 反色文本
    - 验收:高占用条文字白色压在填充上,清晰可读

- [x] **19.3.4 多账号 Tab 横向滚动条**
    - 来源:`docs/design/omni-usage/project/multi-account.jsx`
    - 文件:`PopupView.tsx` 当前 tabs-wrap 只有单 "总览" tab,缺多账号 tab 与 active 切换
    - 验收:多个 CPA 子账号或多插件实例显示为可切换 tab,active tab 自动 scrollIntoView

- [x] **19.3.5 Tweaks Panel(设置侧栏外观/行为)**
    - 来源:`tweaks-panel.jsx` 540 行
    - 文件:新建 `src/renderer/views/TweaksView.tsx` 或并入 SettingsView 的"外观"section
    - 验收:主题色、刷新间隔、显示模式可视化调节

### 19.4 样式对齐

- [x] **19.4.1 抽取设计 CSS 变量**
    - 来源:`omniusage.css` / `usageboard.css` / `settings.css` 顶部 `:root { --... }`
    - 文件:`src/renderer/styles/globals.css` 顶部
    - 验收:色板/间距/圆角 token 全量同步

- [x] **19.4.2 逐组件 CSS 补齐**
    - 对照 `.ub-row` / `.ub-bar` / `.ub-tokens` / `.ub-tok-*` 等 demo 类名,补齐当前 globals.css 缺失规则
    - 注意:不直接 import demo CSS(demo 是 prototype,见 design README),按需移植规则

- [x] **19.4.3 深色模式校对**
    - demo 有 `data-theme="dark"` 切换,逐 token 校对深浅两套色

### 19.5 验收

- [ ] `pnpm package` 后启动,Settings 窗口无默认菜单栏
- [ ] 托盘图标清晰显示(Win/Mac/Linux 任一平台至少 Win 通过)
- [ ] Popup 标题栏可拖拽,按钮不触发拖拽
- [ ] PluginCard 渲染 AreaChart + TokenGrid + 多 UsageRow
- [ ] 多账号 tab 可切换
- [ ] 视觉对照 `docs/design/omni-usage/project/screenshots/01-overview.png`,核心布局/色彩一致
- [ ] `pnpm test:visual` 基线更新后通过

### 19.6 不在范围

- 设计 demo 里的"添加服务向导对话框"(`01-add-dialog.png`)— 留 Phase 20
- 跨平台菜单栏深度适配(macOS native menu)— 仅做最小适配

### 19.7 Popup 主面板底部空白修复

#### 问题

打包产物运行后，主面板窗口底部出现大片空白。

根因：`src/main/index.ts` 中 popup `BrowserWindow` 高度为 `480`，但 `src/renderer/styles/globals.css` 的 `.window` 使用 `height: min(816px, calc(100vh - 80px))`，导致真实 popup 内容高度只有 `400px`，底部剩余约 `80px` body 背景空白。

#### 修复要求

- [x] 将真实 popup 场景下 `.window` 高度改为填满窗口（如 `height: 100vh` / `height: 100%`），不能继续使用设计预览用的 `calc(100vh - 80px)`。
- [x] 保持 Settings 窗口布局不被误伤。
- [x] 检查主面板滚动区域和 statusbar，确保内容少/多时都无底部空白、无被截断。

#### 测试要求

- [x] 增加/更新 renderer 或 E2E 测试，覆盖 popup 根容器高度等于视口高度，防止再次出现 `100vh - 80px` 类回归。
- [x] 打包后真实启动验证：主面板底部无空白。
- [x] 若自动化能接入 packaged app，则在 `tests/packaged_smoke/` 增加断言：`.window` 高度与 `window.innerHeight` 一致或误差在 1px 内。

#### 文档要求

- [x] 更新 `docs/test.md` / `docs/test-coverage-matrix.md`：记录 popup 布局 smoke 需要覆盖窗口高度和底部空白回归。
- [x] 如 `docs/spec.md` 描述 popup 尺寸/布局，也要同步说明 popup 内容应填满窗口。

---

## 通用约束（每轮适用）

1. 不实现本轮范围外的功能
2. 不重构无关文件
3. 不修改插件协议来适配实现
4. 每个新模块必须有测试
5. 运行测试并报告结果
6. secret 不进日志/错误消息/测试快照
7. renderer 不直接访问 Node API
8. 每轮输出修改文件列表
9. 每轮输出下一轮建议但不提前实现

## 每轮完成验证

1. 本轮改了哪些文件？
2. 哪些测试证明它工作？
