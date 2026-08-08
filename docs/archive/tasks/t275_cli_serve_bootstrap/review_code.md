# Task review t275（reviewer_focus: 代码）

- task：`t275_cli_serve_bootstrap`
- spec：`docs/tasks/t275_cli_serve_bootstrap/spec.md`
- diff_anchor：`f7dec21b0f46da57db7253e51a6807c7e5391d64`
- target：`git diff f7dec21b0f46da57db7253e51a6807c7e5391d64`
- round：1
- reviewed_at：2026-08-08 23:50 UTC+8

## Findings

### t275_code_f001 - `--config` 导入失败无 CLI 可读错误信息（违反 AC8）

- 严重度：important
- 锚点：AC8「`--config` 指向不存在或非法 JSON 文件给出非零退出码与**可读错误信息**」
- 位置：`src/main/index.ts:1150-1167`（boot catch）、`src/main/core/logging.ts:126`
- 问题：`import_config_file` 失败（文件不存在 / 非法 JSON / schema 校验失败，`src/main/cli/import-config.ts:40-49`）在 boot 中抛错，落入 `app.whenReady().then` 的 catch（`src/main/index.ts:1150`），该分支只做两件事：`logger.error` 写日志 + `dialog.showErrorBox` GUI 对话框 + `app.exit(1)`。CLI 模式无窗口，`showErrorBox` 对话框无人可见；且 console transport 仅在 `process.env["NODE_ENV"] !== "production"` 时挂载（`src/main/core/logging.ts:126`），打包/生产下 `logger.error` 只写 `logs/app-*.log` 文件，stderr 无任何输出。CLI 用户看到的是进程静默退出、无错误可读。对比：CLI 用法解析错误（缺子命令、未知子命令、`--config` 缺参、`--port` 非法）走 `index.ts:111-122` 的 stderr 分支，通道正确；但运行时导入失败与它不一致。
- 建议：CLI 模式下 boot catch 额外向 `process.stderr` 写可读错误（与用法错误同一通道），再 `app.exit(1)`；或复用 `import_config_file` 失败信息的英文 ENOENT 原文改为中文可读文案（`import-config.ts:40` 的 `readFile` ENOENT 未包装，message 是原始系统错误）。

### t275_code_f002 - WSL 运行指南交付物缺失（spec 范围 AC7 支撑文档未实现）

- 严重度：important
- 锚点：spec「范围」——「WSL 运行所需的依赖与启动方式写入面向人的指南文档（含无 WSLg 时 `xvfb-run` 包一层）」；「Finalization 时更新 blueprint」——`docs/guides/` 新增或既有指南补充
- 位置：`docs/guides/`（`custom-connector.md`、`testing.md`，diff 无任何改动）
- 问题：`git diff f7dec21b0f46da57db7253e51a6807c7e5391d64` 不含任何 `docs/guides/` 或文档改动（见 diff --stat：仅 spec.md/task.md 两个文档变更，均为元数据与契约区更新）。全仓 grep `xvfb|cli serve|--cli` 命中仅 spec/task 与后续 task 的 spec，无面向人的 WSL 运行指南。AC7 是 `[deploy]` 条目（agent 无法自证 WSL 实机），其可行性依赖该指南；指南缺失使 AC7 的交付前提未落实。
- 建议：新增 `docs/guides/` 下 CLI 模式运行指南，写明 Electron GUI 依赖（libgtk 等）、无 WSLg 时 `xvfb-run` 包一层启动方式、`--cli serve` 语法与 cli.json 产物说明。可归入 t275 补齐或作为 follow-up task，但需在结论段显式登记。

### t275_code_f003 - 导入失败时已转存的 vault secret 不回滚

- 严重度：minor
- 锚点：行为缺陷——失败状态残留
- 位置：`src/main/cli/import-config.ts:54-66`（secret 转存）与 `:90`（`configStore.save`）
- 问题：`import_config_file` 先逐条把明文 secret 写入 vault（`deps.secretsStore.set`），之后才备份 `.bak` 并 `configStore.save(stripped)`。若 save 失败（`writeJsonAtomic` 抛错，如磁盘错误），vault 已写入的 secret 无回滚，成为孤儿条目；下次进程启动（若沿用旧 config.json）vault 中残留与本 config 不对应的 secret。相比 `handleConfigImport`（`config-ipc.ts:481-492`）对「config 已写、secrets 失败」有显式回滚，此处无对应保护。实际影响小（原子写失败概率低、孤儿条目无害），但违反 AC8「不留半初始化状态」的字面语义。
- 建议：save 失败时对本次 `set` 的 key 逐个 `delete` 回滚，或先备份后转存 secret、再 save 的次序调整（先备份再写 vault 再 save，失败仍难全回滚，删 key 最直接）。

### t275_code_f004 - cli.json 写入失败会中止已成功启动的服务

