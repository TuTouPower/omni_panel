# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

p049 + p051：`pnpm test` 高并行负载下，多个走真实定时器的集成/单测间歇 5s 超时或断言窗口被挤爆：refresh-service（重试循环 `retry_delay_ms=1000`、re-login `setTimeout 2000`）、grok-oauth（5000ms）、secrets-store / file-vault（20 并发写 2s 窗口）、subscription-service（30ms 轮询 + 2s wait_for）。单文件隔离全绿，证明是负载敏感而非逻辑错误。已在 t210/t211/t212 黑盒多次复现（整批失败、隔离通过），登记 p049/p051。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 下列测试文件的真实定时器用例改为不依赖真实墙钟的可靠写法（伪时钟 `vi.useFakeTimers` / 缩小时延 / 提 timeout / 消除固定 setTimeout 负向等待）：
    - `tests/integration/scheduler/refresh-service.test.ts`
    - `tests/integration/connector/grok_oauth_account_lifecycle.test.ts`（如含 5000ms 断言窗口）
    - `tests/integration/config/secrets-store.test.ts`、`tests/integration/vault/file-vault-backend.test.ts`（20 并发写 2s 窗口）
    - `tests/unit/main/core/session-history/subscription-service.test.ts`（30ms 轮询 + wait_for）
- 可选：`vitest.config.mts` 限制并行 worker 数到保守值作为系统性兜底。

### 非范围

- 生产代码逻辑（refresh-service 重试、grok oauth、vault mutex 等）——只改测试写法。
- p047 中 renderer `provider_account_row.test.tsx` 的 `setTimeout(50)`（归 t220）。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] 上述测试文件在整批 `pnpm test` 下连续 3 次全绿（无 5s 超时 / 断言窗口被挤爆）。
- [ ] 改造后单文件隔离仍全绿（未破坏被测逻辑）。
- [ ] 不再依赖 `setTimeout(50)` 等固定时长负向等待断言真实定时器行为（如有残留，须在测试策略说明理由）。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- 全部 AC 可自动测试（flaky 消除本身靠反复跑整批验证）。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 无（本 task 全部是测试代码）。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 优先伪时钟：`vi.useFakeTimers()` + `advanceTimersByTime`，被测逻辑用 `setTimeout` 的用例全部时钟推进，避免真实墙钟。
- 伪时钟不可行处（真实 better-sqlite3 并发写）：保留真实定时器但把断言窗口放宽到脚本超时内 + 明确 timeout（`it(name, fn, timeout)`）。
- 本 task 实际处置（执行期补充）：
    - refresh-service / grok-oauth：走真实 connector 子进程 + 真实 1s/2s 重试定时器。伪时钟与子进程 I/O 交错不可靠（子进程退出是真实事件，时钟推进无法加速其完成），故保留真实定时器，改用 describe 级 timeout（`describe(name, fn, 30000)`；grok-oauth 该 describe 仅单 `it`，实际落在 `it(name, fn, 30000)`，覆盖等价）应对重试用例的 2s×3 次等待 + 子进程启动开销，消除 5s 默认超时。
    - file-vault 20 并发写：真实加密+原子文件写，计时断言用真实 `Date.now()`（伪时钟下 Date.now 不推进会假绿）。断言窗口 2s → 15s，`it` 加 30000 timeout。
    - subscription-service：伪时钟可驱动 setInterval 轮询，但 Windows mtime 量化要求两次真实写之间有真实墙钟间隔（t216 已验证），且负向断言（unsubscribe 后无推送）无法用 wait_for。故保留真实定时器：`wait_for` 默认超时 2s → 10s，describe 级 timeout 30000。
    - 固定时长等待残留分两类，均在测试策略说明理由：
        - 两处负向等待（unsubscribe / unsubscribe_all 后 300ms 无推送断言）：负向断言没有 wait_for 对应物，固定时长覆盖 ≥1 个 30ms 轮询周期是唯一可靠写法；正确实现下永不假失败（仅真实 bug 时触发），150→300ms 为防御性增强。
        - 五处 80ms 基线等待（行 164/201/231/414/443，订阅后「初始无变化不推送」断言）：用途是 Windows mtime 量化下建立初始 mtime 基线 + 确认无静默首推；等待期间文件无变化不会触发推送，无假失败路径，不属 p049/p051 flaky 范畴，未改时序。
    - t220 负责 provider_account_row 的 `setTimeout(50)`（spec 非范围）。
- 验证：整批 `pnpm test` 连跑 3 次全绿 + 隔离跑全绿。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 无。

### 风险与回退

- 风险：伪时钟改造破坏「真实定时器 + 真实 sqlite」的集成真实度。
- 回退：伪时钟只用于纯时序断言；并发写/DB 用例保留真实定时器并提 timeout。

### 依赖与约束

- 依赖 t210（subscription-service 测试）、t211/t212（黑盒曾受 p049/p051 影响）。
- 无平台/安全约束。

### Finalization 时更新的 blueprint

- `docs/blueprint/testing.md`：门禁类别清单或 worktree 注意事项补充「真实定时器用例优先伪时钟」约定（如有必要）。
