# Task review t297（reviewer_focus: 代码）

- task：`t297_markdown_link_scheme_allowlist`
- spec：`docs/tasks/t297_markdown_link_scheme_allowlist/spec.md`
- diff_anchor：`3c7707ba7f885ed9be6d5e215966e7e7b71acb58`
- target：`git diff 3c7707ba7f885ed9be6d5e215966e7e7b71acb58`
- round：1
- reviewed_at：2026-08-11 03:50 UTC+8

## 审阅方法

除读 diff 与周边代码外，用仓库内 Electron v42.2.0（`node_modules/electron/dist/electron`）在 xvfb 下做了真实运行时实验，验证 will-navigate 对 reload / javascript: / data: / about: 导航的实际行为；用 Node 的 `URL` 验证渲染层 scheme 解析边界。

## Findings

### t297_code_f001 - will-navigate 守卫阻断生产环境 file:// 页面 reload，配置导入后自动刷新失效

- 严重度：important
- 锚点：AC-003（「正常内部导航（file:// 渲染入口）不受影响」）+ 可观测行为缺陷
- 位置：`src/main/window/window-manager.ts:206-219`（守卫）；`src/renderer/views/SettingsView.tsx:296`（被阻断的调用）
- 问题：`createWindowFor` 对**所有**面板窗口注册 will-navigate 守卫，非 http(s) 一律 `preventDefault()`。生产环境渲染入口是 `file://${rendererIndexPath}`（`window-manager.ts:135`），而 `SettingsView.tsx:296` 的配置导入成功后调用 `window.location.reload()`。实测（Electron v42.2.0 + xvfb）：file:// 页面执行 `location.reload()` **会触发** will-navigate，且 URL 就是 `file://` 自身 —— 守卫将其判定为非白名单并 `preventDefault()`，reload 被拦截。结果：生产包内「导入成功，正在刷新...」后页面不刷新，导入的配置不生效，需手动重开/重启才可见。开发模式（`ELECTRON_RENDERER_URL=http://localhost:PORT`）reload 目标是 http://，不受影响——因此单测与开发环境都测不出，只在打包生产暴露。
- 证据（真实运行，非推断）：
    - Electron 文档：will-navigate「happens when the window.location object is changed」，`loadURL`/`back` 等主进程编程式导航不触发——但渲染层 `location.reload()` 属前者。
    - Electron 源码 `shell/browser/electron_navigation_throttle.cc:50-61`：`is_renderer_initiated && handle->IsInMainFrame()` 即发 will-navigate。
    - xvfb 实测事件序列（复刻守卫逻辑）：`did-navigate file:///…/index.html` →（`location.reload()`）→ `BLOCKED file: file:///…/index.html`；reload 后无第二次 `did-navigate file://`，reload 被拦。
    - SO 实证：Angular + Electron 开发者报告「page reloading was blocked by will-navigate listener」。
- 建议：守卫对「应用自身页面」的导航放行，仅拦外来导航。最小方向：target URL 与 `win.webContents.getURL()` 相同（即 reload / 回指当前页）或 protocol 为 file: 且路径等于 `opts.rendererIndexPath` 时不过滤；或改由 IPC 走主进程 `webContents.reload()`（编程式，不触发 will-navigate）。修复后补一条「file:// 同页 reload 不被阻止」的单测（见 f002）。

### t297_code_f002 - will-navigate 测试未覆盖 reload / 文件自身 file:// 导航，生产回归可全绿通过

- 严重度：minor
- 锚点：AC-003 测试覆盖缺口（与 f001 同源）
- 位置：`tests/unit/main/window_manager.test.ts:106-133`
- 问题：新增两条用例只覆盖 javascript:/file:/https:// 三种 URL，放行用例用的是 `https://example.com/usage`。没有覆盖「file:// 同页 reload / 应用自身 file:// 内部导航应放行」这一 AC-003 正常内部导航路径，也未覆盖 malformed URL 分支（`window-manager.ts:209-214` 的 try/catch）。f001 的生产回归在当前测试套件下完全通过——用例无法作为回归护栏。
- 建议：随 f001 修复补测：`listener(…, current_file_url)`（与当前 URL 相同）不触发 preventDefault；补一条 malformed URL 触发 preventDefault 的用例。

