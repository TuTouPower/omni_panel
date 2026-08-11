# Task review t310（reviewer_focus: 测试）

- task：`t310_session_history_shared_paths`
- spec：`docs/tasks/t310_session_history_shared_paths/spec.md`
- diff_anchor：`8793c4804c7941102ce8f4569519f781c32e2669`
- target：`git diff 8793c4804c7941102ce8f4569519f781c32e2669`
- round：1
- reviewed_at：2026-08-11 20:58 UTC+8

reviewed_scope: eb904bf6f5c4b744

## Findings

### t310_test_f001 - AC-004 签名失效重建只覆盖 host/homedir 变化，wsl_distro/win_home 单输入变化无直接用例

- 严重度：minor
- 锚点：AC-004（签名随 host/env 路径输入变化而改变，命中旧签名时失效重建）——机制已测，单输入覆盖可更广
- 位置：`tests/unit/main/core/session-history/session-path-index.test.ts`：「AC-004：host 变化使 paths_key 签名变化…」it 块
- 问题：`locator_paths_key` 签名含 5 个输入（host/homedir/win_home/wsl_distro/wsl_user），新增测试只直接验证 host 变化（`session-path-index.test.ts` AC-004 块）与 homedir 变化（f003 适配）触发失效重建；wsl_distro、win_home 单独变化走同一签名不匹配机制，但无单变量用例。
- 建议：可加「换 wsl_distro（host=windows、wsl 源）后旧签名条目失效、回退扫描重建」一条；属扩展建议，不阻断。

## 结论

- 前轮 finding 复核：Round 1，无
- 改测方向复核：无「迁就实现」的改测。全部既有测试改动为三类合法适配：① env 词汇重命名 `win`→`local`（与生产 `Env` 类型、t308 `TokenStatsEnv` 对齐，语义不变，如 `watcher.test.ts` pick_strategy 表、ipc/integration/local-api/history-window-controller 各文件）；② `LocatorPaths` fixture 补必填 `host`/`homedir`；③ `session-path-index.test.ts` f003 从「换 win_home」改为「换 homedir」——linux host 的 local 根是 homedir、win_home 不再驱动解析，原测试在旧语义下会因 root 不变而假过/失败，改换变量保持「配置变化 → 签名不匹配 → 回退扫描定位新文件」的原断言意图，属语义适配而非改预期。无断言被删除、反转或弱化。
- 本轮新发现：1 条（t310_test_f001，minor）
- 未进表的提示：
    - 守卫测试「session-history 源码无 env win 残留」的 regex 只匹配小写 `env` 后接 `:`/`=`/`!==` 再直接跟 `"win"`；`env: Env = "win"`（中间夹类型标注）形态不命中——与 t308 既有守卫（`paths.test.ts`「no win env literal remains」）同款同限，非本轮新增缺口；且主覆盖为行为测试，守卫仅补充。
    - AC-005 单测走「locator resolve → service.query」两步调用而非完整 IPC handler 链路（`subscription-service.test.ts` t310 套），与 spec 测试策略声明一致（subscription 单测注入 locator + 临时目录），符合预期。
    - `paths_key` 含非当前生效根（linux host 的 win_home）导致无效配置编辑触发一次幂等重建，非缺陷，与 spec「风险与回退」声明一致。
