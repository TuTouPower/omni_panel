# Task review t501（reviewer_focus: 测试）

- task：`t501_net_client_allowed_paths_tilde_expansion`
- spec：`docs/tasks/t501_net_client_allowed_paths_tilde_expansion/spec.md`
- diff_anchor：`a7fb6079e802a301420aeef193ab18d01d5b589d`
- target：`git diff a7fb6079e802a301420aeef193ab18d01d5b589d`
- round：1
- reviewed_at：2026-09-18 04:06 UTC+8

## Findings

### t501_test_f001 - 自调 warn 的假证据测试，未触达连接器生产逻辑

- 严重度：important
- 锚点：AC-003 / AC-004（连接器沙箱拒绝时 `ctx.log.warn` 触发）
- 位置：`tests/integration/connector/net-client.test.ts:773-803`，用例 `connector-style catch logs warn with path and error on sandbox rejection (t501 AC-003/004)`
- 问题：该用例的 `warn = vi.fn()` 由测试正文在 `catch` 中手动调用（`:790` `warn(...)`），再断言 `warn` 被调用（`:792`）。生产侧仅 `ctx.files.read` 的拒绝被触达，`warn` 的调用方是测试自身而非 `connectors/codex/connector.ts` / `connectors/claude/connector.ts` 的任何 `catch`。删除连接器全部 `ctx.log.warn` 后该用例仍 PASS，属平行实现冒充覆盖（测试内复制 `Codex session file read failed: ${target}: ${String(err)}` 约定）与测 mock 而非真实行为。唯一生产派生输入 `String(err)` 含 `not allowed` 已被同文件 `:661-686`（`..` 越权）直接覆盖，本用例不新增生产验证，却以 AC-003/004 名义提供假证据。本地复现：注释掉 `connectors/codex/connector.ts:110-113,251-253,263-265` 的 warn 后重跑该单测依然通过。
- 建议：最小修复为删除该用例（warn 真覆盖已由 `codex-connector.test.ts:292-357` 与 `claude-connector.test.ts:160-178` 经 `run_connector` 真实脚本提供）；若需保留 net-client 侧证据，改为仅断言 `rejects.toThrow("not allowed")` 并去掉自调 `warn` 与 AC-003/004 挂名。

### t501_test_f002 - Codex 会话行解析降级 debug 无日志断言

