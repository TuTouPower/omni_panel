# d055 playwright electron.launch 注入 Chromium 开关使 extract_user_argv 剥离失效

- 来源：t459 task（GUI 型 electron e2e 黑盒验证时发现）
- 结论：`_electron.launch({ args: [MAIN_ENTRY, ...] })` 实际进程 argv 为 `[electron, --no-sandbox, --inspect=0, --remote-debugging-port=0, MAIN_ENTRY, ...用户参数]`；`extract_user_argv`（src/main/cli/args.ts:81）只检测 `rest[0]` 是否 `.js`，Chromium 开关在首位时 MAIN_ENTRY 落到中间，被 `find_command_index` 当作 CLI 命令 → `resolve_entry` 返回 invalid「未知命令」→ GUI 型 electron e2e（经 electron_app.ts fixture 启动的全部 spec）启动即失败。
- 证据：main（2f5bc2f3）上 `pnpm test:e2e:electron` secrets_persistence.spec.ts 3 例全挂，错误 `OmniPanel: 未知命令: .../out/main/index.js`；`npx tsx` 探针复现 argv 解析（chromium 开关形态 → invalid；无开关形态 → gui）。playwright 1.60.0。
- 影响：GUI 型 electron e2e 基线不可用；CI nightly（DISPLAY=:99 + test:e2e:electron）同路径应同样失败。修复方向：`extract_user_argv` 剥离所有位置的 `.js` 主脚本条目。修复属黑盒基础设施，独立于 t459 业务范围。
- 现状：有效
