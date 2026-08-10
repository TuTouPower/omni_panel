# Task spec

## 背景

`tests/e2e/electron/cli_control.spec.ts` AC3 restart 用例通过 CLI restart 端点触发实例 `app.relaunch()`，新进程脱离 playwright `ElectronApplication` 句柄；用例 `finally` 只 `closeServe` 原始句柄，relaunch 新进程（连同 zygote/gpu/utility 子进程）成为孤儿持续监听 18811 端口，跨 run 堆积致后续用例 EADDRINUSE / waitHealth 偶发失败。2026-08-10 主仓已复现（见来源）。

## 契约区

### 范围

- `tests/e2e/electron/cli_control.spec.ts` AC3 restart 用例（及该文件共用 helper 如 `closeServe`/`launchServe`）的 teardown 加固：回收 restart 产生的 relaunch 新进程。

### 非范围

- 不改产品 `restart` 端点 / `src/main/index.ts` 的 `app.relaunch()` 实现（产品行为正确，问题在测试回收）。
- 不处理其它测试文件/端口的进程泄漏。
- 不改 CLI 服务端超时、端口选择逻辑。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。

<!-- /规范 -->

- [ ] AC-001：restart 用例（AC3）执行通过后，测试 teardown 结束返回时 18811 端口无任何监听（`ss -tlnp` / `lsof` 可查）。
- [ ] AC-002：restart 用例（AC3）执行通过后，relaunch 产生的 electron 进程（`cli.json` 新 pid 及其子进程）全部退出，无孤儿残留（`pgrep` 可查）。
- [ ] AC-003：连续 3 轮串行运行完整 `tests/e2e/electron/cli_control.spec.ts`（8 用例），全部通过且无 EADDRINUSE / waitHealth 超时。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：AC-001/002 在 playwright teardown 后以 shell 断言端口与进程；AC-003 为多轮串行运行回归。

## 上下文区

- 来源：t288

- 来源：p095（2026-08-10 主仓复现：restart 用例通过后 relaunch 新进程监听 `0.0.0.0:18811` 连同子进程残留，`finally` 只关原句柄）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- teardown 通过 `waitCliJson(userDataDir)` 读取 restart 后 `cli.json` 中的新 pid，`process.kill(pid)` 并等待退出（超时 SIGKILL），连带清理子进程组；或等价手段确保进程与端口释放。
- 不改动 AC3 的断言语义（pid 变化 + 新端口 health 可达）与已有 8 用例的验证路径。
- 运行前置：`pnpm build` 出 `out/main/index.js`、`node scripts/ensure_sqlite_abi.mjs electron`；无显示环境用 `xvfb-run` 包一层。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无（relaunch 进程脱离句柄、端口占用机制已于复现时核实）

### 风险与回退

- 风险：teardown kill 时序与「restart 生效」断言（pid 变化等待）竞争，可能误杀正在验证的进程；kill 等待超时兜底不足则残留依旧。
- 回退：AC3 断言仍以 `cli.json` pid 变化 + health 为准；teardown 失败仅记录不阻塞测试结论；回归失败恢复 `git` 该文件改动。

### 依赖与约束

- 前置：`docs/blueprint/testing.md` 中 CLI 控制验证的运行前置（build + electron ABI）。
- 约束：仅改测试文件，不触生产代码；端口 18811 语义（cli.json 反映真实端口）保持。

### Finalization 时更新的 blueprint

- `docs/blueprint/testing.md`：「CLI 控制子命令验证（t276）」小节当前注明「见 p095」，闭环后删除该引用。
