# Task spec

## 背景

CI/打包 workflow 缺陷：(1) nightly.yml package job 的 windows 分支 `test -d out` 在默认 pwsh shell 下无对应语义，恒失败；(2) release.yml 上传 `artifacts/*.rpm` 但生产构建不产出 rpm，上传项恒空；(3) package-and-run.ts 的 sqlite ABI 恢复只走成功路径，构建中断后 better-sqlite3 停留在 Electron ABI。

## 契约区

### 范围

- nightly.yml windows 分支改 `shell: bash` 或 PowerShell `Test-Path out`。
- release.yml 从上传清单删除 `*.rpm`，或生产 linux target 补 rpm。
- package-and-run.ts 打包段包进 try/finally，finally 恢复 Node ABI。

### 非范围

- 不改打包配置语义。

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

- [ ] AC-001：nightly package job windows 分支不再因 `test -d out` 语法报错。
- [ ] AC-002：release 上传清单与实际产物一致（不引用不存在的 rpm）。
- [ ] AC-003：package-and-run 构建中断后 better-sqlite3 恢复到 Node ABI（finally 保证）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- AC-003 可自动测试（mock execSync 抛错断言 finally 恢复）；AC-001/002 为 CI 配置，[deploy] 推送后验证。

## 上下文区

- 来源：review_20260813_114911/review_intensive.md（`nightly.yml:60`、`release.yml:62`、`package-and-run.ts:66`）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- CI workflow 语法不在本地单测，[deploy] 验证。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- package-and-run 单测：mock 打包段抛错，断言 finally 中恢复 ABI 被调。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：改 CI 配置后未推送前无法验证。
- 回退：CI 配置小步改，推送后看 workflow 结果。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无
