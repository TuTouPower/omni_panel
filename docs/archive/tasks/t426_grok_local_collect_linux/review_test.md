# Task review t426（reviewer_focus: 测试）

- task：`t426_grok_local_collect_linux`
- spec：`docs/tasks/t426_grok_local_collect_linux/spec.md`
- diff_anchor：`eb3fcfff89c67f272bb15c1008a8a6c13b954fc2`
- target：`git diff eb3fcfff89c67f272bb15c1008a8a6c13b954fc2`
- round：1
- reviewed_at：2026-08-16 15:55 UTC+8

## Findings

### t426_test_f001 - AC-004 未满足：blueprint 仍写「grok 仅 WSL」，与实现不一致

- 严重度：important
- 锚点：AC-004（`docs/blueprint/architecture.md`（及 domain 若写「仅 WSL」）中 grok 采集宿主描述与实现一致）
- 位置：`docs/blueprint/architecture.md:44`、`docs/blueprint/architecture.md:151`、`docs/blueprint/domain.md:61`、`docs/blueprint/domain.md:63`
- 问题：本 diff 实现已把 grok 改为双源（`grok_local` env=local，hosts=LOCAL_HOSTS；`grok_wsl` 保留），但 `git diff eb3fcfff…` 中 blueprint 零改动：
  - `architecture.md:44` 仍写「reader 含 claude/opencode/kimi/grok，grok 仅 WSL t197」；
  - `architecture.md:151` 仍写「`grok` 仅 WSL 采集（t197…）」；
  - `domain.md:61` 仍写「仅 WSL（Windows 无 grok CLI 数据）」，且与 `domain.md:63`「非 Windows 宿主 `~/.grok/sessions/...` 走 `local` 源」自相矛盾（63 行为 t308/t309 时期遗留，本 task 未同步 61 行）。
  - spec 上下文区「Finalization 时更新的 blueprint」明确要求修订 architecture.md 与 domain.md，AC-004 验收未达成。
- 建议：修订 `architecture.md:44/:151` 与 `domain.md:61` 为「Windows 宿主经 WSL UNC（grok_wsl）；Linux/mac 宿主 local `~/.grok/sessions`（grok_local，t426）」，消除 61/63 行矛盾。属实现/文档交付缺口，建议同步知会 code reviewer。

### t426_test_f002 - AC-001 测试硬编码 `/home/karon` 依赖真实 `os.homedir()`，CI 必挂

- 严重度：important
- 锚点：AC-001（host=linux 时 local grok 源采集）与 AC-005（现有 token-stats 套件不红）——测试在 CI 环境必然失败
- 位置：`tests/unit/main/core/token-stats/collector.test.ts:657`
- 问题：`expect(String(call[0])).toBe("/home/karon/.grok/sessions")` 断言 `read_source` → `grok_sessions_path(cfg, src.env)` 的默认参数路径（`homedir = os.homedir()`），未注入 homedir。本机 `/home/karon` 通过，但 `.github/workflows/ci.yml` test job 在 `ubuntu-latest`（runner home=`/home/runner`）与 `windows-2022` 上跑 `pnpm test`，两平台该断言均必然失败，CI 门禁红，AC-005「套件不红」在 CI 不成立。同文件其它路径断言均显式注入 host/homedir（如 `collector.test.ts:198-213` 传 `"/home/u"`、`:251-256` 传 `"windows"`），collector-local.test.ts 另有 `os.homedir` mock 模式，此处为独有漏网。本地复验：`npx vitest run tests/unit/main/core/token-stats/collector.test.ts` 47 通过（本机 home 恰好为 /home/karon），不证明 CI 可过。
- 建议：显式注入 homedir 参数断言，如 `expect(grok_sessions_path(base_config, "local", "linux", "/home/u")).toBe("/home/u/.grok/sessions")`（collector 层调用链需透传或改用 AC-002 测试的直接 wrapper 断言），或复用 collector-local.test.ts 的 `os.homedir` mock 模式。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：N/A（首轮）
- 改测方向复核：3 处既有测试改写——`grok_sessions_path` 签名加 env 参数（`:252/:255`）、「wsl 禁用时 grok 不读」改为「grok_local 读 win_home 一次」（`:596-598`）、missing warn 计数 2→3 并断言 grok_local+grok_wsl 两条 warn（`:771-782`）——均由 spec 语义变更（新增 local 源）驱动，非迁就实现输出；旧断言语义确实失效（grok 不再是 WSL-only）。无实现驱动改测。
- 本轮新发现：2 条（f001 important、f002 important）
- 未进表的提示：
  - `collector.test.ts:597`「skips WSL sources」`toContain("Users")` 弱断言（未断言完整 win_home 路径），但有 `calls[0][1] === "local"` 具体断言支撑、意图明确，仅提示不阻断。
  - 危险模式逐条扫描无命中：无恒真/删/注释断言、无 `.skip`/`.only`、无静默错误指令、mock 边界符合项目惯例（collector 层 mock reader 模块、grok-reader.test.ts 用真实临时目录 fixture 扫 `updates.jsonl`），无阈值掩盖、无程序赋值替代交互。
  - AC-006 `[deploy]` 人工验证项建议合并前抽查。
