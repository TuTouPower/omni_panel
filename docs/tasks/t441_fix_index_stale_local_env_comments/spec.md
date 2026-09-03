# Task spec

## 背景

`src/main/index.ts` session-history locator 路径注释残留 t437 之前的 env 语义(t437 已将 env 从 `local|wsl` 改为 `win|wsl|linux|mac`),注释与代码不符,误导后续维护。来源 p205,2026-09-04 核实仍存在。

## 契约区

### 范围

- 修订 `src/main/index.ts` 中 session-history locator 路径的过期注释,使其与 t437/t438 后的 env 语义(win|wsl|linux|mac + win_home_wsl)一致。

### 非范围

- 不改任何代码逻辑、不做行为变更。
- 不触碰非本 task 指明的其它注释。

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

- [ ] AC-001：`src/main/index.ts` 中不再出现引用已废弃 env 值 `local` 的 session-history locator 路径注释;注释内容与 t437/t438 后代码(win|wsl|linux|mac + win_home_wsl)一致。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- AC-001：注释内容不可自动断言。以 `grep` 人工核验 `src/main/index.ts` 无过期 `local` env 引用 + diff 审阅确认;纯注释改动不设单测(有意不测)。

## 上下文区

- 来源：p205(2026-09-04 核实:注释仍过期,与条目描述一致)

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 纯注释修订,无生产逻辑变化,不写单测。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 按项目默认;全量 `pnpm check` + 相关测试确认无行为回归。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：极低,仅注释文本修订。
- 回退：git revert 该 commit。

### 依赖与约束

- 无。

### Finalization 时更新的 blueprint

- 无。