- 严重度：minor
- 锚点：AC-003（纯语法/数据解析异常可降级 `ctx.log.debug`）
- 位置：生产位点 `connectors/codex/connector.ts:279-281`（`Codex session line parse failed`）；测试缺口见 `tests/integration/connector/codex-connector.test.ts:128-155`（`skips malformed JSON lines and continues` 仅断言跳过与 `used`，未断言 `debug`）
- 问题：本轮新增 5 个 codex/claude 日志位点中 4 个已有 warn/debug 带路径断言（auth 读 warn、auth 解析 debug、session list warn、session 读 warn、claude 读 warn/解析 debug），唯独会话行 `JSON.parse` 失败的 `debug`（`:279-281`）无任何 `debug` 调用断言。现有畸形行用例注入含 `{bad json` 的会话内容但未注入可观测的 `warn/debug` mock 断言，无法证明降级路径带路径且不带行正文。
- 建议：扩展该畸形行用例：注入 `warn/debug = vi.fn()`，断言 `debug` 被调用、首参含文件路径（如 `rollout-x.jsonl`）与解析错误摘要、且不含畸形行正文，同时断言 `warn` 未被调用。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：本轮 Round 1，无前轮。
- 改测方向复核：无。diff 中旧测试零预期篡改：`net-client.test.ts` / `codex-connector.test.ts` / `claude-connector.test.ts` 旧 `it/describe` 块正文无 `-` 行，仅各加一行 `vi` import（`git diff` 测试侧 `-` 行仅 4 行 import），无就地改预期迁就实现、无删测、无 `.skip/.only`。新增 9+3+2 用例均为追加。
- 本轮新发现：2 条（1 important，1 minor）。
- 未进表的提示：
    - 危险模式逐条已调查放行：无恒真/删断言/注释断言/弱化（`toContain` 均为路径与错误子串精确断言，无 `toBe`→弱化）、无删测、无跳过/独占（`rg` 无 `.skip/.only`）、无静默错误（无 `eslint-disable/ts-ignore`）、无阈值掩盖（`beforeAll 60s` 为改前已存在，新增用例无自定义 timeout/重试/容差）、无程序赋值替代交互（非 UI task）、无存在即通过。`if (!create_link(...)) return` 仅见旧有 3 处（`net-client.test.ts:439,462,541`）与新增 1 处（`:719`），为 Windows 无特权时 symlink 不可用的平台条件跳过（helper 注释已声明），Linux/darwin 下真实执行（本轮三文件 66 项全绿，含该 symlink 用例通过并命中 `symlink target outside allowed directories`），不视为条件跳过弱化。
    - mock 边界正确：`vi.mock("node:os")` 仅重定向系统边界 `os.homedir`（同 `collector-local.test.ts:12-15` 既有模式；生产已由 `import { homedir }` 改为 `import * as os` 以使 mock 可达，语义不变），全程指向 `mkdtemp` 隔离目录并 `finally` 复位，不触碰真实 `~`；连接器侧 `ctx.files` fake 是沙箱宿主 IO 接缝（`run_connector` 真实脚本必经），`vi.fn()` 仅用于 `ctx.log` 可观测副作用，未 mock 自有模块/被测逻辑。生产逻辑可达：net-client 用例经 `create_connector_context` + 真实临时文件断言 `resolves.toBe` / `rejects.toThrow`；连接器用例经磁盘读真实 `connector.ts` + `manifest.json` 后 `run_connector` 断言 observations 与日志内容。
    - 覆盖确认：AC-001（`~/` 双边 `:558`、裸 `~` 白名单 `:585`、`~\\` `:608`、`~otheruser` 按相对拒绝 `:688`）具真读写证据；AC-002（`list("~/sessions")` 返回 `resolve` 绝对路径并拒绝 `~/other` 与 `~/sessions/../outside`，`:741-771`）经真实 FS 验证与 `read` 对称；AC-003 主路径（codex auth 读 warn、auth 解析 debug、session list/read warn，claude 读 warn/解析 debug 且 `not.toContain` 正文）均经 `run_connector` 覆盖；AC-004 矩阵（白名单内外、`..`、白名单外 symlink、mock 隔离、warn 触发）齐备。有意不测（远端 API、大小写边缘）未出 finding。`resolves relative paths`（`:631`）名含相对但正文仅测绝对形态，属命名冗余（首用例已覆绝对双边），未单列 finding；`not.toContain("sk-secret-payload"/"fake-token")` 在读失败用例中因无正文而恒成立，真正防泄漏证据由解析失败用例的 `not.toContain("secret-payload-xyz")` 提供，前者仅作提示。
    - 实跑证据：`npx vitest run tests/integration/connector/net-client.test.ts codex-connector.test.ts claude-connector.test.ts` → 3 文件 66 项全过（含新增 14 项）。
- 总体判断：AC 覆盖本身齐全且可信，但存在一条以自调 mock 冒充 AC 证据的假行为测试，必须删除或改写后方可 PASS。
- 系统性 follow-up：无

verdict: FAIL (Round 1)

______________________________________________________________________

## Round 2（复核 Round 1 findings）

- round：2
- reviewed_at：2026-09-17 20:10 UTC
- diff_anchor：`a7fb6079e802a301420aeef193ab18d01d5b589d`（同 Round 1，相对工作区 `git diff`）
- target：`git diff a7fb6079e802a301420aeef193ab18d01d5b589d -- tests/integration/connector/`

### 前轮 finding 复核

#### t501_test_f001（important，自调 warn 假证据）→ 已修复，关闭

- 确认 `tests/integration/connector/net-client.test.ts` 中自调 warn 用例已删除：`rg "connector-style catch|warn\(.*Codex session"` 在该文件零命中；`rg -n "warn" net-client.test.ts` 仅剩 `:177-184` 的 HTTP JSON 诊断字段断言（与沙箱 warn 无关）。
- 本轮 diff（相对同一 anchor）中 net-client 侧为 8 个 tilde 用例追加（`tilde expansion (t501 AC-001/002/004)`，`:557-772`），无 `connector-style catch logs warn` 用例残留。
- warn 真覆盖仍由连接器经 `run_connector` 提供：`codex-connector.test.ts:302-319`（auth 读 warn，断言 `~/.codex/auth.json` + `Local file path is not allowed` + `not.toContain("sk-secret-payload")`）、`:321-334`（session list warn，断言 `~/.codex/sessions`）、`:351-367`（session 读 warn，断言 `rollout-1.jsonl`）；`claude-connector.test.ts:160-178`（credentials 读 warn，`toHaveBeenCalledTimes(1)` + 路径/错误断言 + `not.toContain("fake-token")` + `debug not called`）。均读磁盘真实 `connector.ts` + `manifest.json` 后 `run_connector`，非自调 mock。

