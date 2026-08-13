# Task spec

## 背景

`tests/repo_template/` 下 18 个 pytest 测试文件（task.py 工具链的回归测试，8000+ 行 Python 状态机/账本/调度）未接入任何 CI/脚本：package.json `test` 仅 `vitest run`，`pnpm check`/CI 均不触 .py；仓库无 pyproject.toml/pytest.ini。本机可跑（15 passed）但无人自动跑，工具链损坏会直接破坏开发流程。

## 契约区

### 范围

- CI 加 pytest 步骤（或 `pnpm test` 串联 `python3 -m pytest tests/repo_template`）。
- 固定 pytest 依赖声明（pyproject.toml 或 CI 直接 `pip install pytest`）。

### 非范围

- 不改 pytest 测试内容。

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

- [ ] AC-001：CI 中执行 `python3 -m pytest tests/repo_template`，工具链回归被自动跑。
- [ ] AC-002：pytest 依赖被声明，CI 环境可复现安装。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部可自动验证：CI 运行即证明（[deploy]：CI 实际跑通需推送后确认）。

## 上下文区

- 来源：review_20260813_114911/review_intensive.md（`tests/repo_template/` 18 pytest 未接入 CI）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- CI 步骤：`.github/workflows/ci.yml` 加 `python3 -m pytest tests/repo_template -q`。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：pytest 依赖在 CI runner 未预装。
- 回退：CI 显式 `pip install pytest` 或加 pyproject.toml 声明。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无
