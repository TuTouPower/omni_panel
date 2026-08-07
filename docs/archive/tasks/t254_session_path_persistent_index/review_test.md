# Task review t254（reviewer_focus: 测试）

- task：`t254_session_path_persistent_index`
- spec：`docs/tasks/t254_session_path_persistent_index/spec.md`
- diff_anchor：`6d8a32560bc52a9f980dd3f387dbde933d22d8ba`
- target：`git diff 6d8a32560bc52a9f980dd3f387dbde933d22d8ba`
- round：1
- reviewed_at：2026-08-07 21:52 UTC+8

## Findings

### t254_test_f001 - 断言弱化：损坏重建用 toBeTruthy、AC2 删除用可选链 toBeUndefined

- 严重度：minor
- 锚点：行为缺陷（无——断言在实际路径上成立）；仅断言形式可更精确
- 位置：`tests/unit/main/core/session-history/session-path-index.test.ts:99,170`（同型模式在 `:118,:123`）
- 问题：
    - 第 99 行 `expect(read_index(index_dir).entries?.["claude_code|win|sess_gone"]).toBeUndefined()`：`entries?.` 可选链 + `toBeUndefined`，若 `entries` 整体缺失会空转通过（真空真）。实际流程中 `save_session_index` 恒写 `entries: Object.fromEntries(map)`，故当前不可能空转，但断言不防御该形态。
    - 第 170 行 `expect(read_index(index_dir).entries?.["..."]).toBeTruthy()`：由前一行 `result?.file_path` 断言证明重建后定位成功，此句只补证条目已回写；若条目未回写会失败，非掩盖失败，但 `toBeTruthy` 弱于精确断言。
- 建议：先断言 `entries` 非空再取键（如 `expect(read_index(index_dir).entries?.sess_key).toBeUndefined()` 前先 `expect(entries).toBeDefined()`）；损坏重建可改断言 `entries?.[key]?.file_path` 等于扫描到的路径。

### t254_test_f002 - WSL 探测断言只证「未重读 home」，未证两次 resolve 复用同一用户值

- 严重度：minor
- 锚点：行为缺陷（无——AC4「WSL 探测一次」被直接验证）；覆盖可更广
- 位置：`tests/unit/main/core/session-history/session-path-index.test.ts:139-157`
- 问题：`wsl_home_scans === 1` 只证明第二次 resolve 未重读 `\wsl.localhost\<distro>\home`，不验证两次 resolve 实际取到同一 `effective_wsl_user` 值（若缓存被错误覆写为另一用户名，计数仍为 1）。另：无真实 WSL 的机器上 `safe_readdir(home)` 抛错被 mock 计数后返回空，计数仍为 1，测试退化为验证「优雅失败」而非「缓存命中」路径——task.md 已声明测试机有真实 WSL，故当前可接受。
- 建议：可选增强——首次 resolve 后取回结果或用注入探针断言两次 resolve 的内部 wsl_user 一致；或在无 WSL 环境下不指望该路径覆盖缓存语义。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无
- 改测方向复核：无（现有 `session-locator.test.ts` 10 tests 未在 diff 中改动，无「迁就实现」的改测）
- 本轮新发现：2 条（均 minor）
- 未进表的提示：
    - AC1 的 readdirSync 计数=0 是「不执行目录树遍历」的可靠证明：本实现唯一遍历机制为 `safe_readdir→readdirSync`，命中持久索引路径只走 `readFileSync`/`statSync`，计数 0 严格成立。
    - 跨重启模拟 `clear_resolution_cache()` 重置全部 4 个模块级缓存（memory cache / session_index / loaded_dir / wsl_user_cache），与真重启等价。
    - AC3 测的是被动回填（miss→扫描→回填），与 task.md 记录的设计取舍一致；spec 可测试性声明亦按此表述，不出 finding。
    - mock 边界合规：仅包装系统边界 `node:fs.readdirSync`（计数后委托真实现），测试 import 真实 `resolve_session_file`，未 mock 被测模块。vitest 默认文件级隔离，mock 不影响同 suite 其它文件（已实测 locator 回归 10 tests 独立通过）。
    - 已实测：新测试文件 7 passed、既有 locator 10 passed 全绿（真实 WSL 环境下 WSL 探测测试约 950ms）。
- 总体判断：测试可信、AC1-AC5 全覆盖、无危险模式；仅 2 条 minor 断言形式/覆盖建议，无未解决 blocking。
- 系统性 follow-up：无

verdict: PASS

## Round 2 (2026-08-07 22:12 UTC+8)

### 前轮 finding 复核

- **t254_test_f001（断言弱化）**：主要部分已消除。第 170 行 `toBeTruthy` 已改为具体 `file_path` 精确断言（`tests/unit/main/core/session-history/session-path-index.test.ts:170-172`）；`toBe` 对条目缺失会失败，不再空转。次要提示未采纳：第 99/118 行 `entries?.[key]).toBeUndefined()` 可选链形态仍在，当前 `save_session_index` 恒写 `entries` 字段，实际流程不会因 entries 整体缺失而空转，仍为 minor，不阻断。
- **t254_test_f002（WSL 复用语义）**：已处置（换形式覆盖）。新增「f001：WSL 探测失败不写负缓存」测试（:175-196）用 `NoSuchDistro` 两次 resolve，断言第二次 readdir 计数递增 → 空串探测结果未落缓存、下次重探测自愈，直接验证负缓存语义（对应 code f001 修复）；新增「f003：跨配置 paths_key 不匹配回退扫描」测试（:198-221）换 `win_home` 配置后断言定位到新 home 文件，验证 paths_key 隔离（回归前会命中旧条目而失败）。两者结合既有 AC4（正缓存不重探测），复用语义覆盖完整。原「两次 resolve 取同一 user 值」的直接断言仍未补，但为 minor 可选增强，不阻断。

### 改测方向复核

无。仅一处既有测试断言强化（:170 `toBeTruthy` → 精确 `toBe`），方向为收紧而非迁就实现。

### 本轮新发现

0 条。

### 未进表的提示

- 新增两测试名带 finding 前缀（`f001：`/`f003：`）指向 code-review 编号，行为描述完整，仅命名风格提示。
- 全目录跑 `tests/unit/main/core/session-history/` 时 `subscription-service.test.ts`/`watcher.test.ts` 14 例因 `better-sqlite3` 原生模块 `NODE_MODULE_VERSION 127` 不匹配失败，属环境问题，与 t254 无关；t254 相关 `session-locator.test.ts`（10）+ `session-path-index.test.ts`（9）已实测 19 passed 全绿。
- f003 测试未断言索引条目已被新 paths_key 回写（仅断言定位结果），属「可再加 case」，不阻断。

### 总体判断

Round 1 两条 minor 均已合理处置；新测试覆盖负缓存自愈与 paths_key 隔离，无危险模式、无新 blocker。

verdict: PASS
