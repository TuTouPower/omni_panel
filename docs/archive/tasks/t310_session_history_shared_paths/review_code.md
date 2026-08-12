# Task review t310（reviewer_focus: 代码）

- task：`t310_session_history_shared_paths`
- spec：`docs/tasks/t310_session_history_shared_paths/spec.md`
- diff_anchor：`8793c4804c7941102ce8f4569519f781c32e2669`
- target：`git diff 8793c4804c7941102ce8f4569519f781c32e2669`
- round：1
- reviewed_at：2026-08-11 21:10 UTC+8

## Findings

### t310_code_f001 - env 重命名后旧索引死条目永不清除，索引文件单调膨胀

- 严重度：minor
- 锚点：AC-004 相邻行为（签名失效重建已实现，但 env `win`→`local` 重命名产生的永不命中 key 无清理路径）
- 位置：`src/main/core/session-history/session-locator.ts:453`（cache_key）`/ session-path-index.ts:41`（load_session_index）
- 问题：升级前持久索引含 `claude_code|win|sid` 键（旧 env 运行时值 + 旧 `win_home|wsl_distro|wsl_user` 格式 paths_key）。t310 后 env 运行时值为 `local`，`session_index_key` 变为 `claude_code|local|sid`，旧键条目既不被查询也不被 `persist_index_entry(key, null)` 删除（删除只发生在同 key 命中且 paths_key 不匹配时）→ 死条目永久留存。`SESSION_INDEX_VERSION` 保持 1，`load_session_index` 不丢弃，文件随每次跨版本升级单调累积不可达条目。功能正确（不命中即无害），无错误解析风险。
- 建议：载入时按当前 env 集合/新 paths_key 格式过滤死条目，或 bump `SESSION_INDEX_VERSION` 一次性整体丢弃重建（代价：wsl_user_cache 重探测一次）。

## 结论

- 前轮 finding 复核：Round 1 无前轮
- 本轮新发现：1 条（minor）
- 未进表的提示：
    - 文件过大（规则降级，不进表）：`session-locator.ts` 513 行（净增 +23，≥400）；`subscription-service.ts` 693 行（净增 0）；`subscription-service.test.ts` 1292 行（净增 +85，≥1200）。均未因膨胀引发可观测缺陷。
    - 复杂度：无新增 ≥15 函数；`locator_source_path` 为四分支表驱动分发（每支仅一行转发），按规则排除。
    - 范围外观察：
        - local-api `/v1/sessionHistory*` 与 IPC 的 env 参数无枚举校验，任意字符串（含旧值 `"win"`）经 `as Env` 强转后按 wsl 语义静默解析。此为预存宽松模式，仓库内调用方已全部对齐 `local|wsl`（grep 确认 src 下仅 token-stats-store 的 SQL 迁移含 `'win'` 字面量），非本 task 引入，未出 finding。
        - `locator_paths_key` 覆盖路径层全部输入（含对当前 host/env 解析无影响的字段，如 Linux 上 win*home/wsl*\*），无关配置变更会触发逐条伪失效重建。task.md 记录为有意设计（「签名覆盖路径层全部输入」），与 AC-004 语义一致，未出 finding。
        - 非 Windows 宿主 + env=wsl 时 `effective_wsl_user` 会先执行一次失败 UNC readdir 再返回 null（路径层本可仅凭 host 短路）。task.md 记录为有意设计，生产不可达（非 Windows 宿主 store 无 wsl 行），未出 finding。
    - 测试观察：session-locator.test.ts 新增「源码无 env win 残留」守卫测试（运行时读源文件断言），属测试层职责，test reviewer 判定。
- 总体判断：实现与 spec 契约区一致，AC-001~005 均有对应实现与测试，全量测试 254 passed / 1 failed（designmd drift 门禁，diff 未触及 DESIGN.md/globals.css/designmd.ts，与本 task 无关）；typecheck/lint 通过。仅有 1 条 minor，无未解决 critical/important。

### AC 复验方式

