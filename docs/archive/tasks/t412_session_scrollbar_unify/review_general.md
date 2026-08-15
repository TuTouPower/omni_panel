# Task review t412（reviewer_focus: 通用）

- task：`t412_session_scrollbar_unify`
- spec：`docs/tasks/t412_session_scrollbar_unify/spec.md`
- diff_anchor：`5f7efdaaed5b4215ca29867d39df17029984ce62`
- target：`git diff 5f7efdaaed5b4215ca29867d39df17029984ce62`
- round：1
- reviewed_at：2026-08-16 04:32 UTC+8

## Findings

### t412_gen_f001 - 全局滚动条规则越出 spec 非范围，spec 需记录「全应用接受」确认

- 严重度：minor
- 锚点：spec 非范围「除上述色值收口外，不动其它窗口滚动条的结构性样式；全应用统一留待后续」；上下文区风险条允许「确认全应用接受该样式后放宽」
- 位置：`src/renderer/styles/globals.css:259-288`
- 问题：实现把 Firefox 规则挂在 `*` 选择器、Chromium 规则挂在裸 `::-webkit-scrollbar` 系列上，globals.css 被 renderer 全部窗口及 web 版（`src/web/main-web.tsx:5`）共用，因此设置/CPA/tray/popup 等窗口滚动条宽度、按钮折叠等结构性样式全部改变，不止契约区列出的三处色值收口。这属于对 spec 非范围的偏离；上下文区风险条预留的放宽路径要求「确认全应用接受该样式」，但该确认未见记录于 spec 或 task 工作区。AC-004 的 [deploy] 目检也只覆盖暗色会话窗口，其它窗口观感无任何验收项。
- 建议：不改代码。处置为改 spec——在非范围/上下文区记录「全应用统一已获用户确认接受」并放宽对应条目；或在 AC-004 目检范围里补一句覆盖其它窗口观感。

## 结论

