# Task review t254（reviewer_focus: 代码）

- task：`t254_session_path_persistent_index`
- spec：`docs/tasks/t254_session_path_persistent_index/spec.md`
- diff_anchor：`6d8a32560bc52a9f980dd3f387dbde933d22d8ba`
- target：`git diff 6d8a32560bc52a9f980dd3f387dbde933d22d8ba`
- round：1
- reviewed_at：2026-08-07 20:30 UTC+8

## Findings

### t254_code_f001 - 首次 WSL 探测失败的结果被永久缓存为 `""`，整进程 WSL 会话失效

- 严重度：important
- 锚点：AC5（功能回归）——WSL 会话打开/查询在启动早于 WSL 就绪时整进程失败，且不再随 WSL 就绪恢复
- 位置：`src/main/core/session-history/session-locator.ts:206-213`
- 问题：`effective_wsl_user` 把探测结果无条件写入进程内缓存 `wsl_user_cache[paths.wsl_distro] = user`（含 `user === ""`），后续 `cached !== undefined` 即返回缓存值（含空串）。磁盘持久化虽有 `user !== ""` 守卫，但进程内负缓存无守卫。失败场景：应用随 Windows 登录自启、WSL 尚未挂载时首次探测（`safe_readdir(home)` 返回 `[]` → `user=""`），该进程内所有 WSL 会话后续 resolve 全部命中缓存 `""` → `wsl_home` 返回 null → SESSION_NOT_FOUND。t254 前无缓存，每次 resolve 重探测，WSL 就绪后即恢复；t254 后整进程不再恢复，直到重启。
- 建议：只缓存非空探测结果；`user === ""` 时不写缓存（下次 resolve 重探测，探测本身是廉价 readdir，失败时 `safe_readdir` 已兜底）。

### t254_code_f002 - 每次 miss 回填都全量同步重写索引文件，首开批量 O(N²) 磁盘 I/O

- 严重度：minor
- 锚点：性能隐患（review 重点项）
- 位置：`src/main/core/session-history/session-locator.ts:319-333`、`403`、`406`
- 问题：`persist_index_entry` 每次 miss 都调用 `save_session_index`——对全量 `entries` 做 `Object.fromEntries` + `JSON.stringify` + `writeFileSync(tmp)` + `renameSync`，且同步在调用线程（主进程）。首次打开面板批量 resolve 可见会话（约 50 个）且索引冷时，每个 miss 一次全量写，索引增长到 N 条时为 O(N²) 序列化 + 同步写。活跃会话（mtime 高频变化）每次打开也会 miss → 全目录扫描 + 全量索引写。steady-state 下该写盘在首开/活跃会话路径上叠加同步 I/O，与 task 消除首开延迟的目标相悖。
- 建议：合并落盘——resolve 批内延迟写（同一事件循环/宏任务仅写一次），或对增量改动做 debounce；可接受容忍索引落后若干次 resolve，miss 自愈保证一致。

### t254_code_f003 - 磁盘索引 key 不含 paths_key，与内存缓存的 paths 隔离不一致

- 严重度：minor
- 锚点：行为缺陷——配置变更跨重启后可能命中旧 paths 的陈旧条目
- 位置：`src/main/core/session-history/session-locator.ts:348-376` vs `354`（内存 cache 校验 paths_key）
- 问题：内存缓存按 `cache_key` 索引并校验 `paths_key`，不匹配即弃；磁盘索引仅按 `source|env|session_id` 存读，无 paths 维度。应用重启前用户改了 `wslDistro`/`wslUser`/`win_home` 配置，重启后同一 `cache_key` 命中旧配置路径的条目：若旧路径仍存在且 mtime/size 恰好一致则返回错误路径；一般情况 stat 失败 → 回退扫描 → 自愈。自愈覆盖多数场景，但「跨配置命中旧路径」属隔离缺陷。
- 建议：持久 key 加入 paths 签名，或在条目内存 `paths_key` 并在命中时校验，不一致视为失效回退扫描。

### t254_code_f004 - win-only resolve 的重写会静默丢弃已持久化的 wsl_user_cache