#### t501_test_f002（minor，畸形行 debug 无断言）→ 已修复，关闭

- 确认 `codex-connector.test.ts:128-165`（`skips malformed JSON lines and continues`）已按建议扩展：`:147-154` 注入 `auth.json='{"tokens":{}}'` + `warn/debug=vi.fn()` 后 `run_connector`；`:159-164` 断言 `debug toHaveBeenCalled`、首参集合含 `rollout-x.jsonl`、拼接后 `not.toContain("{bad json")`、`warn not called`；旧断言 `error toBeNull` + `used toBe(300)` 原样保留。
- auth 隔离有效：`connectors/codex/connector.ts:116-131` 中 `'{"tokens":{}}'` 解析成功但无 `access_token` 即 `return`，不触发 quota 的 `warn`（`:112`）/`debug`（`:122`）与 HTTP 路径，故 `warn not called` 可归因于会话行路径（若缺 auth，`:107-113` 的 `ENOENT→warn` 会使该断言失败，隔离必要且充分）。
- 生产位点对齐：`:279-281` 的 `Codex session line parse failed: ${file_path}: ${String(err)}` 带路径、不带行正文（`String(err)` 为 JSON 解析错误摘要，不含 `{bad json`），与测试断言方向一致。

### 改测方向复核

- 无。测试侧 `-` 行仅 5 行：2 行 `vitest` import 加 `vi`、1 行 `net-client` 的 `join`→`join, resolve`、以及畸形行用例的 `run_connector(create_ctx(...))` 4 行展开为 auth 隔离 + mock 注入形态（属 Round 1 建议的受命扩展，旧 `used/error` 预期零改动）。无就地改预期、无删测（除受命删除 f001 假证据用例）、无 `.skip/.only`、无新增 timeout/重试/容差。

### 本轮新发现

- 无新 finding（沿用 `t501_test_fNNN` 续编，本轮无需 `f003`）。

### 未进表的提示

- 危险模式已扫放行：`rg` 无 `.skip/.only`、无 `eslint-disable/ts-ignore/ts-expect-error`；无恒真/删断言；`expect(...some(...)).toBe(true)`（codex `:162,334`）为路径包含断言的布尔形态，与既有 `:244` 模式一致，不视为弱化；畸形行用例用 `toHaveBeenCalled()` 而非 `Times(1)`，弱于 claude 侧的 `Times(1)` 但结合 `used toBe(300)`（单坏行恰一次 debug）已充分，不单列 finding；`if (!create_link(...)) return` 仅 `:719` 一处，为 Windows 无特权 symlink 平台条件跳过（Linux/darwin 真执行，本轮命中 `symlink target outside allowed directories`），不视为弱化。
- mock 边界正确：`vi.mock("node:os")` 仅重定向 `homedir` 到 `mkdtemp` 隔离目录并 `finally` 复位（每用例独立 `fake_home` + `rm -rf`）；连接器侧 `ctx.log` 的 `vi.fn()` 仅观测副作用，未 mock 被测脚本。
- 覆盖确认：AC-001/002（net-client 8 用例真 FS 读写/拒绝）、AC-003（codex 4 warn/debug + 1 行级 debug、claude 读 warn/解析 debug 且 `not.toContain` 正文）、AC-004（`..`、symlink、白名单外、mock 隔离、warn 触发）齐备，无新增缺口。
- 实跑证据：`npx vitest run tests/integration/connector/net-client.test.ts codex-connector.test.ts claude-connector.test.ts` → 3 文件 65 项全过（48+9+8；66−1=65，与删除 f001 用例吻合）。

reviewed_scope: d57cf7e967efdf75

verdict: PASS
