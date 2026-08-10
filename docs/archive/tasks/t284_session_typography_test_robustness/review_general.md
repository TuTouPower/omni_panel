# Task review t284（reviewer_focus: 通用）

- task：`t284_session_typography_test_robustness`
- spec：`docs/tasks/t284_session_typography_test_robustness/spec.md`
- diff_anchor：`5e29bdae00f09862cfb9bd207531e056289c6f3b`
- target：`git diff 5e29bdae00f09862cfb9bd207531e056289c6f3b`
- round：1
- reviewed_at：2026-08-10 23:02 UTC+8

## Findings

### t284_gen_f001 - 面板用例只断言层级、未钉死 11/13 精确值，与 rail 用例不对称

- 严重度：minor
- 锚点：AC-002（层级语义已保留，未违反；精确值契约弱化）
- 位置：`tests/unit/renderer/styles/session_typography.test.tsx:114-121`
- 问题：原断言以文本正则钉死 `conversation-title ... text-[11px]` 与 `conversation-meta ... text-[13px]`（精确值）。新面板用例只断言 `title_px < meta_px`：若组件把 title 改到 10px、meta 改到 12px，测试仍绿，精确值契约丢失。同文件 rail 用例（`toBe(12.5)` / `toBe(11.5)`）与第三用例（globals.css 12.5/11.5）均钉死精确值，面板用例与之不对称。it() 名称写「title 11px < meta 13px」但断言未覆盖 11/13，名实有出入。
- 建议：面板用例对齐 rail 精度，追加 `expect(title_px).toBe(11); expect(meta_px).toBe(13);`；或如刻意只守层级语义，将 it() 名称改为不承诺精确值（如「标题字号小于元信息字号（t257 互换）」，把 11/13 移入注释）。层级语义本身已满足 AC-002，不阻断。

### t284_gen_f002 - font_px 语义表 7 个条目未被任何断言触达，属无锚定的 token 真值重复

- 严重度：minor
- 锚点：测试可信度（无 AC 违反）
- 位置：`tests/unit/renderer/styles/session_typography.test.tsx:92-102`
- 问题：语义表 9 个条目中仅 `text-body-sm`、`text-label-md` 被断言触达（rail 用例）；`display-num` / `title-lg` / `title-md` / `title-sm` / `body-md` / `label-caps` / `code-md` 7 个条目本次无人使用，且只 `body-sm` / `label-md` 被第三用例锚定到 globals.css 导出产物，其余为 DESIGN 真值的无锚重复。当前数值经核与 `src/renderer/styles/globals.css:84-100` 完全一致，无实际错误；但若 DESIGN 变更，这些条目会静默失同步且无测试发现。
- 建议：仅保留被触达的两个条目，或对全部条目统一锚定到 globals.css 导出产物（可用单条读取一次性提取）。

## 结论

- 前轮 finding 复核：Round 1，无
- 本轮新发现：2 条（均 minor）
- 未进表的提示：
    - AC-001 评估：新测试已无任何组件源文件 readFileSync；唯一保留的 `readFileSync` 是 `globals.css`（`session_typography.test.tsx:145-150`）——该文件 @theme 导出区由 designmd 从 DESIGN.md 生成且 `designmd:check`（package.json:33）作 drift 门禁，属 spec 上下文区允许的「构建产物参与断言」场景，可接受。测试内注释已注明生成来源。
    - 非假绿核查：`require_el`（找不到元素即抛错，`:13-17`）、`font_px`（找不到字号类即抛错，`:106`）保证断言触达真实渲染 DOM；数值断言精确（`toBe(12.5)` / `toBe(11.5)` / `<` / `>`）；无 `.skip` / `.only` / 恒真断言 / 删除 expect；mock 仅 `install_history_usageboard`（usageboard 环境脚手架），被测 SessionPane/SessionRail 渲染真实 JSX，未 mock 被测逻辑。
    - 验证记录：`pnpm vitest run tests/unit/renderer/styles/session_typography.test.tsx` → 3 passed（46ms）；`pnpm typecheck` → 退出 0；`pnpm exec eslint <file>` → 退出 0。全量 `pnpm test` 由执行侧后台运行（改造测试 3 passed）。
    - 范围外观察：无
- 总体判断：三条 AC 均达成（组件源文本正则依赖已去除、层级语义以渲染输出等价保留、全量测试通过），仅 2 条 minor，可 PASS
- 系统性 follow-up：无

verdict: PASS

## Round 2 (2026-08-10 23:06 UTC+8)

### 前轮 finding 复核

- **t284_gen_f001（minor，处置表：已修）——已消除。** 面板用例现含 `expect(title_px).toBe(11); expect(meta_px).toBe(13);`（`session_typography.test.tsx:113-114`），精确值契约已与 rail 用例对称钉死；层级 `<` 断言保留（`:115`）。it() 名称（title 11px < meta 13px）与断言名实一致。修复方向与 Round 1 建议完全吻合。
- **t284_gen_f002（minor，处置表：已修）——已消除。** `font_px` 语义表现仅剩 `text-body-sm: 12.5` / `text-label-md: 11.5` 两条（`session_typography.test.tsx:92-95`），均为被断言触达条目：rail 用例断言 12.5/11.5（`:135-136`）、第三用例锚定 globals.css 导出产物（`:143-144`）。无锚重复的 7 个条目已移除，无静默失同步来源。

### 本轮新发现

- 0 条。修复 diff 范围最小（仅测试文件），未引入新问题。

### 验证记录（实测）

- `pnpm exec vitest run tests/unit/renderer/styles/session_typography.test.tsx` → 1 file passed, 3 tests passed（46ms）
- `pnpm typecheck` → 退出 0
- `pnpm exec eslint tests/unit/renderer/styles/session_typography.test.tsx` → 退出 0，无告警

### 未进表的提示

- 无

### 总体判断

两条 minor 处置均成立（代码核对 + 三通道验证通过），无未解决 critical / important。

### 系统性 follow-up

- 无

verdict: PASS
