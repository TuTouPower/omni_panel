# d050 electron dev 加载形态 --user-data-dir 被 electron 消费、不达 app argv（2026-09-04）

- 来源：t440 实施期验证
- 结论：以 `electron out/main/index.js serve --user-data-dir=X` 加载(dev/未打包)时,--user-data-dir 被 electron 自身消费,不进 app 端 cli_args;打包 omni_panel 二进制则 argv 直通 app。故 electron dev 形态下后台 serve 父进程 spawn 的子进程 userData 目录与预期分裂。
- 证据：t440 黑盒——`electron out/main/index.js serve --user-data-dir=$PWD/.scratch/bh-serve` 父进程 probe 读默认 `~/.config/OmniPanel/cli.json`(options.userDataDir undefined),而子进程 serve 日志落默认 `~/.config/OmniPanel/logs/` 且成功 listening 17864;cli.json 的 userData 却指向 .scratch/bh-serve(electron 层已设)。父子 dataRoot 错位致父轮询 cli.json 永不匹配 pid → 15s 超时。Playwright `electron.launch` e2e 不受影响(playwright 控制参数传递,cli_serve.spec.ts 依赖它)。
- 影响：凡需在 dev/测试用 electron 直接加载验证带 user-data 隔离的进程级 CLI serve 行为,均会踩此分裂;进程级 serve 锁冲突等 e2e 须打包形态(p210)。后台 serve 父进程 spawn 子进程逻辑的进程级测试亦受此限。
- 现状：有效
