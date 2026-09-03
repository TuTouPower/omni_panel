# p209 background serve 启动竞态:单实例锁冲突致 code-0 静默早退,父进程误判空等超时

- 现象：旧实例正关闭(quit 至锁释放空窗)期间立刻执行 `omni_panel serve` → 子进程拿不到单实例锁、code-0 静默退出且零日志;后台父进程把 code-0 早退当「仍在启动」,白等 15s 后误报「等待 serve 启动超时」。期望:秒级失败并给出「另一实例关闭中」类诊断。
- 影响：`serve` 后台启动路径的健壮性与可诊断性。仅锁冲突竞态窗口(秒级)触发;不影响正常单次启动、GUI 启动、瘦客户端。同类扫描已覆盖主进程全部 spawn/execFile/exitCode 位点与 requestSingleInstanceLock 唯一入口,无其它确认同类位点。
- 根因：产品缺陷(竞态)。`index.ts:164` `requestSingleInstanceLock()` 失败 → `index.ts:166 app.quit()` **返回 code 0**,且在 whenReady(日志初始化)前顶层执行 → 子进程零日志退出。`background_serve.ts:103` 轮询只认 `exitCode !== 0` 为失败,code-0 早退被误判为启动中 → 空等 15s。已确认同类位点清单:无(仅 background_serve.ts:103 一处父子等待循环;query-dispatcher 等子进程由 exit 事件统一处理、语义为崩溃自愈,非同类)。已扫,无同类。
- 测试缺口：父进程后台等待逻辑(background_serve.ts 顶层 spawn + 轮询)无单测;cli_serve e2e(spec.ts)只覆盖 `--foreground` 与瘦客户端,未盖 background 父进程等待、未盖单实例锁冲突(code-0 早退)场景。应补:单测覆盖父进程对子进程 code-0 早退的处理(应判失败退出、不空等),及对非0 早退既有分支;e2e 加「已运行实例占锁时再 serve → 快速失败并提示」场景。
- 线索：`.scratch/task-bug-serve-lock/repro_notes.md`(含受控验证:健康实例占锁时 `serve --foreground` 实测 code-0 退出、零日志、无残留)
- 处理：t440
