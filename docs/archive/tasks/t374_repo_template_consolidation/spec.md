# Task spec

## 背景

repo_template（Python 工具链）多处重复/漂移/健壮性收敛点：(1) plan.py 链规划展示逻辑三份实现（Python + chain_plan.js + board.js）漂移；(2) parse_front_matter 三处副本；(3) tid 排序键双实现；(4) `invalid_overlapping_attempts` 无调用者恒等包装；(5) 多次全量投影 O(T×E)；(6) TERMINAL_EVENTS 含 ledger 从未写入的事件名；(7) integration strip/原子写/端口抢占/git 无超时等健壮性缺口。

## 契约区

### 范围

- 只保留 Python 权威实现，server 注入数据，JS 删除 chainStopInfo/inline fallback。
- parse_front_matter 抽公共模块；tid 排序统一；删无效函数/重复赋值。
- git 调用加 timeout；pending --write 先 dry-run 校验；view_server 端口抢占捕获重试；`_id_scan` 放宽 slug 或告警。

### 非范围

- 不改 task.py 状态机语义。

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

- [ ] AC-001：链规划展示逻辑单一来源，JS 消费注入值不再有独立副本。
- [ ] AC-002：parse_front_matter/tid 排序等重复收敛为单点，`python3 -m pytest tests/repo_template` 全绿。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：既有 pytest 回归 + 新增一致性断言。

## 上下文区

- 来源：review_20260813_114911/review_intensive.md（`plan.py:229`、`check_review_status.py:84`、`documents.py:54`、`monitoring.py:24`、`attempts.py:146`/`:79-86`、`track_worktree.py:35`、`integration.py:233`、`_id_scan.py:253`/`:196`、`view_server.py:280`/`:294`、`board.js:286`/`:289`、`pending.py:340`/`:293`、`git_ops.py:285`、`lifecycle.py:288`）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- Windows 专有 msvcrt 分支不在 Linux CI 测，注释标注平台差异。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 复用 tests/repo_template 既有 pytest，补一致性/边界用例。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：收敛 JS/Python 双实现破坏看板功能。
- 回退：先以 Python 输出为准，JS 改为纯消费注入值，看板渲染回归人工核对。

### 依赖与约束

- 依赖：t373（pytest 接入 CI）先落地则回归有保障。

### Finalization 时更新的 blueprint

- 无
