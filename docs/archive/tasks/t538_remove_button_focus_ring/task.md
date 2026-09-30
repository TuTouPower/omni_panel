---
tid: "t538"
slug: "remove_button_focus_ring"
title: "按钮类不透明焦点环彻底移除"
status: "done"
branch: "t538_remove_button_focus_ring"
worktree: ""
review_level: "single"
review_limit: "5"
verify_limit: "5"
diff_anchor: "c666bd36e6078b7ae000ff174f9dfb09d4452abb"
depends_on: ""
conflicts_with: ""
note: "来源 p270；A类全去，B类保留"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

- 红绿：先在 `tests/e2e/web/popup_view.spec.ts` 追加 t538 三用例，未改代码跑 `-g t538`：AC-001/002 失败（类名含 `focus-visible:ring-2` 等不透明环）、AC-003 通过，符合预期红；实现后三用例全绿。
- Chromium 实测结论（headless，真行为）：鼠标点击后为鼠标模态，`el.focus({ focusVisible: true })` 也不能使 `:focus-visible` 匹配（空页对照：无点击时可匹配）。故 AC-001/002 最终按 spec 字面断言点击后 `matches(':focus-visible')===false` + 类名无 `ring-` 片段 + box-shadow none + 失焦重进循环；强制 focusVisible 写法中途引入后又移除（只测 harness 不测产品），未入最终 diff。
- `ring-[var(--color-accent)]`（非 `-ring` 后缀）改后在 `src/`、`tests/` 零命中；半透明 `accent-ring`（B 类）全部保留。
- p261 旧 jsdom 用例整体删除（spec「有意不测」已写明理由，未就地改预期）。
- p270 来源 pending 建 task 时已归档（`docs/archive/pending/p270_refresh_button_focus_ring_recur.md`），无需二次归档。
- worktree 依赖：软链主仓 `node_modules` + `gen-build-info.ts` 生成 `src/generated/` + sqlite ABI 校验通过；`out/` 缺失致 `build_code_split.test.ts` 7 用例跳过，补跑 `pnpm build` 后全绿。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round 1 (2026-09-30T19:10:00+08:00)

Round 1 零 finding（`review_general.md` verdict: PASS）。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`pnpm test` 341 passed | 1 skipped 文件、4288 passed | 8 skipped 用例（跳过均为环境条件：`build_code_split` 7 用例需 `out/` 产物、`session-path-index` 1 用例预设条件；`pnpm build` 后补跑前者 7 用例绿）；`pnpm typecheck` / `lint` / `format:check` / `md_format --check` / `deadcode` / `arch` / `schema:check` / `pnpm build` 全绿
- 黑盒：`test:e2e:web`（headless chromium，`MOCK_FIXTURE=synthetic`）`popup_view.spec.ts -g t538` 3 passed；改前红（AC-001/002 失败）改后绿。electron 真窗时序按 spec 以 web 点击+重聚焦路径等价覆盖，未申请弹窗许可。
- review：single 级，`review_general.md` Round 1 PASS 零 finding
- AC 证据：见 `handoff.json`

### 结果摘要

- `Button` 基类与 `icon-link` 不透明焦点环删除，p261 焦点重置逻辑删除，p261 旧单测删除，t538 web e2e 三用例新增，decisions 新增 045；遗留无
