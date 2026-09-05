# Task review t452（reviewer_focus: 通用）

- task：`t452_zindex_layer_class_fix`
- spec：`docs/tasks/t452_zindex_layer_class_fix/spec.md`
- diff_anchor：`56a44e019d6c77ae8a9b1b67924cbf7fec71aee9`
- target：`git -C '/home/testuser/testuser_ubuntu/omni_panel_t452' diff 56a44e019d6c77ae8a9b1b67924cbf7fec71aee9`
- round：1
- reviewed_at：2026-09-05 08:47 UTC+8

reviewed_scope: 86fe82b5514cc28e

## Findings

### t452_gen_f001 - 门禁字符串扫描漏反引号模板字面量

- 严重度：minor
- 锚点：AC-004（正向门禁须抓出新增裸 `z-*` 引用；当前树内无反引号类名，门禁结论不受影响，不阻断）
- 位置：`tests/unit/renderer/styles/layer_class_gate.test.ts:17`（`STRING_RE`）
- 问题：`STRING_RE` 只匹配双/单引号字面量，不含反引号模板字面量。用同文件正则逻辑独立复现（node）：`const a = \`absolute z-menu foo\`;`经`bare_layer_hits`得`[]`（漏报），而双引号同内容命中；注释与 `z-[var(--z-\*)]` 均正确放行。当前树内无反引号类名（`rg 'className=`'` 零命中，既有反引号仅为 aria-label/文本内容），故本次零漏报成立；但后续若有人写 `className={\`... z-menu ...\`}\`（条件类名常见写法），门禁会绿灯放行。
- 建议：`STRING_RE` 纳入反引号分支（`${...}` 插值按 fail-closed 处理），或改扫全文件正文并先剥注释；自检 pin 同步加一个反引号裸类用例。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：本轮为 Round 1，无前轮。
- 本轮新发现：1 条（minor）
- AC 复验方式：
    - AC-001：`re_verified`——逐点查 `src/renderer/components/workspace/SessionPane.tsx:337`（`z-[var(--z-sticky)]`）、`:346`（`z-[var(--z-context)]`）、`src/renderer/components/session-library/SelectionDock.tsx:25`（`z-[var(--z-sticky)]`）；PCRE2 全 `src` 扫裸 `z-*` 字符串引用零残留（唯一命中为 `RangePicker.tsx:123` 注释说明行，门禁按设计排除注释）；门禁测试重跑 3/3 通过。
    - AC-002：`re_verified`——`src/renderer/components/token-stats/RangePicker.tsx:124` 保留 `z-[var(--z-menu)]`，门禁第三个 `it` pin 住该位点，重跑通过。
    - AC-003：`re_verified`——`DESIGN.md:434,473` 两处已改任意值表述，`rg` 确认文档无残留裸类存在断言。
    - AC-004：`re_verified`——重跑门禁（自检 `it` 绿）＋独立 node 复现检测器行为（裸命中、任意值/注释放行）；残留反引号盲点见 f001（minor，不推翻门禁有效结论）。
    - AC-005 `[deploy]`：`trust_prior`——真机多窗口目视本审阅环境无法复验，依赖实施侧按 spec 替代验证（人工按位点截图确认）产出的证据。
    - coverage = 4/5
- 未进表的提示：`source_files` 若扫描根缺失会抛 ENOENT 而非干净失败（当前 `src/renderer`、`src/web` 均存在，仅提示）；`bare_layer_hits` 每字面量只记首个命中（诊断完备性，不影响 pass/fail）；其余视角已扫无命中——无恒真断言（自检含正反双向断言）、无 `.skip`/mock/阈值放宽、无新增外部输入与配置键、无偏航文件（6 文件皆在契约范围内，`task.md` 仅为状态 front matter 变更）。
- 总体判断：diff 精确覆盖契约范围（3 位点换任意值写法＋DESIGN 修正＋正向门禁＋t451 之上复验保留），数值语义不变（front matter 与 `globals.css:143-147` 一致为 10/60/90/100/120），唯一发现为 minor 门禁硬化建议，无阻断项。
- 系统性 follow-up：无（f001 为本 task 内测试文件局部硬化，不涉跨 task 基础设施）。

verdict: PASS

## Round 2 (2026-09-05 09:45 UTC+8)

- 前轮复核：t452_gen_f001 已消除——STRING_RE 已纳入反引号分支，node 独立复现三用例全 OK，门禁 3/3 通过。
- 本轮新发现：0 条（7 视角已扫）。
- AC 复验方式：沿用 Round 1 结论：AC-001/002/004 re_verified，AC-003 review 抽查文本，AC-005 trust_prior 待真机。

reviewed_scope: 5d06e5732328e2b4

verdict: PASS