## 结论

- 前轮 finding 复核：无（首轮）
- 本轮新发现：2 条（f001 important / f002 minor）
- 未进表的提示：
    - 文件过大：无（`window-manager.ts` 246 行、`MarkdownMessage.tsx` 100 行、两测试 165/72 行，均远低于阈值）。
    - 复杂度：无（两个 handler CC 均 ≤4）。
    - 范围外观察（按 read-only 边界只提示不立案）：
        - `about:` URL 导航 `preventDefault` 实测不生效（Electron issue #31783，v42.2.0 下 `about:blank` 导航仍发生）。不可经消息面触发（renderer 已剥除非 http(s) href），仅被攻破的 renderer JS 可达，低风险、非 t297 代码可修；如需严格兜底，建议 follow-up 用 `session.webRequest.onBeforeRequest` 补一道。未进 finding。
        - 相对路径 `./guide.md`、protocol-relative `//x`、`#anchor`、`mailto:` href 一律 `new URL()` 抛错或 scheme 非 http(s) → 渲染为纯文本。与 AC-001「仅 http:/https: 保留链接」一致，非缺陷；相对链接从可点变纯文本是 spec 合规的 UX 变化。
        - 反斜杠 URL `https:\\evil.com` → `new URL` 归一为 `https://` 后通过白名单渲染为锚点，但仍在 http(s) 范围内，点击走 `setWindowOpenHandler` 外部打开，非新增漏洞。
        - `javascript:` URL 赋值与 `data:` 顶层导航实测**不触发** will-navigate（守卫对这两类是 no-op）；但 renderer 层已剥除对应 href，且此类导航仅能由页面内既有 JS 触发，非消息面可达。
- 总体判断：渲染层与守卫主体符合 AC-001/002，但守卫对应用自身 file:// reload 的误杀构成生产功能回归（AC-003），须修复后进入下一轮。
- 系统性 follow-up：无

verdict: FAIL

reviewed_scope: 90c54d7a22b3aa5a

## Round 2 (2026-08-11 04:00 UTC+8)

复核依据：重读 `git diff 3c7707ba7f885ed9be6d5e215966e7e7b71acb58` 下 `window-manager.ts` 与 `window_manager.test.ts` 的当前状态；Electron v42.2.0 + xvfb 实测修复后守卫；全仓扫描其它 markdown/raw-HTML 渲染面与生产导航触发点。

### 前轮 finding 复核

- **f001（important）：已消除。** 守卫现放行 `http:`/`https:`/`file:` 三协议，`javascript:`/`data:` 等仍 `preventDefault`（`window-manager.ts:206-219`）。xvfb 实测（复刻修复后守卫）：file:// 页面 `location.reload()` → `ALLOW file: file://…/index.html` → `did-navigate file://` 二次触发，reload 生效；Round 1 同场景为 `BLOCKED file:`。SettingsView.tsx:296 配置导入刷新生效，AC-003「正常内部导航（file:// 渲染入口）不受影响」恢复满足。
- **f002（minor）：主缺口已消除。** `window_manager.test.ts` 新增用例断言 `file:///renderer/index.html?route#setting`（同入口 reload 场景）放行、`javascript:`/`data:` 拦截，f001 回归现被单测护栏覆盖（9 测试全过）。残余：malformed URL 分支（`try/catch → preventDefault`，`window-manager.ts:209-214`）仍无直测——3 行简单异常分支，非阻断，见下「未进表的提示」。

### 本轮新发现

无 blocking finding。

对「file: 全放行是否过宽」的评估（结论：**不过宽，非阻断**）：

