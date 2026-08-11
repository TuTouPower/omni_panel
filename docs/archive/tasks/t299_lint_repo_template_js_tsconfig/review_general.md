# Task review t299（reviewer_focus: 通用）

- task：`t299_lint_repo_template_js_tsconfig`
- spec：`docs/tasks/t299_lint_repo_template_js_tsconfig/spec.md`
- diff_anchor：`0bb142023b7f0d34ca84c093bb07cc5b22747e96`
- target：`git diff 0bb142023b7f0d34ca84c093bb07cc5b22747e96`
- round：1
- reviewed_at：2026-08-11 04:34 UTC+8

## Findings

### t299_gen_f001 - eslint.config.ts 注释将 chain_plan.js 误标为「测试数据」

- 严重度：minor
- 锚点：注释准确性（无对应 AC，不阻断；排除决策本身正确）
- 位置：`eslint.config.ts:65`
- 问题：注释把 `chain_plan.js` 归为「链式规划测试数据」，但该文件实为看板链式规划运行时模块（IIFE + `globalThis.ChainPlan` 导出，`computeBatchPlan` 为算法实现），由 board.html 加载、亦被 node 回归测试 require（`tests/repo_template/test_chain_plan.py` 经 node 运行 `test_chain_plan_cases.js` 驱动）。真正的「测试数据」只有 `test_chain_plan_cases.js`（93 行用例集）。误标会误导维护者把 chain_plan.js 当成可弃测试数据而非看板核心规划模块。排除行为不受影响。
- 建议：注释改为区分——chain_plan.js 为链式规划模块（看板 + node 测试共用）；test_chain_plan_cases.js 为行为回归用例数据。

## 结论

- 前轮 finding 复核：Round 1，无
- 本轮新发现：1 条（minor）
- 未进表的提示：
    - 全量 AC 独立验证均绿：`pnpm lint` 退出 0；`pnpm typecheck`（`tsc --noEmit`）0 错误；`pnpm test` 2857 passed / 253 files；`pytest tests/repo_template/test_chain_plan.py` 1 passed。
    - 特殊核对 1（ignores 排除是否合理）：3 个文件确为静态工具/测试数据——board.js 为 1133 行浏览器 vanilla JS（依赖 `window.__BOARD__`、DOM、localStorage），由 view_server.py 无构建直供；chain_plan.js 为纯前端确定性计算模块；test_chain_plan_cases.js 为 Python 测试经 node 驱动的用例数据。三者均非 TS 工程源码，排除合理，未误伤项目源码。
    - 特殊核对 2（是否遗漏 repo_template JS）：`scripts/repo_template` 与 `tests/repo_template` 树内仅此 3 个 .js，无其它遗漏；lint 全绿进一步佐证覆盖充分。全 lint 范围其余 .js（tests/fixtures/fake-plugins）由独立 tsconfig（allowJs:true）收编，不受影响。
    - 特殊核对 3（ignores 是否影响 typecheck）：tsconfig.json 无 allowJs（grep 计数 0），3 个 .js 本就不在 TS program 内，eslint ignores 与 typecheck 无耦合；typecheck 验证通过。
    - 修复负载验证：`--no-ignore` 下 3 个文件均复现「Parsing error: not found by the project service」，加入 ignores 后全绿——排除为必要且充分，非冗余条目。
    - 方案取舍：排除优于 allowDefaultProject（后者会对无类型注解的浏览器 JS 启用 type-checked lint，strictTypeChecked 下必然噪声），task.md 所述理由与代码事实一致。
    - AC-003 备注：vitest include 不含 `tests/repo_template`（该处为 Python 测试），「全量 pnpm test 通过」由 vitest 全绿 + 该 Python 测试通过双重验证。
    - 前瞻观察（不构成 finding）：repo_template 自模板仓 sync 若再引入静态 .js，需手动补 ignore 条目；当前 3 条已精确覆盖现患。
- 总体判断：3 条 AC 全部达成且独立验证通过，仅 1 条注释准确性 minor，不阻断。
- 系统性 follow-up：无

verdict: PASS

reviewed_scope: c930e0ff237590fb

## Round 2 (2026-08-11 04:36 UTC+8)

### 前轮 finding 复核

- t299_gen_f001：已消除。`eslint.config.ts` 注释已修正，现区分三者——board.js 为 HTML 看板脚本、chain_plan.js 为看板核心规划模块、test_chain_plan_cases.js 为链式规划测试数据，与代码事实一致（chain_plan.js 为 IIFE + `globalThis.ChainPlan` 模块，board.html 与 node 测试共用）。排除条目本体未变，仍精确覆盖 3 个文件。

### 本轮新发现

- 0 条

### 复核验证

- `pnpm lint` 独立复跑退出 0，无 warning/error（仅注释改动，行为不变）。
- 排除负载验证（Round 1 已做）：3 个 JS 在 `--no-ignore` 下仍报「not found by the project service」，ignores 条目必要性不受注释修正影响。

### 总体判断

f001（注释准确性 minor）已按建议修正，无新增问题；AC-001/002/003 维持 Round 1 验证结论，PASS。

verdict: PASS

reviewed_scope: 24859490c24b5431