- 严重度：minor
- 锚点：行为缺陷——跨重启 WSL 探测缓存被非 WSL 路径意外清空
- 位置：`src/main/core/session-history/session-locator.ts:332`、`217`；`session-path-index.ts:68-72`
- 问题：`save_session_index(..., wsl_user_cache ?? undefined)` 在 `wsl_user_cache` 全局为 null（本进程尚未触发 WSL 探测，例如只 resolve 了 win 会话）时省略该字段。若磁盘索引先前已持久化 WSL 探测结果，任意一次 win 会话 miss 触发重写即把它从文件里抹掉，下次重启 WSL 需重新探测。属于跨重启缓存失效（性能退化），非正确性。
- 建议：载入索引时随 `ensure_session_index` 一并初始化 `wsl_user_cache`（与磁盘态合并），保存时始终带缓存字段。

### t254_code_f005 - 索引写错误未防护，可令原本只读的 resolve_session_file 抛异常

- 严重度：minor
- 锚点：异常路径——`mkdirSync`/`writeFileSync`/`renameSync` 失败会穿透 4 处 IPC handler
- 位置：`session-path-index.ts:60-75`、`session-locator.ts:332`、`403`、`406`
- 问题：t254 前 `resolve_session_file` 的 fs 访问全部 `safe_*` 包裹、不抛错；t254 后新增的落盘路径无 try/catch（读路径 `load_session_index` 已兜底，写路径未兜底）。磁盘满、权限、Windows 上 rename 被占用等瞬时写失败会从 `resolve_session_file` 抛出，传播到 `SESSION_HISTORY_SUBSCRIBE/QUERY/SEARCH_CONTENT/SUMMARIES` 四个 handler，使会话操作硬失败而非回退为「不落盘照常扫描」。原子写保证不损坏文件，但健壮性回归。
- 建议：`persist_index_entry`/`save_session_index` 包 try/catch，写失败仅记日志并跳过，回退为扫描定位。

## 结论

- 前轮 finding 复核：Round 1，无。
- 本轮新发现：5 条（1 important / 4 minor）。
- 未进表的提示：
    - 文件过大：`src/main/core/session-history/session-locator.ts` 409 行，≥400 minor 阈值，本 task 净增约 110 行使其跨线。未发现因文件过大直接导致的缺陷，故不进 finding 表。
    - 复杂度：`resolve_session_file` 手算 McCabe ≈ 8，未达阈值；无提示。
    - 范围外观察：AC3「collector 扫描到新会话时索引随之更新」spec 上下文区（s019 结论）措辞为「经既有事件链路触发索引更新」，实现采用 resolve 时被动回填（task.md 已记录该取舍）。可观察 AC3（新会话可定位打开）满足，属「实现合理但与 spec 描述不符」类，处置为改 spec 上下文区措辞，不计 FAIL。
    - 死代码/风格：`save_session_index` 中 `...(wsl_user_cache ? {wsl_user_cache} : {})` 空对象为真值恒写入空字段，无功能影响，不单列。
- 总体判断：持久索引主链路（AC1/AC2/AC3/AC4）实现与测试覆盖正确，索引失效回退自愈设计可靠；但 f001 首次 WSL 探测失败被进程内永久负缓存，导致启动早于 WSL 就绪时整进程 WSL 会话不可用，属 AC5 功能回归，未解决前 FAIL。
- 系统性 follow-up：无。

verdict: FAIL

## Round 2 (2026-08-07 22:13 UTC+8)

### 前轮 finding 复核