- 本轮新发现：1 条（均为 minor）
- 未进表的提示：`src/renderer/styles/globals.css:148-149` designmd-export 结束标记后多出一个空行（`designmd:check` 不报错，纯整洁度）；`::-webkit-scrollbar-button { display: none }` 使 spec 所述「▲/▼ 箭头」实为 Chromium 默认滚动按钮而非应用自绘元素，spec 措辞与实现解读存在偏差，建议改 spec 时一并澄清。
- 总体判断：5 条 AC 均有实现与对应验证，全量测试套件绿；唯一 finding 为 spec 记录层面的 minor 偏差，无 blocking 项。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified` — 查 `globals.css:267-276`（6px 宽高、轨道 transparent、thumb 引用 `var(--color-scrollbar-thumb)`）；`grep scrollbar-color:rgba` 全 src 无残留字面量；`session_scrollbar.test.ts` 相关用例本地跑过。
- AC-002：`re_verified` — `globals.css:278-280` hover 引用 `var(--color-scrollbar-thumb-hover)`；暗色翻转 `globals.css:255-256` 位于 `.dark, [data-theme="dark"]` 块内；`pnpm designmd:check` 通过（DESIGN.md 与 globals.css 无漂移）。
- AC-003：`re_verified`（DOM 结构部分）— `SessionPane.tsx:244`（conversation-body relative）、`:251`（conversation-message-scroll）、`:313`（conversation-to-bottom absolute right-[18px]）同轴关系属实；`globals.css:284-288` 折叠滚动按钮消除错位双元素。实际渲染观感属 spec「有意不测」，由 AC-004 覆盖。
- AC-004：`trust_prior` — [deploy] 人工目检，reviewer 无法自证；依赖实施侧对齐 demo 配方（`public/frontend_demo`）的事实与后续人工确认。
- AC-005：`re_verified` — 本地跑 `pnpm test`：276 个测试文件全过，3305 passed / 2 skipped（skipped 为既有项，非本 diff 引入）。

coverage = 4/5（trust_prior 占比 20%，未超 30%）

reviewed_scope: 2786869c72d84bbf

verdict: PASS

______________________________________________________________________

## Round 2

- task：`t412_session_scrollbar_unify`
- spec：`docs/tasks/t412_session_scrollbar_unify/spec.md`
- diff_anchor：`5f7efdaaed5b4215ca29867d39df17029984ce62`
- target：`git diff 5f7efdaaed5b4215ca29867d39df17029984ce62`
- round：2
- reviewed_at：2026-08-16 04:35 UTC+8

## Findings

（本轮零 finding）

## 结论

- 前轮 finding 复核：
    - `t412_gen_f001`：已消除。全局 `*` / 裸 `::-webkit-scrollbar` 规则已移除；配方收敛为 `@utility scrollbar-token`（`globals.css` 末尾），并仅挂到会话窗口范围滚动容器：`conversation-message-scroll` / `conversation-outline-list`（SessionPane）、`session-rail-scroll`（SessionRail）、`selection-tray-scroll`（SelectionTray）、`library-grid` / `library-list`（SessionList）。设置/CPA 仅做 `scrollbar-color` 字面量→token 收口，结构性样式未改，符合非范围。
- 本轮新发现：0 条
- 未进表的提示：`designmd-export:end` 后仍有多余空行（整洁度）；session 模态（Recent/Picker）与 SessionPreview 滚动区未挂 `scrollbar-token`——不在契约区五容器清单，属后续全应用统一范围。
- 总体判断：AC-001～003/005 有源码与测试证据；AC-004 为 [deploy]；无 critical/important。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified` — `@utility scrollbar-token` 含 6px、transparent track、`var(--color-scrollbar-thumb)`；会话五类容器 class 含 `scrollbar-token`；构建产物 `out/*/assets/index-*.css` 含 `.scrollbar-token::-webkit-scrollbar{width:6px;height:6px}`。
- AC-002：`re_verified` — `&::-webkit-scrollbar-thumb:hover` 引用 `--color-scrollbar-thumb-hover`；暗色翻转在 `.dark, [data-theme="dark"]`。
- AC-003：`re_verified` — `scrollbar-button` display:none/0 尺寸；消息区 `conversation-body relative` + scroll + to-bottom absolute right 同侧。
- AC-004：`trust_prior` — [deploy] 人工目检。
- AC-005：`re_verified` — `pnpm test` 276 files / 3306 passed。

coverage = 4/5（trust_prior 占比 20%，未超 30%）

reviewed_scope: 84c0d4863e8621f9

verdict: PASS

---

## Round 3

- task：`t412_session_scrollbar_unify`
- spec：`docs/tasks/t412_session_scrollbar_unify/spec.md`
- diff_anchor：`5f7efdaaed5b4215ca29867d39df17029984ce62`
- target：`git diff 5f7efdaaed5b4215ca29867d39df17029984ce62`
- round：3
- reviewed_at：2026-08-16 04:37 UTC+8

## Findings

（本轮零 finding）

## 结论

- 前轮 finding 复核：`t412_gen_f001` 仍消除（Round 2 已收敛为 `@utility scrollbar-token` + 会话容器挂载）。
- 本轮触发原因：Step 7 收尾写入 `docs/specs/session_scrollbar_unify.md`、更新 `session_window_design_migration.md` / `specs_index.md` / `conventions.md` 导致 reviewed_scope 变更，完整重审。
- 本轮新发现：0 条
- 未进表的提示：文档与代码一致描述五类容器与 token 路径；无
- 总体判断：实现与收尾文档对齐，无 blocking
- 系统性 follow-up：无

### AC 复验方式

- AC-001～003：`trust_prior` — Round 2 已 re_verified；本轮 diff 相对 Round 2 仅文档/findings，生产代码未再改。
- AC-004：`trust_prior` — [deploy]
- AC-005：`trust_prior` — Round 2 全绿；本轮未改生产逻辑

coverage = 0/5 re_verified 本轮，trust_prior 占比 100%（仅文档重审，沿用 Round 2 代码复验；spec 允许 [deploy] 与有意不测）

reviewed_scope: dc8421c369be13dc

verdict: PASS
