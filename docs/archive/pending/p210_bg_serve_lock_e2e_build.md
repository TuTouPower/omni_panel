# p210 background serve 锁冲突打包形态进程级 e2e 缺失

- 现象：t440 修复后,code0 早退判定由单测覆盖,但「先起健康实例占锁再后台 serve → 父进程秒级失败 + stderr 锁冲突诊断」的**进程级端到端行为无自动测试**;spec「全部 AC 可自动测试」声明在进程级接线层未兑现。
- 影响：background serve 锁冲突路径(spec AC-002/003)进程级回归仅靠代码审阅,无 e2e 兜底。不阻断当前修复正确性。
- 根因：测试缺口。electron dev spawn 加载形态下 `--user-data-dir` 被 electron 自身消费、不达 app argv,父子 userData 分裂致 probe 目录错位,无法用 dev electron 复现后台 serve 锁冲突;需打包(build)产物——app argv 直通,user-data-dir 生效——才可端到端验证。t440 实施期确认此 dev 限制,进程级验证降级为单测 + 打包 e2e follow-up。
- 测试缺口：t440 已抽 classify_poll_result/build_early_exit_msg 单测 9 例(判定层);缺打包形态 e2e(先起健康实例占锁再后台 serve,断言父进程秒级失败、非 0 退出、stderr 含锁冲突提示而非「等待 serve 启动超时」)。
- 线索：无 `.scratch/`(t440 实施笔记记录 electron dev --user-data-dir 透传缺陷,详见 t440 task.md 实施笔记)
- 处理：t443