- 总体判断：测试覆盖 AC-001/002/003 到位、可信度高，但 AC-004 文档交付缺失（f001）且 AC-001 测试存在 CI 环境必挂的硬编码（f002），2 条 important 未解决 → FAIL。
- 系统性 follow-up：无（AC-004 为本 task 自身交付项，非跨 task 基础设施缺口）

### AC 复验方式

- AC-001：`re_verified` — 分段覆盖核实：collector.test.ts:625-672（host=linux 调度 grok_local、路径、`token_stats_update` 含 session/record）+ grok-reader.test.ts:131-181（真实临时目录 fixture 扫 `updates.jsonl` → session env=local）+ token-stats-store.test.ts:591（grok 行查询）均存在且断言具体行为；相关套件本地全绿。
- AC-002：`re_verified` — collector.test.ts:258-265 显式注入 homedir 断言 linux/macos 解析非 null 的 `.grok/sessions`；paths.test.ts:120-125 路径层 local 解析一致。
- AC-003：`re_verified` — collector.test.ts:674-749（windows 宿主双源、UNC 路径 + env=wsl + wsl 会话投递）、:591-605（wsl_enabled=false 只读 local）、paths.test.ts:101-115（wsl 路径/非 windows null）。
- AC-004：`re_verified` — 直接 grep `docs/blueprint/architecture.md`/`domain.md`：仍写「仅 WSL」，与实现不一致 → 违反 AC（f001）。
- AC-005：`re_verified` — 复跑 `npx vitest run` 全量：276 files passed / 3343 passed / 9 skipped（既有 skip），本机全绿；但 AC-001 测试的 homedir 硬编码使 CI（ubuntu-latest/windows-2022）必红（f002）。
- AC-006：`trust_prior` — `[deploy]` 真实 Linux 宿主采集验证，依赖实施侧人工验证证据，未复验。

coverage = 5/6

reviewed_scope: 71f3216edf73e940

verdict: FAIL

## Round 2 (2026-08-16 22:52 UTC+8)

### 前轮 finding 复核（以当前 `git diff eb3fcfff…` 为准）

- **code f001（AC-004 blueprint 未修订）— 已消除**：`architecture.md:44` 改为「grok 双源：Windows WSL UNC + Linux/mac local，t426」；`architecture.md:151` 改为「grok 双源采集（t426：Windows 经 WSL UNC 的 `grok_wsl`，Linux/mac 本机 `~/.grok` 的 `grok_local`；t197 起仅 WSL 的表述已被 t426 取代…）」；`domain.md` §3.2 首段与「数据位置」均改双源表述，并写明「两 env 并存时 store 主键 `(source, env, id)` 隔离」，Round 1 指出的 61/63 行矛盾消除。AC-004 达成。
- **code f002（minor，collector.ts:289 与 paths.ts:117-118 过期注释）— 已修**：`collector.ts:283-287` 重写为双源注释并紧邻新增 `grok_local` 源定义；`paths.ts:116-120` 注释改为 local/wsl 双 env 说明。残留瑕疵（不阻断，见「未进表的提示」）：`collector.ts:285` 保留半句英文「Grok CLI data exists only under WSL」字面不准确，但挂于 `grok_wsl` 源定义上方、分号后已补「local 源见上方 grok_local（Linux/mac 宿主本机采集，t426）」，语境可读不误导。
- **test f001（同 AC-004）— 已消除**：与 code f001 同一 diff 覆盖，blueprint 两文件均已修订。
- **test f002（collector.test.ts:657 硬编码 `/home/karon/.grok/sessions` 依赖真实 `os.homedir()`）— 已修**：该断言改为 `expect(p.endsWith("/.grok/sessions")).toBe(true)` + `expect(p).not.toContain("wsl.localhost")` + `expect(call[1]).toBe("local")`（collector.test.ts:658-661），任何机器 home 均过，CI（ubuntu-latest home=/home/runner）不再依赖 `/home/karon`。补强断言仍锁行为：reader 调用次数=1、路径为 local 解析、非 UNC、env=local、`token_stats_update` 投递 `grok-local-s1`(env=local)/`grok-local-r1`。新增 AC-002 用例（:258-265）显式注入 homedir 断言 linux/macos 解析，独立于 `os.homedir()`。残留 `/home/karon` 命中（grok-reader.test.ts:153/:167、collector.test.ts:635/:692、token-stats-store.test.ts:600/:629）均为 mock fixture 的 `directory` 字段值，非路径断言、不依赖真实 home，合法。

