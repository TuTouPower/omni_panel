# Task review t316（reviewer_focus: 通用）

- task：`t316_vendor_logo_theme_visibility`
- spec：`docs/tasks/t316_vendor_logo_theme_visibility/spec.md`
- diff_anchor：`acdcfaae10b6b290daddd98639b1730a0f47e7cc`
- target：`git diff acdcfaae10b6b290daddd98639b1730a0f47e7cc`
- round：1
- reviewed_at：2026-08-12 02:40 UTC+8

## Findings

### t316_gen_f001 - 产物 CSS 残留 `[&_img]:block img` 死规则（无 DOM 应用，可接受；建议处置表登记）

- 严重度：minor
- 锚点：行为缺陷候选（implementer 主动披露，requested judgment）——当前无失败场景
- 位置：`out/web/assets/index-*.css`（构建产物，源为 `src/renderer/components/Icon.tsx:290` 注释 / 单测断言中的候选串）；`src/renderer/components/Icon.tsx:290`
- 问题：产物 CSS 仍含 `.\[\&_img\]\:block img{display:block}`（特异性 (0,1,1)）。独立核实：①该规则存在（CSS 字节序 117647）；②全部 out/web JS 产物 grep `[&_img]:block` class 应用为 0，即无任何 DOM 元素持有该 class，规则不匹配任何元素，无实际效果；③web e2e 4 条在真实构建 CSS 下实测通过，行为正确。来源为 Tailwind v4 全文本扫描将 Icon.tsx 注释 / spec.md / 单测断言中的候选串编译进 CSS，属已知良性行为。潜在隐患：未来维护者若从注释或旧文档复制该 class 回 wrapper（含 CSS 已预编译，无需重建即触发 (0,1,1) 覆盖），bug 会原样重现——单测断言 `not.toContain("[&_img]:block")` 能拦截 DOM 层，但拦不住注释层被复制的路径。判定：当前可接受，不阻断。
- 建议：接受现状（删除注释中的候选串反而损害修复解释价值）；在 task.md 处置表登记本观察，留痕供未来排查。

## 结论

- 前轮 finding 复核：Round 1 无
- 本轮新发现：1 条（minor）
- 未进表的提示：①`gen_synthetic.mjs` 可重建性未能独立复验——本环境缺 `data/responses.json`，无法重跑对比；已手工逐字段比对注入块与 `synthetic.json` 新条目（instanceId/sourceInstanceId/stateId/name/displayName/enabled/source/supportedProviders/activeProviders/metadata/snapshot + state 响应）一致，且注入走既有 synthetic-only connector 处理路径（`mock_server.mjs:78-108`）。②新单测 `keeps wrapper display rules from overriding img theme states` 断言 wrapper class 字符串（实现细节守卫，非可观察行为），若未来换实现方式（CSS module 等）会误报——与 e2e 分层互补，当前合理，不出 finding。③AC-003 的 e2e 仅覆盖 web 侧，Electron 侧由共享组件（Icon.tsx 无 web/electron 分叉）+ 共享 globals.css 机制保证，代码查证无分叉点。
- 总体判断：修复正确——wrapper 移除 `[&_img]:block`、`block` 下沉到 img 自身后，四条 display 规则同特异性 (0,1,0) 且源顺序（`.block`→`.hidden`→`.dark\:block`→`.dark\:hidden`）在四种主题×图片组合下全部正确；e2e 用真实构建 CSS 断言 computed display 触达可观察行为，AC-001~004 全覆盖。仅 1 条 minor，PASS。

### AC 复验方式

- AC-001：re_verified。独立重跑 `MOCK_FIXTURE=synthetic playwright test --project=web tests/e2e/web/vendor_logo_theme.spec.ts` 通过；并查证产物 CSS 层叠序：`.block`(0,1,0) 先于 `.hidden`/`.dark\:*`，light 下 dark 图命中 `.hidden` 得 none。
- AC-002：re_verified。e2e 实跑通过；查证 `.dark\:hidden:where(...)`（CSS 字节序 113916）晚于 `.block`（16279），dark 下 light 图命中 none。
- AC-003：re_verified。e2e AC-003 断言两图 visible 计数恰为 1，light/dark 双主题实跑通过；Electron 侧查证 `src/renderer/components/Icon.tsx` 为单一共享实现（`ProviderNav.tsx`/`PopupView.tsx` 等使用点无平台分叉），dark variant 定义于共享 `globals.css:8`。
- AC-004：re_verified。e2e AC-004（deepseek 单图两主题 display block + 容器 22px + objectFit contain）与单测 `keeps single-logo provider rendering intact (t316 AC-004)` 均实跑通过。

coverage = 4 / 4

- 系统性 follow-up：无

reviewed_scope: 9242769ed3fbab71
verdict: PASS

## Round 2 (2026-08-12 02:25 UTC+8)

### 前轮 finding 复核

- t316_gen_f001（minor）：已按 reviewer 建议处置——接受现状（死规则无 DOM 应用、e2e 实测正确）并在 task.md 处置表留痕（fix_ref 本行留痕，无代码改动）。Round 1 判定不变。

### 本轮新发现

无（0 条）。

### 结论（Round 2）

- f001 处置登记完成；无代码变更（处置表修改不计入行为 diff）。指纹更新至当前工作区状态。
- 总体判断：无未解决 critical/important/minor，PASS。
- 系统性 follow-up：无。

reviewed_scope: a386bd5e1f06170b
verdict: PASS