- 严重度：minor
- 锚点：行为缺陷——错误路径不一致
- 位置：`src/main/index.ts:558-562`
- 问题：`write_cli_json` 抛错（dataRoot 不可写）会 reject，落入 boot catch → `app.exit(1)`，把已成功 `local_api.start()` 的进程杀掉。stdout 已打印 URL、服务已 listen，仅因实例发现文件写失败而整体退出。对 CLI 场景，服务可用性本应与 cli.json 写入解耦（cli.json 写失败可 warn 降级，不阻断 serve）。
- 建议：`write_cli_json` 失败时 catch 后 `log.warn` 降级，不抛；cli.json 是辅助产物，不应阻断主服务。

## 结论

- 前轮 finding 复核：Round 1，无前轮
- 本轮新发现：4 条（2 important + 2 minor）
- 未进表的提示：
    - 文件过大：`src/main/index.ts` 1173 行（物理行数）> 800 行重要阈值，但本 task 仅净增 54 行（`+54 -0`），未达到「本 task 仍净增该文件行数」的出 finding 条件，按降级规则不进 finding 表。`src/main/cli/import-config.ts` 93 行、`args.ts` 76 行、`cli-json.ts` 33 行，均远低于阈值。
    - 圈复杂度：`import_config_file`（`import-config.ts:36-93`）手算 CC 约 7（基数 1 + try/catch + safeParse 分支 + for 循环 + 内部 if + map filter 分支 + 备份 try/catch），`parse_cli_args`（`args.ts:31-76`）约 6，均 < 10，不进表。
    - 范围外观察：diff 对 9 个既有 IPC 测试文件（`tests/unit/ipc/*.test.ts`）与 2 个 session-history 测试的改动是 WSL/Linux 环境适配（`set_renderer_index_path` 改 `fileURLToPath` 往返、mtime 量化加 50ms 延迟、WSL UNC 探测 `it.skipIf`），为「预存在基线修复」，与 t275 核心功能无直接关系，但属已批准基线修复，不单独出 finding。
    - `import-config.ts:40` 的 `readFile` ENOENT 未包装原始英文错误，已并入 f001。
    - AC3 中「采集能凭该密钥成功请求」未在 e2e 做真实采集断言（需真实 API），但 secret 转存 keyFor 空间与 refresh-service 读取路径（`refresh-service.ts:127`）一致，链路成立，不据此出 finding。
- 总体判断：AC1-AC6 实现完整且 e2e/单测覆盖到位，核心 CLI 分支正确；但 WSL 运行指南交付物缺失、CLI 导入失败错误通道不符合 AC8，两处 important 未解决。
- 系统性 follow-up：建议标题「WSL CLI 模式运行指南」，slug `wsl_cli_serve_guide`，阻断性 follow-up（非 blocking，但属 spec 范围交付物）；或由 implementer 在本 task 补齐。

verdict: FAIL

## Round 2 (2026-08-09)

对照 diff f7dec21b 复核 Round 1 code findings 处置：

- f001 已修：boot catch 现 `if (cliMode) { process.stderr.write(\`OmniPanel: 启动失败：${message}\n\`); app.exit(1); return; }`（index.ts:1168-1172，diff 新增），CLI 无窗口分支跳过 dialog 且非零退出；`import-config.ts:41-46` readFile 失败包装 `配置文件无法读取: ${file}（${detail}）` 中文可读。e2e AC8 非零退出 + config.json 未破坏断言（cli_serve.spec.ts:230-258）在场。
- f002 已修：`docs/guides/cli-mode.md` 存在（untracked 新文件），覆盖 WSLg/无 WSLg 判别、`xvfb-run` 包一层 + `sudo apt install xvfb`、`--cli serve [--config <path>] [--port <n>]` 语法、cli.json 字段与示例；与代码 stdout 文案、`CliInstanceInfo` 字段、`--port` 优先级一致。
- f003 已修：`import-config.ts:100-111` save 失败 catch 内 `Promise.all(written_secret_keys.map(k => deps.secretsStore.delete(k).catch(()=>undefined)))` 回滚；delete 为 SecretsStore 既有方法（secrets-store.ts:25-27），scope 限本次 set 的 key；单测 `import-config.test.ts:214-230` 断言 save 抛错后 vault 无残留、deleteMock 被调。
- f004 已修：`index.ts:563-569` `await write_cli_json(...).catch(warn 降级)`，不阻断已 listen 服务（diff 553-570 注释明确 cli.json 为辅助产物）。

Round 2 无新增 finding。两条备注（非阻断）：(1) 回滚 delete 覆盖「重复导入同 plugin/param 且 save 失败」场景会把旧 vault 值一并删除，概率极低且两态皆半初始化，可接受；(2) cli-mode.md 仅泛述「Electron 需要 Linux 图形库」，未逐包枚举 libgtk/libnss3 等（spec 依赖与约束要求「文档需写明」），建议后续补 apt install 包清单，AC7 [deploy] 兜底不阻断。

verdict: PASS
