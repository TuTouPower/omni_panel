# Task review t443（reviewer_focus: 测试）

- task：`t443_bg_serve_lock_e2e_build`
- spec：`docs/tasks/t443_bg_serve_lock_e2e_build/spec.md`
- diff_anchor：`233cd77369a598779ce687ee7732aa0f1f9a1b83`
- target：`git diff 233cd77369a598779ce687ee7732aa0f1f9a1b83`
- round：1
- reviewed_at：2026-09-04 03:25 UTC+8

## Findings

零 finding，逐项核对：

- AC-001（秒级失败 + 非 0 退出）：`expect(bg.exitCode).toBe(1)` + `elapsedMs < 15_000`，触达真实打包二进制进程退出行为，非 mock；实跑 927ms 通过。
- AC-002（锁冲突诊断 + 无超时误报）：`stderr` 含「实例已在运行」+ 不含「等待 serve 启动超时」，且 `port=${port}` 锚定诊断指向本用例健康实例（排除 probe 误撞本机常驻实例）。断言强度足够。
- AC-003（产物缺失 skip）：复用 `skipIfNoExe` 与 smoke.spec.ts 同一机制。
- 恒真/弱断言检查：无恒真断言；`expect(bg.exitCode).not.toBe(0)` 后紧跟 `toBe(1)` 精确断言；`elapsedMs` 上界断言真实测量（红轮手工验证秒级行为一致）。
- `.skip` 检查：仅 `test.skip(skipIfNoExe.skip, ...)` 条件 skip，与既有 smoke.spec.ts 一致，非硬 skip。
- mock 误用：无 mock，全真进程。
- teardown：kill + `reap_user_data_dir_processes`（t288 同源）+ `rmSync`，实跑后端口 18711 已释放、无残留。
- 改测方向复核：无（新增测试，无既有测试改动）。

## 结论

- 前轮 finding 复核：首轮，无。
- 改测方向复核：无。
- 本轮新发现：0 条
- 未进表的提示：无
- 总体判断：三条 AC 均有真实进程级断言覆盖且实跑通过，可 PASS。
- 系统性 follow-up：无

reviewed_scope: ae0222fa251cc1df

verdict: PASS
