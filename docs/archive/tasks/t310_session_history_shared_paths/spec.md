# Task spec

## 背景

session-history 系统（`session-locator.ts`/`subscription-service.ts`/`session-path-index.ts`）与 collector 同源路径 bug（p132 关联位点）：`win_home: homedir()` 在 Linux/WSL 返回 POSIX home 后与 `\` 字面量/UNC 拼接失效。t308 已建平台感知路径层纯函数，本 task 让 locator/subscription/path-index 共用该层，消除会话历史功能的同源缺陷。

## 契约区

### 范围

- `session-locator.ts` 的路径解析（win/wsl/local 源文件与 db 定位）改走 t308 路径层纯函数。
- `subscription-service.ts`/`session-path-index.ts` 依赖的路径构建随 locator 同步。
- `index.ts:452` 注入 locator 的 `win_home`/`wsl_*` 修正为路径层需要的 host 感知输入。
- 补 locator/subscription/path-index 的 POSIX 与三平台 host 用例。

### 非范围

- collector 源清单声明式与源级可见性（t309）。
- CLI 采集能力（另立 pending）。
- env 枚举重构与路径层本身（t308，本 task 依赖其结果）。
- 会话历史 UI 改动（仅路径解析修复）。

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

- [ ] AC-001：非 Windows 宿主下，session-locator 对本机 `local` 源返回 POSIX 路径（`~/.claude/projects`、`~/.kimi-code/sessions`、`~/.grok/sessions`、`~/.local/share/opencode/opencode.db`），不构造 UNC；`wsl` 源返回不可用。
- [ ] AC-002：Windows 宿主下，local 源基于 `win_home`、wsl 源基于 UNC 解析，解析结果与 t308 前一致。
- [ ] AC-003：`wsl_user` 探测失败（空串）时，wsl 源解析返回不可用，不生成缺用户名的 UNC 路径。
- [ ] AC-004：`session-path-index` 的 `paths_key` 签名随 host/env 路径输入变化而改变，命中旧签名时正确失效并重建索引。
- [ ] AC-005：会话历史窗口在非 Windows 宿主可读取本机会话（subscription-service 返回非空列表），不再因路径失效返回空。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

全部 AC 可自动测试。AC-001/002/003 用注入 host/`homedir`/`win_home` 的 locator 单测断言路径解析；AC-004 用 session-path-index 单测断言签名失效重建；AC-005 用 subscription-service 单测（注入 locator 与临时目录）断言本机会话可枚举。

## 上下文区

- 来源：p132（2026-08-11 核实：`session-locator.ts` 与 collector 同用 `win_home: homedir()` + UNC，机制同源）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 真实 Windows UNC `\\wsl.localhost` 可读性：仅 Windows 宿主 + 真 WSL 可验证，agent 环境不可达，标 `[deploy]` 前不自动测。
- subscription-service 的真实 fs.watch/轮询并发时序：单测注入确定性时序，真实并发留部署验证。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- locator 单测：注入 host/`homedir`/`win_home`/`wsl_*`，断言各 env 路径解析与不可用返回；复用 t308 路径层已测语义，本层只测 locator 对路径层的映射。
- session-path-index 单测：临时目录灌 fixture，断言 paths_key 签名变化触发重建。
- subscription 单测：注入 locator + 临时目录 + mock fs 事件，断言本机会话枚举。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- Windows 宿主上 `path.join`（win32）与 UNC 前缀的组合行为：已由 spike s027 实测验证——`path.win32.join` 正确处理 UNC 前缀/盘符，空用户名片段拼出缺用户名 UNC（不可用）。结论入 finding d035，与 d033/t308 一致；Windows 真机行为留 `[deploy]`。

### 风险与回退

- 风险：locator 路径解析被 subscription/path-index/ipc 多处引用，改动影响面大；paths_key 签名变化导致一次索引重建。
- 回退：路径层单测覆盖三平台，定位回归即收敛到 t308 路径层；签名重建幂等，回退重跑自动修正索引。

### 依赖与约束

- 依赖 t308 合入（路径层纯函数 + host 输入）；本 task 不触碰路径层本身，只改造 locator 调用方。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：会话历史/数据流补充 locator 共用路径层说明。
- `docs/blueprint/decisions.md`：平台感知路径决策的 locator 应用条目。