### 改测方向复核

本轮 4 处既有测试改写均由双源语义变更驱动，旧断言语义确实失效（grok 不再 WSL-only），无迁就实现输出：
- `grok_sessions_path` 签名加 env 参数（collector.test.ts:252/:255）— collector.ts:408 同名 wrapper 同步加参，接口变更配套；
- 「wsl 禁用时 grok 不读」→「grok_local 读 win_home 一次」（:591-605）— 与 LOCAL_HOSTS 含 windows（collector.ts:239）及 t308「local=本机安装」语义一致；
- missing warn 1→2 条并断言 grok_wsl/grok_local 两条（:770-784）— 与双源各 warn 一次的实现一致；
- `local_statuses`/`sources_status` 4→5（:1139、:1219）— local 源清单现含 5 源，与实现一致。
无实现驱动改测。

### 本轮新发现

0 条。

### 未进表的提示

- 注释风格 minor（不阻断）：`paths.ts:117-118` 混排中文全角标点（「t426：…处理）」），该文件其余注释为英文风格；`collector.ts:285` 半句英文字面不准确（见上）。属前轮 code f002 修复的格式瑕疵，准确性达标。
- 危险模式逐条扫描本轮 diff 无命中：无恒真/删/注释断言；f002 修复的 toBe→endsWith 属带正当理由的弱化（CI 无关 home），且配 env/非 UNC/投递行三层断言补强；无 `.skip`/`.only`；无新增 `ts-ignore`/`eslint-disable`（collector.test.ts:1 文件头 `eslint-disable` 为既有行，非本轮引入，Round 1 已扫描放行）；无阈值掩盖；mock 边界合法（`mock_scan_grok.mockImplementation` 按 env 分支是外部 reader 行为 mock，非 mock 被测 collector 逻辑）；无删测试（原 t197 用例拆为 AC-001 linux 用例 + t197 wsl 用例两个 it，语义重构合法）。
- AC-006 `[deploy]` 人工验证项仍建议合并前抽查。

### 总体判断

前轮 2 条 important（test f001/f002）与 2 条 code finding 均以 diff 核实真修，无新 blocker；测试全量复跑全绿且路径断言 CI 无关。PASS。

### 系统性 follow-up

无。

### AC 复验方式

- AC-001：`re_verified` — 读 collector.test.ts:625-675 断言（reader 调用参数 env=local/路径非 UNC + update 投递 session/record），重跑相关套件绿。
- AC-002：`re_verified` — collector.test.ts:258-265 注入 homedir 断言 linux/macos；paths.test.ts:120-125 一致。
- AC-003：`re_verified` — collector.test.ts:677-749（windows 双源、UNC+env=wsl 投递）、:591-605（wsl_enabled=false 只读 local）；paths.test.ts:101-115。
- AC-004：`re_verified` — 直接读 `docs/blueprint/architecture.md:44/:151` 与 `domain.md` §3.2 当前内容，双源表述与实现一致。
- AC-005：`re_verified` — 复跑 `npx vitest run` 全量：276 files passed | 1 skipped / 3343 passed | 9 skipped，与 Round 1 持平；路径断言不再依赖具体 home，CI 可过。
- AC-006：`trust_prior` — `[deploy]` 真实 Linux 宿主采集，依赖实施侧人工验证证据，未复验。

