# p223 package 脚本自杀：pkill 误杀自身导致打包中断

- 现象：`pnpm package`（`scripts/package-and-run.ts` Step 1 `pkill -f omni_panel`）把自身 tsx 进程也杀掉，exit 143；旧实例已死但构建/启动均未执行。
- 影响：Linux 下 `pnpm package` 不可用，只能手动分步构建+启动；Windows（taskkill /im 精确镜像名）不受影响。
- 根因：`pkill -f` 按完整命令行匹配，tsx 进程的脚本路径含 `omni_panel`（仓库目录名），与目标进程名同串；t369 只处理了大小写，未排除自身。修复方向：匹配 `linux-unpacked/omni_panel`（仅打包产物路径）或 pkill 加 `-o` 老进程/排除自身 PID。
- 测试缺口：脚本无单测；应补 package-and-run 的 kill 目标选择单测（断言 pattern 不命中自身命令行样本）。
- 线索：2026-09-06 手动复现：旧实例 1024599 被杀，构建停在 Step 1，exit 143；改手动五步构建+启动恢复。
- 处理：未开
