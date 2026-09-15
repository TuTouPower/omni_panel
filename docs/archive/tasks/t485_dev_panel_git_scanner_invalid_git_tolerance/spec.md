# Task spec

## 背景

开发面板在扫描全局 git 仓库时，遇到 0 字节伪 `.git` 文件（如 uv 缓存目录 `uv_cache/sdists-v9/.git`）或跨系统备份中的损坏 worktree 软链（如 Windows 盘符路径 `D:/...`）时，`git rev-parse --git-common-dir` 抛出 `fatal: invalid gitfile format` 或 `fatal: not a git repository`。扫描器将这些错误作为致命扫描异常存入 `errors` 数组，导致前端开发面板直接弹出「部分目录未能读取」的警告弹框。此外，`SKIP_DIRECTORIES` 缺少 `.scratch`、`.claude`、`uv_cache` 等临时与工具链缓存目录。

## 契约区

### 范围

- 在 `src/main/core/dev-panel/git-scanner.ts` 的 `SKIP_DIRECTORIES` 中补充 `.scratch`、`.claude`、`uv_cache`、`.cache`、`.turbo`、`.next` 等目录。
- 在 `discover_repositories` 与 `scan_git_roots` 中增加对 `.git` 条目的有效性校验与容错：
    - 遇到 0 字节空 `.git` 文件或格式非法的伪 gitfile，静默跳过，不视作 git 仓库。
    - 遇到 worktree 指向的宿主路径不存在或跨机断链时，静默跳过，不作为致命扫描错误存入 `errors`。
    - 仅在用户显式配置的根目录完全无法访问等真正致命异常时才写入 `errors`。
- 在 `tests/unit/main/dev-panel-git-scanner.test.ts` 中增加针对 0 字节 `.git`、跨机无效 worktree、临时目录忽略的单元测试。

### 非范围

- 不修改开发面板前端展示逻辑（`DevPanelView.tsx` 保持对真正 `errors` 的提示能力）。
- 不更改正常合法 git 仓库的 commit 历史解析与热力图聚合口径。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：当扫描根目录下的子目录包含 0 字节的 `.git` 空文件时，`scan_git_roots` 静默跳过该目录，结果中不将其计为仓库，且 `errors` 不包含 `invalid gitfile format` 错误。
- [ ] AC-002：当扫描根目录下的子目录包含指向不存在路径（如跨机绝对路径）的 `.git` 损坏 worktree 文件时，`scan_git_roots` 静默跳过该目录，且 `errors` 不包含 `not a git repository` 错误。
- [ ] AC-003：位于 `SKIP_DIRECTORIES`（含 `.scratch`、`.claude`、`uv_cache`）内的目录及其子目录被扫描器忽略，不进入仓库扫描流程。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

全部 AC 可自动测试。

## 上下文区

- 来源：`p229`（2026-09-15 核实，通过 `.scratch/reproduce_git_scanner.ts` 精确复现该错误）

### 有意不测

无

### 测试策略

- 在 `tests/unit/main/dev-panel-git-scanner.test.ts` 中通过临时目录构造 0 字节 `.git` 文件与损坏 worktree 指针文件，调用真实 `scan_git_roots` 断言 `repositories` 与 `errors`。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

无

### 风险与回退

- 风险：若过度忽略错误可能漏报真正合法仓库的读取权限错误。
- 回退：严格限定只对 `git rev-parse` 确认非仓库的伪 `.git` 与断链 worktree 进行静默降级，真正的根目录 I/O 错误继续报错。

### 依赖与约束

无

### Finalization 时更新的 blueprint

- 无