- 注入面：MarkdownMessage 是全仓唯一 markdown 渲染面（`grep ReactMarkdown` 仅此一处），且未启用 rehype-raw（raw HTML 不渲染）。react-markdown `defaultUrlTransform`（`safeProtocol = /^(https?|ircs?|mailto|xmpp)$/i`）对 `file://` href 直接置空，叠加本 task 的 `new URL(href).protocol !== http:/https:` → 纯文本；`new URL("file:///etc/passwd").protocol === "file:"` 实测确认。**不可信消息面无法产出 file:// href**。
- 触发面：生产代码仅 `SettingsView.tsx:296 location.reload()`（同入口 reload）与 `about_section.tsx:127 window.location.href = url`（硬编码 `https://omnipanel.app/*` 白名单 fallback）会导航；两者均为可信 renderer JS。`Icon.tsx:288 dangerouslySetInnerHTML` 只渲染固定 SVG 图标集，非用户内容。
- 纵深：`webSecurity: true` 下 Chromium 阻止 http(s) 顶层导航到 file://；面板自身为 file:// origin，故仅「可信 renderer JS 被攻破」才能导航到任意 file://——那已超出本守卫的威胁模型（守卫防不可信内容，而内容已无法发出 file: href）。
- 更精确方案（若日后需再收窄）：将目标 URL 与 `win.webContents.getURL()` 比对，或按 `file://${opts.rendererIndexPath}` pathname 前缀匹配，仅放行自身渲染入口/同页 reload，拦截其它 file:// 路径。属可选加固，非 AC-003 要求，本 task 不阻塞。

### 结论

- 前轮 finding 复核：f001 已消除（代码 + 实测 + 单测三重确认）；f002 主缺口已补，残余 malformed 分支未测（非阻断）。
- 本轮新发现：0 条 blocking。
- 未进表的提示：
    - 文件过大：无（window-manager.ts 265 行、MarkdownMessage.tsx 100 行、window_manager.test.ts 176 行、MarkdownMessage.test.tsx 72 行，均远低于阈值）。
    - 复杂度：无（guard handler CC ≤4）。
    - 残余观察（非阻断）：malformed URL 分支无直测；`about:` URL 导航 `preventDefault` 在 v42.2.0 下实测不生效（Electron #31783，上游 bug，消息面不可达，低风险）。两者均不建议本 task 内处理，可作 follow-up 候选。
- 总体判断：f001 生产回归已修复且有回归护栏，AC-001/002/003 全部满足，无未解决 blocking；仅剩 minor 级残余观察。
- 系统性 follow-up：无

verdict: PASS

reviewed_scope: d30d8d4088e42614

## Round 3 (2026-08-11 04:10 UTC+8)

收尾文档同步，无逻辑/测试变更。变更范围（`git diff 3c7707ba7f885ed9be6d5e215966e7e7b71acb58 --stat`）：`docs/specs/window-management.md` +4、`docs/specs/workspace.md` +1、`docs/specs_index.md` +4/-2。`src/` 与 `tests/` 无新 diff，Round 2 的 PASS 判定不受影响。

前轮 finding 复核：f001/f002 维持 Round 2 结论（已消除），无新增代码变更需复核。

本轮新发现：无。

未进表的提示：无。

总体判断：文档同步完成，逻辑与测试未变，AC-001/002/003 维持满足。

系统性 follow-up：无

verdict: PASS

reviewed_scope: 160b60690bddd68a

## Round 4 (2026-08-11 04:20 UTC+8)

commit 前 `prettier --write` 格式化 `src/main/window/window-manager.ts`，纯格式变化，无语义变更。`src/` 与 `tests/` 四个文件 diff 统计与 Round 3 一致（131 insertions/6 deletions），逻辑与测试未变；15 测试全绿（`git diff 3c7707ba7f885ed9be6d5e215966e7e7b71acb58` 下运行 15/15 通过）。

前轮 finding 复核：f001/f002 维持 Round 2 结论（已消除），prettier 重排未引入语义变化，无新问题。

本轮新发现：无。

未进表的提示：无。

总体判断：格式格式化不改变已确认的功能正确性，AC-001/002/003 维持满足。

系统性 follow-up：无

verdict: PASS

reviewed_scope: 0020d3ffaa3460e7
