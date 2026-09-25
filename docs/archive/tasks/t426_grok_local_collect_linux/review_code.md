# Task review t426（reviewer_focus: 代码）

- task：`t426_grok_local_collect_linux`
- spec：`docs/tasks/t426_grok_local_collect_linux/spec.md`
- diff_anchor：`eb3fcfff89c67f272bb15c1008a8a6c13b954fc2`
- target：`git diff eb3fcfff89c67f272bb15c1008a8a6c13b954fc2`
- round：1
- reviewed_at：2026-08-16 15:50 UTC+8

## Findings

### t426_code_f001 - AC-004 未实现：blueprint 仍宣称「grok 仅 WSL 采集」，与新增 local grok 实现不一致

- 严重度：important
- 锚点：AC-004（及范围条目「修订 blueprint/architecture 中『grok 仅 WSL 采集』表述」）
- 位置：`docs/blueprint/architecture.md:44`、`docs/blueprint/architecture.md:151`、`docs/blueprint/domain.md:61`（本 task diff 未含任何 `docs/blueprint/*` 改动）
- 问题：实现已在 Linux/mac 上采集 local grok（`src/main/core/token-stats/collector.ts:288` 新增 `grok_local`，hosts 含 linux/macos），但 blueprint 的 grok 采集宿主描述仍是 pre-task 旧文：
    - `architecture.md:44`：「grok 仅 WSL t197」
    - `architecture.md:151`：「`grok` 仅 WSL 采集（t197…）」
    - `domain.md:61`：「仅 WSL（Windows 无 grok CLI 数据）」
    - `domain.md:63` 自身矛盾：「grok 数据仅存在于 WSL」与「非 Windows 宿主 `~/.grok/sessions/...` 走 `local` 源」并存。
        `git blame` 证实上述行均为 pre-task 提交（`b7e77231` 2026-08-04、`8793c480` 2026-08-11、`1842d8e4a` 2026-08-11），本 task 未做 AC-004 要求的修订。观察到的差距：按文档维护者阅读会得出「grok 只在 Windows/WSL 采集」的结论，与当前实现（Linux/mac local 采集已生效）相反。
- 建议：修订 `architecture.md:44/:151` 与 `domain.md:61/:63` 的 grok 采集宿主表述为「Windows 经 WSL UNC（grok_wsl）；Linux/mac 上 local `~/.grok`（grok_local）」，并理顺 `domain.md:63` 的自相矛盾句式。

### t426_code_f002 - 过期注释「grok only under WSL」与新增 grok_local 矛盾

- 严重度：minor
- 锚点：文档与实现一致性（diff 相关注释）；无对应 AC
- 位置：`src/main/core/token-stats/collector.ts:289`、`src/main/core/token-stats/paths.ts:117-118`
- 问题：`collector.ts:289` 的「Grok CLI data exists only under WSL (~/.grok/sessions).」与紧邻新增的 `grok_local` 注释（:285-288「grok CLI 也随宿主安装在 linux/macos 本机」）直接冲突；`paths.ts:117-118` 的「The collector's source list only enables grok under WSL (spec §3.2)」在 grok_local 加入源清单后失实。两条注释描述的正是本 task 移除的旧行为，会让后续读者误判 grok 采集范围。
- 建议：更新两处注释，说明 grok 双源（local + wsl）及按 host/env 的解析语义；`paths.ts` 注释中的「AC-001 lists ~/.grok/sessions among the local paths」可同步为「grok_local 已启用」。

## 结论

- 前轮 finding 复核（Round 1）：无
- 本轮新发现：2 条（1 important + 1 minor）
- 未进表的提示：
    - **文件过大（降级规则，不进表）**：`tests/unit/main/core/token-stats/collector.test.ts` 1378 行（≥1200 important 阈值；本 task 净增 83 行）；`src/main/core/token-stats/collector.ts` 834 行（≥800 important 阈值；本 task 净增 5 行）。diff/说明未给出不可拆硬约束，建议后续拆分。
    - **测试可移植性（属测试层，转 test reviewer）**：`collector.test.ts:657` 断言 `String(call[0])` === `/home/testuser/.grok/sessions`，该路径由真实 `os.homedir()` 生成（collector.test.ts 未 mock homedir，`path_input` 默认 `os.homedir()`），在 home ≠ `/home/testuser` 的机器（如 GitHub Actions runner，home=/home/runner）上会失败。建议显式传第 4 参 homedir 或 mock `os.homedir`。
    - **行为观察**：Windows 宿主新增 `grok_local` 后，无 `win_home\.grok\sessions` 的机器每进程多一条「grok_local sessions dir missing」warn + `sources_status` 中 grok/local unavailable。spec 范围明示 hosts=LOCAL_HOSTS（含 windows），合规，属预期变化，仅提示。
    - **AC-001 端到端覆盖缺口（属测试层）**：collector.test.ts mock 了 `scan_grok_updates`，「真实 fixture 扫描 → store → query_sessions」未单点串联；grok-reader.test.ts 15 例覆盖 fixture 层、token-stats-store.test.ts 验证 source 过滤，建议 test reviewer 评估是否需要补链路断言。
    - **圈复杂度**：本 task 未新增分支（read_source/collect 的高分支为 pre-task 既有），无新增提示。