- 总体判断：AC-001/002/003/004/005 均有真实行为测试覆盖，无恒真/弱化/跳过/mock 误用等危险模式，改测方向合规，实测 7 个单元测试文件（113 passed，1 条 pre-existing 真 WSL 环境门控 skip）与 integration local-api（62 passed）全绿，typecheck/lint 通过；仅 1 条 minor 扩展建议，PASS。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified` —— 重跑 `session-locator.test.ts`（17 passed），审查「AC-001」套断言：linux/macos host 四源 local 真实 fs 解析（win_home 指向不存在目录作负对照）、断言不含 `\\wsl.localhost`、非 Windows 宿主 wsl 四源均 null。
- AC-002：`re_verified` —— 同一文件「AC-002」套纯映射断言四源 local（win_home 基）与 wsl（UNC）精确字符串；UNC join 行为由 spike s027 实测证据（`code/probe.mjs`）与 finding d035 支撑，与 t308 已测语义一致。
- AC-003：`re_verified` —— 「AC-003」套：不存在 distro + 空 wsl_user 探测失败 → 四源 wsl null、local 不受影响；探测空结果不写负缓存（t254 f001 守卫）。
- AC-004：`re_verified` —— 重跑 `session-path-index.test.ts`（15 passed，1 条 pre-existing 环境门控 skip），审查新增「AC-004」块：host linux→macos 后 `readdir_count()>0` 证明回退扫描发生、索引条目 `paths_key` 含 `macos|` 证明重建写入新签名；f003 适配后仍断言跨配置签名失效定位新文件。
- AC-005：`re_verified` —— 重跑 `subscription-service.test.ts`（31 passed），审查 t310 套：linux/macos host 经真实 locator 解析后 service.query 返回非空消息列表且首条 text 断言 `"你好"`，直击「不再因路径失效返回空」回归（旧实现 `local` env 落入 wsl 分支拼 UNC 在 Linux 失效）。

coverage = 5 / 5

verdict: PASS

## Round 2 (2026-08-11 20:45 UTC+8)

- round：2
- reviewed_at：2026-08-11 21:16 UTC+8
- diff_anchor：`8793c4804c7941102ce8f4569519f781c32e2669`（审查对象 `git diff 8793c4804c7941102ce8f4569519f781c32e2669` 相对工作区）

reviewed_scope: 0605ce8cf2272cae

### 前轮 finding 复核

- t310_test_f001（minor，paths_key 签名 wsl_distro/win_home 单变量无直接用例）：已消除。新增「t310_test_f001：wsl_distro/win_home 单变量变化改变 locator_source_path 解析结果」（`session-path-index.test.ts:309`）：host=windows 下 wsl 源 wsl_distro 22.04→24.04 与 local 源 win_home 变化，均经生产导出函数 `locator_source_path` 以精确 `toBe` 字符串全等断言（非弱化）。`wsl_user="karon"` 非空短路 `effective_wsl_user`（`session-locator.ts:239`）、local env 不触发探测，纯映射无 fs 依赖；签名重建机制已由 AC-004 host 用例与 f003 homedir 用例覆盖，本用例补足单输入变化敏感性。Linux 测试环境无法对 Windows 路径做 index 级 stat 复验，映射级断言为该 finding 可行闭环。
- t310_code_f001（minor，env 重命名后旧索引死条目单调膨胀）：已消除。`session-path-index.ts:15` `SESSION_INDEX_VERSION` 1→2，`load_session_index`/`load_wsl_user_cache` 版本不符返回空 Map/`{}`（`session-path-index.ts:45/57`），v1 索引（含 win env 死条目）整体丢弃重建。新增「t310_code_f001：旧版本索引（含 win env 死条目）整体丢弃重建」（`session-path-index.test.ts:229`）：构造 v1 索引含 `claude_code|win|sess_legacy` 死条目与旧 3 段 paths_key，resolve local key 后断言 `rebuilt.version===2`、win 键 `toBeUndefined`、local 键新签名重建。判别力：miss 路径 delete 只删查询 key，不同 key 的 win 死条目在无版本门时会残留重建索引 → `toBeUndefined()` 失败；版本未 bump 时 `version===2` 失败——测试可区分修复前后。副作用（wsl_user_cache 重探测一次）与 spec「风险与回退」一致；grep 确认无其他生产代码依赖 version=1。

### 本轮新发现

- 无（0 条）。

### 结论

- 改测方向复核：本轮仅新增两条测试（版本门重建测试、单变量映射测试），无就地修改既有断言预期；「迁就实现」改测：无。
- 实跑验证：`npx vitest run tests/unit/main/core/session-history/` → 9 文件 138 passed / 1 skipped（预存真 WSL 环境门控，同 Round 1），与 implementer 自述一致；新测试断言逐一静态核对，无恒真/弱化/跳过/mock 误用/静默错误。
- 未进表的提示：`expect(rebuilt.version).toBe(2)`（`session-path-index.test.ts:240`）硬编码当前版本号——版本门回归测试锚点，未来合法 bump 需同步更新，属预期而非缺陷；新测试沿用 t254 describe 既有 fixture/helper（make_claude_session/read_index/fs_counter），结构一致。
- 总体判断：两前轮 minor 均以 diff/代码证实真修（非采信处置表自称），修复未引入新问题；无未解决 critical/important，PASS。
- 系统性 follow-up：无

### AC 复验方式

- Round 2 diff 未触碰 AC 语义：spec.md 仅将「未知契约」条目由 `UNVERIFIED-SPIKE` 更新为 spike s027/d035 已验证结论，AC-001~005 正文不变。
- AC-001：`re_verified` —— 本轮全量重跑 `session-locator.test.ts`（17 passed，含 AC-001 套：linux/macos host 四源 local POSIX 解析、非 Windows 宿主 wsl 源 null）。
- AC-002：`re_verified` —— 本轮重跑通过；Windows 路径纯映射断言（win32 join 精确字符串）与 t310_test_f001 新增单变量用例在同一机制下实跑验证；UNC join 行为由 spike s027 实测与 finding d035 支撑，Windows 真机留 `[deploy]`（上下文区「有意不测」）。
- AC-003：`re_verified` —— 本轮重跑通过（wsl_user 空/探测失败 → 四源 wsl null、local 不受影响，不写负缓存守卫）。
- AC-004：`re_verified` —— 本轮重跑 `session-path-index.test.ts`（17 passed / 1 环境门控 skip）；AC-004 host 签名失效重建 + 新增 t310_code_f001 版本门整体重建 + t310_test_f001 单变量映射用例均独立核对断言并实测通过。
- AC-005：`re_verified` —— 本轮重跑 `subscription-service.test.ts`（31 passed），host=linux/macos 经真实 locator 解析 + service.query 非空列表断言。

coverage = 5 / 5

verdict: PASS
