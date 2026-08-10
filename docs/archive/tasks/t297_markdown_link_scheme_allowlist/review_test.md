# Task review t297（reviewer_focus: 测试）

- task：`t297_markdown_link_scheme_allowlist`
- spec：`docs/tasks/t297_markdown_link_scheme_allowlist/spec.md`
- diff_anchor：`3c7707ba7f885ed9be6d5e215966e7e7b71acb58`
- target：`git diff 3c7707ba7f885ed9be6d5e215966e7e7b71acb58`
- round：1
- reviewed_at：2026-08-11 03:50 UTC+8

## Findings

### t297_test_f001 - AC-001 未直接断言 `http:`（非 TLS）链接保留

- 严重度：minor
- 锚点：AC-001（含 `http:`/`https:` 保留链接）
- 位置：`tests/unit/renderer/components/workspace/MarkdownMessage.test.tsx:42-51`
- 问题：AC-001 明确列出 `http:` 与 `https:` 两个 scheme 保留链接，但新增渲染用例只直接断言 `https://example.com/page` 渲染 anchor；`http://` 变体无独立用例。生产判断为单一共享分支（`scheme !== "http:" && scheme !== "https:"`），当前 https 用例已覆盖该分支的放行侧，因此风险低；但若将来条件被收窄为仅 `https:`（误删 http 支持），现有套件不会报红。window_manager 放行用例（`tests/unit/main/window_manager.test.ts:131`）同样只测 https。
- 建议：补一个 `[x](http://example.com)` 用例断言 anchor 保留（href/rel/target），约 5 行，成本极低。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：本轮为 Round 1，无前轮。
- 改测方向复核：无。diff 仅新增测试与 mock 基础设施（`window_manager.test.ts` mock 的 `webContents` 增加 `on` 捕获、`willNavigateListeners` 数组、beforeEach 清空），未改动任何既有 `it`/`expect`；`MarkdownMessage.test.tsx` 仅在末尾追加新 describe。无「把断言预期迁就当前实现」的改动。
- 本轮新发现：1 条（f001，minor）。

### 测试可信核查（应任务方要求特别核对）

1. **渲染用例触达真实 ReactMarkdown 渲染路径（非 mock）**：`MarkdownMessage.test.tsx` 直接 `render(<MarkdownMessage text=...>)`，import 生产组件，未 mock react-markdown / remark-gfm / `a` renderer。https 用例断言精确 `href`+`rel`+`target`，三者均由生产 `a` renderer 输出，证明 renderer 被真实触达。node 实测 `new URL` 对 `javascript:alert(1)`/`file:///etc/passwd`/`custom-scheme://x` 均解析成功且 protocol 为对应非 http(s) scheme → 三个纯文本用例命中生产白名单分支（非 catch 分支），生产逻辑真实被验，非库默认 urlTransform 掩盖。
2. **will-navigate 用例真实触发 handler**：`window_manager.test.ts:21-24` mock 在系统边界（Electron `webContents.on`）捕获监听器并直接调用生产闭包，验证生产 `new URL` + scheme 判断逻辑（阻塞 javascript:/file:、放行 https），未 mock 被测逻辑。mock 边界合规。
3. **AC-003「file:// 渲染入口不受影响」判定**：该子句依赖 Electron 文档契约——`webContents.loadURL` 为程序化导航，不触发 `will-navigate`；单测以 mock webContents 捕获监听器，无法验证平台事件语义，属合理平台依赖而非测试基础设施缺口。handler 的「非白名单阻塞」决策逻辑本身已被两用例覆盖（file: 阻塞、https 放行），与「file:// 入口用 loadURL 不受影响」不矛盾。真实验证宜走打包 exe smoke（`pnpm test:packaged` 涉及真实 Electron 窗口加载），已在下方「未进表的提示」登记。
4. **TDD 顺序**：新增用例对旧实现均真实 RED——旧 `a` renderer 无条件渲染 anchor 且无 rel/target（4 渲染用例在旧代码上全挂），旧代码无 will-navigate handler（`willNavigateListeners` 为空 → `toHaveLength(1)` 挂、`if (!listener) throw` 挂）。归因成立。
5. **全量回归**：`pnpm test` 253 文件 / 2854 用例通过；9 跳过全部为存量条件跳过（e2e headless、packaged 无 exe、平台条件、构建产物条件），非本 diff 引入。`session_history_markdown.test.ts`（另一渲染面）无 link/href 断言，不受影响。

- 未进表的提示（范围外，不进 finding）：
    - will-navigate handler 的畸形 URL catch 分支（`window-manager.ts:208-214`）无对应用例——setWindowOpenHandler 侧有 p125 畸形用例覆盖同类逻辑，新分支为防御性 catch，风险低，可加可不加。
    - AC-003「file:// 渲染入口不受影响」建议以真实窗口加载的打包 smoke 验证一次（本 task 纯单测无法覆盖平台事件语义），非阻断。
