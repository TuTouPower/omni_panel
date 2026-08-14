# Task spec

## 背景

task worktree 用 `pnpm install --frozen-lockfile` 全新安装时，electron 包缺 `node_modules/electron/path.txt`，所有 import electron 的测试文件启动即崩（`Error: ENOENT open .../node_modules/electron/path.txt`）。根因：package.json 的 `pnpm.onlyBuiltDependencies` 被 pnpm 9.15.4 忽略（每次 pnpm 命令输出 `[WARN] The "pnpm" field in package.json is no longer read by pnpm`——pnpm v10 规则只读 pnpm-workspace.yaml），electron postinstall（下载二进制写 path.txt）被跳过。同机制（onlyBuiltDependencies 被忽略）可能影响 `better-sqlite3`（native，prebuild 下载）与 `electron-winstaller`，待验证。p153 已核实（2026-08-15，pnpm 9.15.4、package.json 有 pnpm 字段、无 pnpm-workspace.yaml）。

## 契约区

### 范围

- 把 package.json 的 `pnpm` 字段（`onlyBuiltDependencies`/`overrides`/`patchedDependencies`，如有）迁移到 `pnpm-workspace.yaml`（pnpm v10 规范位置），或固定 pnpm 到仍读 package.json pnpm 字段的版本（二选一，迁移优先）。
- 迁移后全新 install 验证 electron `path.txt` 生成、better-sqlite3 等 native 依赖可用。
- 主仓与 worktree 统一受影响；迁移属仓库级配置变更。

### 非范围

- 其它环境/工具链问题
- collector/emitted/token-stats 等产品逻辑（本 task 纯配置/工具链）
- 更新 pnpm 大版本本身（仅迁移配置或降级，不动运行时）

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

- [ ] AC-001：pnpm 警告消失——`pnpm install`（或任意 pnpm 命令）不再输出 `[WARN] The "pnpm" field in package.json is no longer read by pnpm`。
- [ ] AC-002：electron postinstall 执行——全新 `pnpm install --frozen-lockfile` 后 `node_modules/electron/path.txt` 存在（对比修复前缺失），import electron 的测试不再 ENOENT。
- [ ] AC-003：native 依赖可用——全新 install 后 better-sqlite3 等 native 模块可正常加载（缺失则列入本次修复，验证其 postinstall 同样被执行）。
- [ ] AC-004：worktree 首轮测试通过——全新 worktree `pnpm install --frozen-lockfile` + `pnpm test` 的 electron 依赖测试文件（build-info-ipc/log-ipc/local-api/server/main/logging 等）不再因 ENOENT 失败。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- AC-001/AC-002/AC-003/AC-004 需真实全新安装验证（install 为外部命令，非仓库内测试）。`[deploy]` 类验收：在全新 worktree 或干净 node_modules 执行 install 验证，agent 可用 `.scratch/` 脚本复现，但最终以 worktree 实测为准。

## 上下文区

- 来源：p153（`docs/pending/todo/p153_electron_postinstall_skipped_fresh_worktree.md`；2026-08-15 核实：pnpm 9.15.4 不读 package.json pnpm 字段、无 pnpm-workspace.yaml；better-sqlite3/electron-winstaller 待确认；线索 `.scratch/electron_probe/`）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 全新安装验证（AC-001~004）为环境级行为，不写仓库内单测；用安装后冒烟（`node_modules/electron/path.txt` 存在、`npx electron --version`、`pnpm test` 关键文件）验证。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 不新增仓库内测试；验证用 install 后冒烟脚本（`.scratch/`）断言 path.txt 存在、better-sqlite3 可加载、electron 依赖测试绿。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- better-sqlite3 / electron-winstaller 是否受 onlyBuiltDependencies 忽略影响：`UNVERIFIED-SPIKE`，迁移后全新 install 实测确认（若 node-gyp 现场编译则不受影响）。

### 风险与回退

- 风险：迁移到 pnpm-workspace.yaml 后 pnpm 配置语义（overrides/patchedDependencies）若格式有差异导致依赖解析变化；固定 pnpm 版本方案与 CI/团队环境不一致。
- 回退：git 回退配置变更；迁移后对主仓 `pnpm install` 回归（主仓旧 node_modules 不受影响）。

### 依赖与约束

- 无前置依赖。实现约束：迁移后主仓与 worktree 的 pnpm 配置行为一致；不得引入依赖版本变化（frozen-lockfile 应仍通过）。

### Finalization 时更新的 blueprint

- `docs/blueprint/decisions.md`：pnpm 构建依赖配置位置（package.json pnpm 字段 vs pnpm-workspace.yaml）的长期约束，若有决策。
