# Task spec

## 背景

t440 修复了 background serve 单实例锁冲突 code0 静默早退被误判空等 15s 超时的问题,判定逻辑由单测覆盖(classify_poll_result/build_early_exit_msg)。但「先起健康实例占锁再后台 serve → 父进程秒级失败 + stderr 锁冲突诊断」的**进程级端到端行为**无自动测试。t440 实施期确认 electron dev spawn 形态 `--user-data-dir` 被 electron 消费、不达 app argv(d050),无法用 dev electron 复现;打包产物 argv 直通,是唯一可端到端验证的形态。来源 p210(2026-09-04 t440 review follow-up 登记)。

## 契约区

### 范围

- 新增打包形态 e2e:用 `artifacts/{platform}-unpacked/omni_panel` 真实二进制,复现后台 serve 单实例锁冲突,断言父进程秒级失败 + 非 0 退出 + stderr 锁冲突诊断,而非「等待 serve 启动超时」。
- 复用 `tests/e2e/packaged/smoke.spec.ts` 的 spawn 二进制 + 临时 user-data-dir 模式。

### 非范围

- 不改生产代码(`src/main/cli/background_serve.ts` 判定逻辑 t440 已定,本 task 只补测试)。
- 不覆盖 GUI/托盘/多窗口行为。
- 不改 electron dev 形态的测试方式(已知受 d050 限制)。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `.repo_template/docs/usage.md`「命名与格式」。

<!-- /规范 -->

- [ ] AC-001：新增打包形态 e2e 用例「后台 serve 撞已运行实例锁」——先以打包二进制 `serve --foreground` 起健康实例(临时 user-data-dir + 空闲端口),再以同 user-data-dir 执行后台 `serve`(spawn 打包二进制,无 --foreground),父进程在数秒内以非 0 码退出。
- [ ] AC-002：AC-001 场景中,后台 serve 的父进程 stderr 输出含锁冲突诊断(如「单实例锁冲突」/「另一实例正在启动或关闭」或 probe 的「实例已在运行」),不含「等待 serve 启动超时」;且未等满 15s。
- [ ] AC-003：测试经 `pnpm test:e2e:packaged`(或既有 packaged project 运行命令)可在打包产物存在时跑通;产物缺失时 skip(与 smoke.spec.ts 的 `skipIfNoExe` 一致)。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试(packaged project e2e,需先构建打包产物)。

## 上下文区

- 来源：p210(2026-09-04 登记,核实现状:进程级 serve 锁冲突 e2e 仍缺);t440 修复代码已在 main

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- electron dev 形态的进程级 serve 锁冲突:受 d050(electron dev --user-data-dir 透传缺陷)限制无法隔离复现,不作测试目标。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 复用 packaged project 基建:`tests/e2e/packaged/` 定位 `artifacts/{platform}-unpacked/omni_panel`,spawn 时传临时 `--user-data-dir`(打包形态 argv 直通)与固定空闲端口。
- 起健康实例:`serve --foreground` spawn,轮询 `/v1/health` 确认就绪(参照 cli_serve.spec.ts 模式)。
- 后台 serve 冲突:再 spawn 同 user-data-dir 的 `serve`(无 --foreground),收集 stderr,断言退出码非 0 + 诊断文案 + 耗时 < 若干秒。
- teardown:回收健康实例进程树(参照 t288 `reap_user_data_dir_processes` 按 user-data-dir 唯一定位),避免孤儿跨 run。
- 断言文案用 scrubber 脱敏(与 smoke.spec.ts 一致)。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无。打包形态 user-data-dir 直通已由 d050 实证。

### 风险与回退

- 风险：e2e 需先构建打包产物(electron-builder --dir),CI/本机未构建则 skip(skipIfNoExe 机制);端口/临时目录冲突由 teardown 回收规避。
- 回退：删除新增 spec 文件即可;不改生产代码。

### 依赖与约束

- 前置:打包产物 `artifacts/{platform}-unpacked/omni_panel`(含 t440 修复)存在。
- 平台:Linux(WSL)实跑;win32/darwin 路径沿用 EXE_BY_PLATFORM,机制同源。

### Finalization 时更新的 blueprint

- `docs/blueprint/testing.md`：如新增 packaged 用例改变 e2e 运行说明,按需更新;默认「无」。