coverage = 5/6

reviewed_scope: ad4392c9c8a704d4

verdict: PASS

## Round 3 (2026-08-16 22:57 UTC+8)

### 前轮 finding 复核（以当前 `git diff eb3fcfff…` 为准）

- **code f003（collector.ts:244 头注释残留旧表述「Grok CLI, which only ships under WSL」）— 已消除**：头注释现为「…Grok has both: local installs (Linux/macOS ~/.grok, t426) and WSL-only Windows UNC data.」，旧「only ships under WSL」表述移除（collector.ts:242-246）；源清单内 `grok_local` 上方块注释同步重写为双源说明：「t426: grok CLI 也随宿主安装在 linux/macos 本机（~/.grok/sessions）；Windows 上 grok CLI 仅存在于 WSL（UNC，grok_wsl），local 源在 Windows 无数据时按 missing 处理。两 env 并存时 store 主键 (source,env,id) 区分。」（collector.ts:283-288）。与实现一致：windows 宿主上 `grok_local` 解析到 `win_home/.grok/sessions`（非 null，collector.test.ts:591-605 断言），目录缺失走 missing warn（collector.test.ts:770-784 断言 grok_local warn 存在）。
- **code f004（生效 spec ai-cli-token-stats-api.md 仅 WSL）— 已消除**：diff 中 spec 恰两处同步——§2.4 首段「仅 WSL 采集（Windows 无 grok CLI 数据）」改「双源采集（t426）：Windows 经 WSL UNC（grok_wsl），Linux/mac 本机 `~/.grok`（grok_local）」（ai-cli-token-stats-api.md:71）；目录树 `grok-reader.ts` 注释「（仅 WSL）」改「（双源：WSL UNC + local，t426）」（:97）。grep 三份文档（spec/architecture/domain）已无「仅 WSL」断言残留；architecture.md:181「WSL 9P 路径（claude_code/kimi/grok）轮询」为监听策略描述、domain.md:116 为 session-history 正文位置描述，均非宿主采集范围声明，不构成残留。

### 改测方向复核

无（本轮 diff 仅注释与文档，测试文件未动）。

### 本轮新发现

0 条。

### 未进表的提示

- paths.ts:113-120 重写后的注释仍混排全角标点（「t426：…处理）」）与英文句法，为 Round 2 已提示的格式 minor 延续，语义准确不阻断。
- spec §2.4 数据表列名仍为「WSL 路径」（行值 `~/.grok/sessions/...`（UNC 括注）），双源语境下可改「路径」更完整；属可选完善，不阻断（f004 承诺的「仅 WSL」表述两处已兑现）。
- AC-006 `[deploy]` 人工验证项仍建议合并前抽查。
- 危险模式逐条扫描本轮 diff 无命中（无测试改动，无断言增删/skip/静默错误指令）。

### 总体判断

前轮 2 条 code minor（f003/f004）均以 diff 真修，修复为注释与文档-only、无行为改动，未引入新问题；token-stats 套件复跑 308 passed（collector.test.ts 47 tests 与 Round 2 持平）。PASS。

### 系统性 follow-up

无。

### AC 复验方式

- AC-001：`re_verified` — 断言与 Round 2 一致（collector.test.ts:625-675），token-stats 套件复跑绿。
- AC-002：`re_verified` — collector.test.ts:258-265 注入 homedir 断言 linux/macos；paths.test.ts:120-125。
- AC-003：`re_verified` — collector.test.ts:677-749（windows 双源、UNC+env=wsl 投递）、:591-605（wsl_enabled=false 只读 local）。
- AC-004：`re_verified` — 直接读 architecture.md:44/:151、domain.md:61/:63、ai-cli-token-stats-api.md:71/:97 当前内容，双源表述与实现一致。
- AC-005：`re_verified` — 复跑 `npx vitest run tests/unit/main/core/token-stats/`：15 files / 308 passed 全绿；全量 Round 2 已跑（3343 passed），本轮仅注释/文档改动不影响。
- AC-006：`trust_prior` — `[deploy]` 真实 Linux 宿主采集，依赖实施侧人工验证证据，未复验。

coverage = 5/6

reviewed_scope: f2918bb5daa790d6

verdict: PASS