- 总体判断：实现主体正确（源清单声明式扩展 + env 透传，store 主键 `(id,source,env)` 天然隔离两 env，无越界改动，相关与全量单测绿），但 AC-004（blueprint 同步）未实现，存在 1 条未解决 important → FAIL。
- 系统性 follow-up：无（AC-004 属本 task 范围内处置，不单列 follow-up）。

### AC 复验方式

- AC-001：`re_verified`。代码走查 + 测试断言：`collector.ts:288` 新增 `grok_local`（hosts: LOCAL_HOSTS 含 linux/macos）；`collect.ts:585-628` host 过滤后实际 read；`collector.test.ts:625-672` 断言 linux 下 reader 被调、路径 local 解析、session/records 进入 token_stats_update。query_sessions 侧：store PK `(id,source,env)`（`token-stats-store.ts:211`）+ source 过滤为既有行为（`token-stats-store.test.ts:335`）。
- AC-002：`re_verified`。`collector.test.ts:258-265` 断言 linux→`/home/u/.grok/sessions`、macos→`/Users/u/.grok/sessions`，非 UNC；`collector.ts:488` 按 `src.env` 传 env。
- AC-003：`re_verified`。`collector.test.ts:251-256`（wsl env：windows→UNC 路径、linux→null，t197 契约不回归）；`collector.test.ts:674-749`（windows 宿主下 grok_wsl 仍参与、路径含 `wsl.localhost`、wsl 行数据进 update）；相关套件全绿。
- AC-004：`re_verified`（结论：未满足 → t426_code_f001）。`git diff` 不含任何 `docs/blueprint/*`；`architecture.md:44/:151`、`domain.md:61` 仍「仅 WSL」，blame 证实为 pre-task 旧文。
- AC-005：`re_verified`。重跑 `npx vitest run`：276 文件 / 3343 passed / 9 skipped（token-stats 五文件 86 例全过）；`npx tsc --noEmit` 0 error；`npx eslint` 变更文件 0 error。
- AC-006：`trust_prior`。`[deploy]`，无真实 Linux 宿主 OmniPanel 运行实例可验；依赖实施侧 handoff.json `ac_evidence` 与人工验收记录。

coverage = 5 / 6

reviewed_scope: 71f3216edf73e940

verdict: FAIL

## Round 2 (2026-08-16 22:55 UTC+8)

### 前轮 finding 复核（以当前 diff 为准）

- **t426_code_f001（important，AC-004）→ 已消除**。`docs/blueprint/architecture.md:44` reader 行改「grok 双源：Windows WSL UNC + Linux/mac local，t426」；`architecture.md:151` 改「grok 双源采集（t426：Windows 经 WSL UNC 的 grok_wsl，Linux/mac 本机 ~/.grok 的 grok_local；t197 起仅 WSL 的表述已被 t426 取代）」；`domain.md:61` 改「双源采集（t426）：Windows 宿主经 WSL UNC 读 grok_wsl；Linux/mac 宿主读本机 ~/.grok 的 grok_local」；`domain.md:63` 的「仅存在于 WSL」矛盾句式改为「数据两处存在：WSL（UNC…）与 Linux/mac 本机（env='local'…）」，并补 store 主键 `(source,env,id)` 隔离说明，与实现（`token-stats-store.ts` PK `(id,source,env)`）一致。全仓 grep `仅 WSL|only under WSL`：`docs/blueprint/` 无残留。
- **t426_code_f002（minor，过期注释）→ 已消除**。`collector.ts:285-290` 原「Grok CLI data exists only under WSL」替换为 t426 双源注释（grok_local 定义在上、grok_wsl 注释明确「local 源见上方 grok_local」）；`paths.ts:114-119` 注释改「Resolves both envs: local = 本机 ~/.grok（t426…）/ wsl = Windows 宿主经 UNC（grok_wsl）」，原「only enables grok under WSL (spec §3.2)」与「AC-001 lists …」两句均已移除。
- **t426_test_f001（important，AC-004）→ 已消除**。同 f001 文档修订（test reviewer 报告与代码 review 锚同一处 bluep 文档）。
- **t426_test_f002（important，collector.test.ts 硬编码 /home/testuser）→ 已消除**。`collector.test.ts:656-659` 改为 `p.endsWith("/.grok/sessions")`（相对 `os.homedir()`）+ `p.not.toContain("wsl.localhost")`，不再硬编码具体 home；新增 `:258-262` 显式传 homedir 的 `grok_sessions_path(base_config,"local","linux","/home/u")` 精确断言。重跑 `npx vitest run` collector.test.ts + paths.test.ts：58 passed / 0 failed（含 47 例 collector）。

