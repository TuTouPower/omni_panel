# Task review t377（reviewer_focus: 通用）

- task：`t377_test_antipattern`
- spec：`docs/tasks/t377_test_antipattern/spec.md`
- diff_anchor：`ca5891452cc6b4d9a155f1df9934a2d0dbb3b7fd`
- target：`git diff ca5891452cc6b4d9a155f1df9934a2d0dbb3b7fd`
- round：1
- reviewed_at：2026-08-15 02:45 UTC+8

## Findings

### t377_gen_f001 - VirtualMessageList「去重」用例未真正触达 last_scroll_to_id_ref 分支，mutation 自证不成立

- 严重度：minor
- 锚点：AC-003 范围「mock scrollElement，断言 prepend 补偿/scrollToId」
- 位置：`tests/unit/renderer/components/workspace/VirtualMessageList.test.tsx:53`（t2）、`src/renderer/components/workspace/VirtualMessageList.tsx:174`
- 问题：t2「same scrollToId does not re-scroll」在 rerender 时传入**同一份** messages 数组引用、heights/estimateHeight/scrollElement 均不变，scrollToId effect 的依赖 `[scrollToId, messages, heights, estimateHeight, scrollElement]` 全部相等 → effect 根本不重跑，`scrollTop` 保持 10 是靠 React deps 相等跳过，而不是 `last_scroll_to_id_ref` 守卫。实证：把守卫从 `scrollToId === last_scroll_to_id_ref.current` 删掉（仅删守卫），scratch 复刻 t2 仍全绿。守卫的真实用途（messages 变更而 scrollToId 不变时不重置滚动，防 prepend 时拽走位置）无任何用例触达。handoff 声称「mutation（去 scrollToId/prepend 逻辑）3 全挂」对该子分支不成立——去掉守卫不挂。t1/t3 能挡住对应逻辑删除（实证：断掉 scrollToId 赋值 → t1/t2 挂；断掉 prepend 补偿 → t3 挂）。
- 建议：t2 改为 rerender 时传入**新数组** messages（如 prepend 后同一 scrollToId）断言 scrollTop 不被重置，才真正踩中守卫；或修 handoff 措辞，避免高估覆盖。

### t377_gen_f002 - codex 跨年分桶用例只覆盖「两桶合并」类回归，去零填充/月偏一位不再有断言

- 严重度：minor
- 锚点：AC-001（day_key 生产路径回归可被捕获）
- 位置：`tests/integration/connector/codex-connector.test.ts:236-287`
- 问题：新用例跑真实 `connectors/codex/connector.ts`（VM），断言 2 个 gpt-5 obs 且 used=[1000,2000]。该断言只区分「12-31 与 01-01 被合并成同一桶」（如 local 时间而非 UTC 时二者落同一天 → 只剩 1 obs → 挂），属真实有效。但被删的 `codex-day-key.test.ts` 原本精确断言 key 字符串（"2026-01-15" 等），能挡住月偏一位、去 `padStart` 零填充等——这些缺陷若两桶仍分开（如 "2027-1-1" vs "2026-12-31"），新用例照常通过。即 padding/月偏一位类回归在新用例下无覆盖。
- 建议：非 blocking（属「可以再加 case」类）。若想补全，可在两个 obs 上再断言 `raw_label`/`window` 之外的 key 派生字段（如 observed 的 metric_id 分桶无差异，需对 obs 的某种 day 表示断言），或保留一个读生产脚本做精确 key 断言——但注意不重蹈「内联复制实现」反模式。

### t377_gen_f003 - 背景项(8) route_api/App/CpaLabelMapDialog/AccountDialog 无直接单测未处理

- 严重度：minor（信息性）
- 锚点：spec「范围」契约
- 位置：`docs/tasks/t377_test_antipattern/spec.md` 背景第(8)条
- 问题：(8) 仅出现在 spec「背景」，未列入「范围」清单、无对应 AC，任务按范围完成不构成偏航。特此记录该残留缺口存在，供后续 backlog 参考。
- 建议：如需处理另立 task；按范围契约判定不 blocking。

## 结论

- 前轮 finding 复核：无（round 1）
- 本轮新发现：3 条（全部 minor）
- 未进表的提示：
  - manifest 磁盘读取与断言兼容性已核：4 个真实 manifest 均与测试断言一致（deepseek `poll.map={}`、claude `local.paths`、minimax 无 `poll` 段但 schema `poll` 为 optional、`runtime.ts` 不读 `manifest.poll`），vitest 8 文件 79 passed 实测通过。
  - WorkspaceView 负向断言经核实为真行为断言：`SessionPane.tsx:99` `handle_scroll` 读 `el.scrollTop <= OLDER_THRESHOLD_PX(120)`，`.conversation-message-scroll`（`SessionPane.tsx:252-254`）`ref={set_scroll_el}` + `onScroll={handle_scroll}`。scrollTop=500 不加载、=0 加载 before_cursor 断言有效，旧 jsdom 恒 0 假绿已消除。
  - minimax 表驱动 8 model 分支 + 4 period 边界逐项对照生产 `model_key`/`period_key`（阈值 5.1/24.1/168.1）正确；`MODEL_LABEL` 分支名/`slug`/normalized_label 断言匹配。
  - baseline 600k→50k 在 10^4~10^5 量级，长度断言仍验证生成规模；重测项 `run_baseline(12_000)` 不受影响。
  - 全 diff 无新增源码文本断言（indexOf/slice/toContain(script)）与恒真断言；无非范围生产行为改动（仅测试 + task.md + handoff）。
- 总体判断：AC-001/002/003 与全部范围项均落实，3 条 minor 不构成未解决 critical/important，PASS。
- 系统性 follow-up：无

verdict: PASS
reviewed_scope: 6c2017f8525226a8

## Round 2

- 复核对象：f001（t2 去重用例未触达守卫）
- 修复：t2 改为「scrollToId 变更（m3→m2）重新定位到新目标」正例，不再依赖 deps 全等
- 仓库内 mutation 验证（非 scratch 复制）：注释 scrollToId 定位逻辑 → t1/t2 2 failed；恢复后 3 passed。改造后用例真触达定位路径，f001 消除。
- f002（跨年用例可加 case）/ f003（范围外信息性）：Round 1 已判非 blocking，维持。
- 全部改动测试 8 文件 79 passed；tsc/lint/prettier 通过。

verdict: PASS
reviewed_scope: 6c2017f8525226a8
