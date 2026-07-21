# Task report T022

本报告所在 commit 即 task commit，SHA 由 `git log --grep T022` 查，不在此记录。

## spec 验收标准勾选

- [x] synthetic.json 含 enabled+failed connector。 - real KIMI 401 stale（enabled, items=2）加入 synthetic。
- [x] web plugin_failure_modes 测 `.card-state.err` 渲染。 - 2 case（error card + retry action），real/synthetic 都绿。
- [x] 删 electron/plugin_failure_modes.spec.ts。 - git rm。
- [x] `pnpm test:e2e:web` 全绿。 - real 43 passed / synthetic 42 passed + 1 skip。
- [x] `pnpm typecheck` 过。

## adoption 处置摘要

- 已修 4 项 / 遗留 1 项 / 无需修改 1 项
- T022_code_f001/f002 - 采纳：spec/注释 drift 对齐实际（KIMI 401 stale）
- T022_test_f001 - 无需修改：L182/L210 SPA 实现细节，DOM `.card-state.err` 覆盖够
- T022_test_f002 - 采纳：retry 去 if 守卫，直接断言
- T022_test_f003 - 遗留：crash 单测超 e2e 范围
- T022_test_f004 - 采纳：multi_account skip 注释 stale 修正

## 遗留问题

- **crash 路径单测**（test_f003）：connector crash（非零 exit）无 integration 单测，超 T022 e2e 范围。
- **pure failed card L182**（test_f001）：需 enabled+failed+items=[]，real 无；DOM `.card-state.err` 已覆盖 stale（L210），pure 分支留 SPA 单测。