### 本轮新发现

### t426_code_f003 - collector.ts 源清单注释仍宣称「Grok CLI only ships under WSL」，与 grok_local 矛盾

- 严重度：minor
- 锚点：文档与实现一致性（diff 新增 grok_local 源直接改变注释所描述行为）；无对应 AC
- 位置：`src/main/core/token-stats/collector.ts:244`
- 问题：源清单头注释（t309 遗留，非本轮 diff 行）仍写「WSL data (including Grok CLI, which only ships under WSL) is a Windows-only UNC share.」。该句与同文件 :285-288 新增的「grok CLI 也随宿主安装在 linux/macos 本机（~/.grok/sessions）」直接矛盾，也与实现（`grok_local` 源 hosts=LOCAL_HOSTS 含 linux/macos）冲突。f002 修复了 :289 与 paths.ts 两处，此处为同文件同类过期表述的遗漏位点，后续读者扫源清单头注释仍会得出「Grok CLI 只在 WSL」的结论。
- 建议：将「including Grok CLI, which only ships under WSL」改为「including grok_wsl（Windows 经 UNC；Linux/mac 走 grok_local，见下）」或删除该限定语。

### t426_code_f004 - 生效 spec docs/specs/ai-cli-token-stats-api.md 仍写「仅 WSL 采集」，与实现不一致

- 严重度：minor
- 锚点：文档与规格一致性（diff 相关）；AC-004 字面仅覆盖 `docs/blueprint/*`，本条不违反 AC
- 位置：`docs/specs/ai-cli-token-stats-api.md:71`、`docs/specs/ai-cli-token-stats-api.md:97`
- 问题：该 spec 在 `docs/specs_index.md:21` 生效清单内（t037/t197/t308/t309 累积），`§2.4 Grok Build` 仍写「仅 WSL 采集（Windows 无 grok CLI 数据）」、模块结构图写「grok-reader.ts # Grok updates.jsonl 读取（仅 WSL）」，与 t426 后 Linux/mac local 采集实现不符（spec 过时，处置为改 spec，不计 FAIL）。Round 1 仅扫 blueprint 未覆盖 docs/specs，本轮补扫发现。
- 建议：task 收尾按「docs/specs 累积更新」流程同步 §2.4 为双源表述（Windows 经 WSL UNC + Linux/mac local ~/.grok），并更新模块图注释。

### 结论（Round 2）

- 前轮 finding 复核：code f001 / code f002 / test f001 / test f002 四条全部按 diff 核实已消除，无「修不彻底」项（f003/f004 为本轮新扫出的同类/相邻位点，非前轮未修完）。
- 本轮新发现：2 条（均 minor）。
- 未进表的提示：
    - **文件过大（降级规则，不进表）**：`tests/unit/main/core/token-stats/collector.test.ts` 1381 行（≥1200，本 task 净增 176 行）；`src/main/core/token-stats/collector.ts` 835 行（≥800，净增 5 行）。同 Round 1，建议后续拆分。
    - **行为观察**：Windows 宿主每轮多一条「grok_local sessions dir missing」warn（collector.ts:496-504 按 src.key 生成、warn_source 去重），与 Round 1 观察一致，属 spec 范围（hosts=LOCAL_HOSTS 含 windows）预期变化。
    - **测试可移植性**：`collector.test.ts:597` 新增断言 `toContain("Users")` 依赖 `base_config.win_home="C:\\Users\\Test"`（windows host 下 path_input 用 win_home 非 os.homedir()），CI 上无 home 依赖，已核实非硬编码问题。
    - **圈复杂度**：本 task 未新增分支，无提示。
- 总体判断：前轮 2 条 blocking（code f001 与 test f001 同锚 AC-004 文档修订，f002 硬编码）均已消除，本轮仅 2 条 minor，无未解决 critical / important → PASS。
- 系统性 follow-up：无。

### AC 复验方式（Round 2）

- AC-004：`re_verified`。逐行核读 `architecture.md:44/:151`、`domain.md:61/:63` 修订文本与实现（collector.ts:288 grok_local hosts=LOCAL_HOSTS）一致；全仓 grep 确认 blueprint 无「仅 WSL」残留。
- AC-001/002/003：`re_verified`。实现未变（仅 grok_sessions_path 签名 `(cfg, env, host, homedir)` 透传 env，调用点 collector.ts:489 同步）；重跑 collector.test.ts + paths.test.ts 58 passed，覆盖 source 清单（linux 含 grok_local）、path(local) 非 null、wsl UNC 不回归。
- AC-005：`re_verified`。`npx vitest run tests/unit/main/core/token-stats/collector.test.ts tests/unit/main/core/token-stats/paths.test.ts`：2 files / 58 passed。token-stats 全量五文件与全仓套件沿用 Round 1 证据（修复未触及 store/reader/manager）。
- AC-006：`trust_prior`。`[deploy]`，依赖实施侧 handoff.json `ac_evidence` 与人工验收记录。