- 总体判断：测试可信度高，AC-001/002/003 行为均有真实路径覆盖，全量回归绿；仅 1 条 minor 覆盖补强建议，无未解决 critical/important。
- 系统性 follow-up：无（仅一条 minor 属 task 内补 case，无需新建 task）。

verdict: PASS

reviewed_scope: 90c54d7a22b3aa5a

## Round 2 (2026-08-11 03:55 UTC+8)

### 前轮 finding 复核

- **t297_test_f001（http:// 用例缺失，minor）——已消除**：`MarkdownMessage.test.tsx` 现含 `renders http link as an anchor with noopener noreferrer`，断言 `href="http://example.com"` + `rel="noopener noreferrer"` + `target="_blank"`。AC-001 五类 scheme（http/https/javascript/file/未知）现各有独立用例，http 支持回退到仅 https 时套件会报红。以 diff 与运行结果为准确认。

### 改测方向复核

无「迁就实现」改动，理由逐条：

- `window_manager.test.ts` will-navigate 两用例从「file: 拦」改为「javascript:/data: 拦 + https/file://（reload）放行」：非迁就实现。AC-003 明确要求「正常内部导航（file:// 渲染入口）不受影响」；原 Round 1 断言「file: 拦」反而与 AC-003 冲突。实现侧将 file: 纳入白名单是对 code reviewer f001 的真实 bug 修复（原 http/https-only 守卫会拦掉 SettingsView 导入后的 `location.reload()`，破坏渲染入口）。测试改为断言 file:// reload 放行，正是 AC-003 的直接要求。
- `MarkdownMessage.test.tsx`：纯新增 describe，未改动既有 expect。
- `data:` 新拦用例：`new URL("data:text/html,<h1>x</h1>").protocol === "data:"`，命中非白名单分支，行为真实被验，非弱化。

### 本轮新发现

0 条。

### AC-003 覆盖复核

- 非白名单拒绝：javascript: / data: → preventDefault 各断言 1 次。✓
- file:// 渲染入口不受影响：`file:///renderer/index.html?route#setting` → preventDefault 未调用。✓（Round 1 结论中「file:// reload 建议打包 smoke 验证」的 out-of-scope 观察现已被单测直接覆盖）
- http(s) 放行：https:// → preventDefault 未调用。✓

### 未进表的提示

- will-navigate 白名单为 file: 全 scheme（非仅 renderer index 路径）。但不可信 markdown 内容无法触发 will-navigate 的 file: 导航：非 http(s) 链接渲染为纯文本，http(s) 链接走 `setWindowOpenHandler` 外部打开而非本窗口导航；file: 放行仅影响受信 app 代码的 `location.reload()`。风险可控，属 code-review 域，不入 finding。
- will-navigate 畸形 URL catch 分支（`window-manager.ts:209-215`）仍无对应用例；`setWindowOpenHandler` 侧已有 p125 用例覆盖同类逻辑，防御性 catch，低风险。仍为范围外观察。

### 总体判断

Round 1 唯一 minor（f001）已修；test_f001 确认闭环。窗口守卫测试与 AC-003 对齐，渲染测试与 AC-001/002 对齐，15 用例全过（window_manager 9 + MarkdownMessage 6），typecheck 0 错误，无未解决 critical/important。

verdict: PASS

reviewed_scope: d30d8d4088e42614

## Round 3（最终，2026-08-11 04:00 UTC+8）

### 变更范围

收尾文档同步：`docs/specs/workspace.md` 新增「链接 scheme 白名单（t297）」段、`docs/specs/window-management.md` 新增「导航守卫（t297）」段、`docs/specs_index.md` 两行登记 t297。3 文件 7 增 2 删，无逻辑/测试变更，测试代码与实现未动。

### 前轮 finding 复核

Round 1 f001（http:// 用例缺失）、Round 2 无新 finding——均已闭环；本轮无新测试或实现变更，无新增复核项。

### 本轮新发现

0 条。文档同步不改变测试覆盖结论：AC-001/002 渲染测试（MarkdownMessage 6 用例）与 AC-003 守卫测试（window_manager 9 用例）维持全绿。

### 总体判断

评审结论稳定于 PASS，无未解决 critical/important。

verdict: PASS

reviewed_scope: 160b60690bddd68a

## Round 4（最终，2026-08-11 04:05 UTC+8）

### 变更范围

commit 前 `prettier --write` 仅格式化 `src/main/window/window-manager.ts`（if 白名单条件多行展开，23 增 0 删）。行为逻辑不变（http:/https:/file: 白名单），测试文件与实现逻辑未动。

### 前轮 finding 复核

Round 1 f001、Round 2/3 无新 finding——均已闭环。本轮纯格式，无新增复核项。

### 本轮新发现

0 条。格式化不改变测试覆盖结论；15 用例维持全绿。

### 总体判断

评审结论稳定于 PASS，无未解决 critical/important。

verdict: PASS

reviewed_scope: 0020d3ffaa3460e7