- **t254_code_f001（important）— 已修**。`effective_wsl_user` 现仅在 `user !== ""` 时写进程内缓存并落盘（`session-locator.ts:217-224`）；探测返回空串（WSL 未就绪）不写缓存，下次 resolve 走 `cached !== undefined` 重探测自愈。新增测试 `f001：WSL 探测失败（返回空）不写负缓存，下次可重探测自愈`（`session-path-index.test.ts:175-196`）用不存在 distro 断言二次 resolve 发生额外 home 探测，实测通过。AC5 回归点消除。
- **t254_code_f002（minor）— 遗留合理**。`docs/pending.md`「待办」节已登记 p076（来源/内容/权衡齐全），`task.md` 处置表 `fix_ref` 指向 p076。权衡成立：首开批约 50 会话、单次 ~10KB JSON、总量 <500KB 顺序写，SSD 无感；同步接口下批间合并需异步 flush，破坏「resolve 后立即断言索引文件存在」的测试语义，收益有限。不要求改代码。
- **t254_code_f003（minor）— 已修**。`SessionIndexEntry` 增必填 `paths_key`（`session-path-index.ts:17-24`），磁盘命中校验 `indexed?.paths_key === paths_key`（`session-locator.ts:382`），不匹配即弃并回退扫描回填（不匹配分支不删除条目，扫描命中后由新 entry `index.set` 覆盖，自愈）。新增测试 `f003：跨配置（paths_key 不同）不得命中旧条目，回退扫描更新`（`session-path-index.test.ts:198-221`）改 `win_home` 断言定位到新配置路径，实测通过。旧索引条目（无 paths_key）经 `undefined === 具体值` 判不匹配，自动失效回扫，兼容自愈。
- **t254_code_f004（minor）— 已修**。`ensure_session_index` 载入块内 `wsl_user_cache ??= load_wsl_user_cache(index_dir)`（`session-locator.ts:324`），首次载入即与磁盘态合并；`persist_index_entry` 落盘时 `wsl_user_cache ?? load_wsl_user_cache(index_dir)`（`session-locator.ts:344`）兜底。win-only resolve 先触发时 `ensure_session_index` 先跑，`wsl_user_cache` 非空，写盘不再抹已持久化探测缓存。
- **t254_code_f005（minor）— 部分，见新 finding f006**。`persist_index_entry` 已整体包 try/catch（`session-locator.ts:336-347`），写失败 `log.warn` 跳过并回退扫描。但 `effective_wsl_user` 首次成功探测后的直接 `save_session_index`（`session-locator.ts:222`）未包 try/catch，属 f005 问题陈述「写路径未兜底」同类的残留路径，见 f006。

### 本轮新发现

### t254_code_f006 - effective_wsl_user 首次成功探测后的 save_session_index 未包 try/catch（f005 修不彻底）

- 严重度：minor
- 锚点：行为缺陷——与 f005 同型：写失败可从 resolve_session_file 抛出，穿透 4 处 IPC handler
- 位置：`src/main/core/session-history/session-locator.ts:221-222`
- 问题：f005 修复仅包住 `persist_index_entry`；`effective_wsl_user` 在首次成功探测（`user !== ""`）后直接调用 `ensure_session_index` + `save_session_index`，两者均可能抛 `mkdirSync`/`writeFileSync`/`renameSync` 异常（磁盘满、权限、Windows rename 占用）。该调用发生在 `resolve_session_file` 的 step-3 扫描路径内（`wsl_home` → `resolve_grok`/`resolve_kimi_code`/`claude_projects_dir` WSL 分支），`session-history-ipc.ts:128/184/258/321` 四处 handler 均无 try/catch，写失败时该次会话 resolve 硬失败。严重度 low：仅「每 distro 每进程首次成功探测」触发，且 `wsl_user_cache[distro]` 已在 `session-locator.ts:218` 先置入内存缓存，下次 resolve 走 `cached !== undefined` 提前返回不再落盘，一次性瞬时失败可自愈。
- 建议：与 f005 同法——该 `save_session_index` 调用包 try/catch，写失败仅 `log.warn` 跳过（探测结果仍在内存缓存，不影响本次与后续 resolve）。

## 结论（Round 2）

- 前轮 finding 复核：f001/f003/f004 已修（以 diff 与测试为准）；f002 遗留登记合理（p076）；f005 已修 `persist_index_entry` 主路径，残留 `effective_wsl_user` 写路径未兜底（f006）。
- 本轮新发现：1 条（f006，minor，f005 同型残留）。
- 未进表的提示：
    - 复杂度：`resolve_session_file` 手算 McCabe ≈ 8，未达阈值；`effective_wsl_user` ≈ 5，无提示。
    - 文件过大：`session-locator.ts` 425 行，≥400 minor 阈值但未达 800，且未发现因过大直接导致的可观测缺陷，按规则不进 finding 表。
    - 范围外观察：`ensure_session_index` 与 `effective_wsl_user` 各有一处 `wsl_user_cache` 载入（`??= load_wsl_user_cache`），功能上防御性冗余、测试间切换 index_dir 时以 `clear_resolution_cache` 复位，无行为分叉；仅风格重复，不单列。
- 总体判断：f001-f005 主修复正确、测试可信、AC1-AC5 语义保持；唯一残留 f006 与 f005 同型但 severity minor（一次性、自愈、触发面窄），无未解决 critical / important。
- 系统性 follow-up：无。

verdict: PASS