coverage = 5 / 6

reviewed_scope: ad4392c9c8a704d4

verdict: PASS

## Round 3 (2026-08-16 16:40 UTC+8)

### 前轮 finding 复核（以当前 diff 为准）

- **t426_code_f003（minor，collector.ts 源清单头注释）→ 已消除**。`collector.ts:244-245` 现写「WSL data is a Windows-only UNC share. Grok has both: local installs (Linux/macOS ~/.grok, t426) and WSL-only Windows UNC data.」，与实现（`grok_local` hosts=LOCAL_HOSTS 含 linux/macos；`grok_wsl` hosts=WSL_HOSTS）一致，原「including Grok CLI, which only ships under WSL」限定语已移除。grep 全仓 `only ships under WSL` 无残留。
- **t426_code_f004（minor，生效 spec ai-cli-token-stats-api.md）→ 已消除**。`docs/specs/ai-cli-token-stats-api.md:71` §2.4 首段改「双源采集（t426）：Windows 经 WSL UNC（grok_wsl），Linux/mac 本机 `~/.grok`（grok_local）」；`:97` 模块结构图改「Grok updates.jsonl 读取（双源：WSL UNC + local，t426）」。grep 该文件无其它「仅 WSL」残留；§2.4 数据表（WSL 路径列）与事件口径段落与双源表述兼容。该 spec 在 `docs/specs_index.md` 生效清单内，处置为同步 spec，正确。

### 本轮新发现

无（0 条）。

### 结论（Round 3）

- 前轮 finding 复核：f003、f004 两条均按当前 diff 核实已消除，无「修不彻底」项。
- 本轮新发现：0 条。
- 未进表的提示：
    - **文件过大（降级规则，不进表）**：`tests/unit/main/core/token-stats/collector.test.ts` 1381 行（≥1200）、`src/main/core/token-stats/collector.ts` 835 行（≥800），同 Round 1/2，建议后续拆分。
    - **注释残留观察**：`collector.ts:289` 英文半句「Grok CLI data exists only under WSL」保留，但挂 `grok_wsl` 条目、后接「local 源见上方 grok_local（Linux/mac 宿主本机采集，t426）」，语境可读不误导（Round 2 已确认形态，非本轮新增）。
    - **修复面完整性**：`grok_sessions_path` 签名 `(cfg, env, host, homedir)` 改动后 grep 确认调用点仅 `collector.ts:489`（传 `src.env`）与测试 import；`session-locator.ts:231` 走 `paths.ts` 层签名未受影响；`npx tsc --noEmit` 0 error 佐证无遗漏调用点。
    - **测试语义保留**：t197 原「reads the grok source only under WSL」用例改写为「reads the grok wsl source under WSL」，原断言（UNC 路径、`env="wsl"`、sessions/daily/records 进 update）完整保留于按 env 分发的 mock 分支，非弱化/恒真；warn 用例 1→2 次（grok_local + grok_wsl 各一）与实现一致。
- 总体判断：前轮 2 条 minor 均已按 diff 消除，修复未引入新问题（token-stats 全量 308 例绿、tsc/eslint 干净），无未解决 critical / important → PASS。
- 系统性 follow-up：无。

### AC 复验方式（Round 3）

- AC-001/002/003：`re_verified`。实现未变（仅 `grok_sessions_path` 透传 env）；重跑 `collector.test.ts` + `paths.test.ts` 58 passed，覆盖 linux local 路径断言（AC-002）、source 清单含 grok_local（AC-001）、wsl UNC 不回归（AC-003）。
- AC-004：`re_verified`。逐行核读 `architecture.md:44/:151`、`domain.md:61-63`、`ai-cli-token-stats-api.md:71/:97` 双源表述与实现一致；grep `docs/blueprint/` 与 `docs/specs/` 无「仅 WSL」残留（仅 task 工作区与 archive 历史文本引用旧表述）。
- AC-005：`re_verified`。`npx vitest run tests/unit/main/core/token-stats/`：15 files / 308 passed；`npx tsc --noEmit` 0 error；`npx eslint` 变更文件 0 error。
- AC-006：`trust_prior`。`[deploy]`，依赖实施侧 handoff.json `ac_evidence` 与人工验收记录。

coverage = 5 / 6

reviewed_scope: f2918bb5daa790d6

verdict: PASS
