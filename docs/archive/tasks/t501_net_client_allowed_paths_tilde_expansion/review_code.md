# Task review t501（reviewer_focus: 代码）

- task：`t501_net_client_allowed_paths_tilde_expansion`
- spec：`docs/tasks/t501_net_client_allowed_paths_tilde_expansion/spec.md`
- diff_anchor：`a7fb6079e802a301420aeef193ab18d01d5b589d`
- target：`git diff a7fb6079e802a301420aeef193ab18d01d5b589d`
- round：1
- reviewed_at：2026-09-18 04:03 UTC+8

reviewed_scope: d57cf7e967efdf75

## Findings

无 finding。本轮逐条核对 AC-001~AC-004 与九个评审维度，均未发现达到 Pre-Report Gate（可观测行为缺陷 / 安全强信号 / 契约 breaking / 范围外行为）的问题。

## 结论

- AC-001（`~` / `~/` / `~\\` 展开）：`src/main/core/connector/net-client.ts:73-78` 的 `expand_home` 补齐裸 `~`（`os.homedir()`）、`~/` 与 `~\\` 前缀，仅展开当前用户家目录，`~otheruser` 原样返回走相对路径拒绝，符合「非范围」；`canonical_path`（`:80-85`）=`normalize(resolve(expand_home(p)))` + 斜杠归一 + 去尾斜杠 + 小写，`is_within_allowed`（`:87-99`）对待检路径与白名单各 root 双边统一走该管道。满足契约。
- AC-002（`files.list` 先 resolve 且同路径）：`net-client.ts:504-511` 先 `resolve(expand_home(dir_pattern))` 得 `resolved_dir`，同一变量先后传入 `is_within_allowed` 校验与 `list_dir_recursive` 扫描，与 `files.read`（`:486-502` 先 `resolve(expand_home)` 再校验）严格对称。满足契约。
- symlink 二次校验保留：`net-client.ts:493-500` 在规范化展开后仍做 `lstat` + `realpath` 二次 `is_within_allowed`，逃逸抛 `symlink target outside allowed directories`。满足契约。
- AC-003（连接器 warn/debug、不泄露）：codex `connectors/codex/connector.ts:110-113`（quota read warn 带 `auth_path` + `String(err)`）、`:121-124`（quota parse debug）、`:251-253`（session list warn 带 `dir`）、`:263-265`（session read warn 带 `file_path`）、`:279-281`（session 行 parse debug，不打行正文）；claude `connectors/claude/connector.ts:49-55`（read warn 带 `cred_path`）、`:57-62`（parse debug）。全部只记路径 + `String(err)`，未记 `auth_content` / `raw` / Token。满足契约。
- AC-004（测试隔离与矩阵，代码侧可审部分）：实现侧为可测性把 `import { homedir }` 改为 `import * as os`（`net-client.ts:2`），生产语义不变；测试用 `vi.mock("node:os")` + `homedir_mock.dir` 指向隔离临时目录（`tests/integration/connector/net-client.test.ts:12-18`），覆盖 `~/`（`:557`）、裸 `~`（`:584`）、`~\\`（`:608`）、相对路径（`:631`）、`..` 越权（`:661`）、`~otheruser` 拒绝（`:689`）、白名单外 symlink 拒绝（`:710`）、`files.list` 同路径（`:741`）；codex/claude 测试断言 warn/debug 带路径且不含正文。旧测试仅加 `vi` import，无预期篡改。
- 不偏航 / YAGNI / 不变量：diff 仅触及 `net-client.ts` + `codex/claude connector.ts` + 三个 connector 测试 + `task.md` front matter 状态机字段（`backlog`→`active`、branch/worktree/diff_anchor 填充，工具链行为，非范围外改动）。无 Antigravity 业务逻辑改动（spec 非范围允许，共享 net-client 修复自动覆盖其 `~` 路径）；codex session 行 parse 的 debug 为契约「纯语法异常可降级 debug」内行为，非自由发挥。白名单仍默认拒绝、空 `allowed` 拒绝、`..` / symlink 逃逸拒绝，不变量守住。契约·类型·Breaking：无公开签名、配置键、schema 变更。性能：`canonical_path` 每白名单项一次 `resolve`，白名单 2~3 项可忽略，无循环 IO。架构：抽取 `canonical_path` 收敛原每次调用内建闭包，DRY 改善，无薄包装/错层。健壮性：空串 / `""` 路径仍 `resolve` 到 cwd 后拒绝，与改前一致，无新空 catch（codex/claude 原空 `catch {}` 全部具名化；`extract_email_from_jwt:65-67` 的静默 `catch→null` 为改前已存在、非 spec 列位点的非关键降级，不构成本 task 缺陷）。文档一致性：实现与 spec 契约区、注释（`t501` 标记）一致，无过期 TODO。
- 本轮新发现：0 条
- 未进表的提示：文件过大按标准只提示不进表——`src/main/core/connector/net-client.ts` 524 行（实现源码 ≥400 minor 阈值，本 task 净 +3 行：17+/14-）建议后续按需拆分；`tests/integration/connector/net-client.test.ts` 1017 行（测试 ≥600 minor 阈值，本 task 净 +258 行）为用例累积所致，可接受；`connectors/codex/connector.ts` 344 行、`connectors/claude/connector.ts` 122 行未超阈值。圈复杂度：手算 `expand_home`（~3）、`canonical_path`（1）、`is_within_allowed`（~3，1 循环 + 1 或分支 + 1 前缀或）、`files.list/read`（~2）、`collect_quota` / `collect_sessions` 新增分支各 +1，均 <10，无复杂度提示。范围外观察：无。
- 总体判断：AC-001~AC-004 实现层全覆盖，无 critical / important，仅有文件行数提示（不进表），可 PASS。
- 系统性 follow-up：无

verdict: PASS