- AC-001：`re_verified` — 重跑 session-locator 测试（linux/macos host local 源 POSIX 断言、wsl 返回 null）；代码路径 `locator_source_path` → `path_layer.resolve` 的 `local_root`/`wsl_root` 分支核对。
- AC-002：`re_verified` — 纯映射断言（win32 join 输出精确字符串）在 Linux 实测通过；旧行为一致性对照旧代码 `join(win_home,...)`/`join(UNC,...)` 与 s027 spike `code/probe.mjs` 证据；Windows 真机 fs 可读性留 `[deploy]`（上下文区「有意不测」）。
- AC-003：`re_verified` — 测试 `no_user_paths`（host=windows、wsl_user 空、distro 不存在）断言 wsl 源 null、local 不受影响；代码守卫 `wsl_root` host/wsl_user 双条件核对。
- AC-004：`re_verified` — path-index 测试 host linux→macos 签名变化触发 readdir 重建（`readdir_count > 0`、新 paths_key 含 `macos|`）；`locator_paths_key` 五段签名核对。
- AC-005：`re_verified` — subscription 测试（host=linux/macos 真实 locator resolve + service.query 非空消息）重跑通过；全量套件无回归。

coverage = 5 / 5

- 系统性 follow-up：无

reviewed_scope: eb904bf6f5c4b744

verdict: PASS

## Round 2 (2026-08-11 20:45 UTC+8)

### 前轮 finding 复核（以 diff 为准）

- **t310_code_f001（minor）：已消除。** diff 实证：
    - `src/main/core/session-history/session-path-index.ts:15`：`SESSION_INDEX_VERSION` 1→2；
    - `load_session_index`（`session-path-index.ts:45`）版本不符返回空 Map——v1 索引（含旧 `claude_code|win|sid` 键 + 旧 3 段 paths_key 格式条目）整体丢弃，回退扫描重建，死条目无残留路径。该函数本次未改动，丢弃行为由 version bump 触发；
    - 新增测试「t310_code_f001：旧版本索引（含 win env 死条目）整体丢弃重建」（`session-path-index.test.ts`）：写入 version=1 假索引（含 win 键 + 旧格式 paths_key），resolve 后断言 `rebuilt.version`=2、`claude_code|win|sess_legacy` 键清除、`claude_code|local|sess_legacy` 键重建，断言直接对应 finding 描述的死条目场景；
    - 验证：session-history 套件重跑 138 passed / 1 skipped（skipped 为 Linux 下 UNC 不存在的条件跳过，预存）；typecheck 通过；lint `--max-warnings=0` 通过；ipc/local-api/main-panel 100 passed；
    - 副作用核对：v1 索引内 `wsl_user_cache` 随整体丢弃，升级后 wsl 首次 resolve 重探测一次——f001 建议原文已预见（「代价：wsl_user_cache 重探测一次」），非新问题。

### 本轮新发现

0 条（无 t310_code_f002）。

### 未进表的提示

- 文件过大（降级规则，不进表）：`session-locator.ts` 513 行（本 task 净增 +23，未再增长）；`subscription-service.test.ts` 1292 行（净增 +约 80，AC-005 两用例）。均未因膨胀引发可观测缺陷。
- 复杂度：无新增 ≥15 函数；`locator_source_path` 四分支表驱动分发（每支一行转发），按规则排除。
- 范围外观察：无新增。local-api `/v1/sessionHistory*` 与 IPC 的 env 参数无枚举校验（预存宽松模式，Round 1 已记录；仓库内调用方已全部对齐 `local|wsl`，运行时无 `"win"` 传入路径）。

### AC 复验方式（Round 2）

- AC-004（本轮重点）：`re_verified` — 重跑 session-path-index 套件，「AC-004：host 变化使 paths_key 签名变化」与「t310_code_f001：旧版本索引整体丢弃重建」均通过；五段签名（`session-locator.ts:57-61`）与版本检查（`session-path-index.ts:45`）代码核对。
- AC-001/002/003/005：Round 1 已 `re_verified`，本轮 diff 未再改动其实现与测试（相关测试仍全绿），沿用前轮结论。

coverage = 5 / 5

### 总体判断

f001 按建议方向（bump `SESSION_INDEX_VERSION` 一次性整体丢弃重建）真修，修复面仅常量 + 注释 + 测试，无新引入缺陷。无未解决 critical / important。

reviewed_scope: 0605ce8cf2272cae

verdict: PASS
