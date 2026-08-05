# Task review t210（reviewer_focus: 代码）

- task：`t210_session_history_watch_service`
- spec：`docs/tasks/t210_session_history_watch_service/spec.md`
- diff_anchor：`0598dab1cf063cdf6941e33dbb0be3eb7798d0dc`
- target：`git diff 0598dab1cf063cdf6941e33dbb0be3eb7798d0dc`
- round：1
- reviewed_at：2026-08-05 14:38 UTC+8

## Findings

### t210_code_f001 - WSL 会话默认路径下不可解析，AC2 生产环境不可达

- 严重度：important
- 锚点：违反 AC「WSL 路径与 opencode db 会话走 2s mtime 轮询，追加后同样推送增量」；可观测行为缺陷：env=wsl 的会话（含全部 grok 会话，grok 仅 WSL 有数据）无法订阅/查询。
- 位置：`src/main/core/session-history/session-locator.ts:34-38`、`:143-150`；`src/main/ipc/session-history-ipc.ts:58`、`:114`；`src/main/index.ts:331-332`
- 问题：`DEFAULT_LOCATOR_PATHS.wsl_user = ""`，而 `wsl_home()` 在 `wsl_user` 为空时直接返回 `null`（session-locator.ts:144-150），且 locator 不做 collector 式的自动探测。IPC 的 SUBSCRIBE / QUERY handler 均以默认路径调用 `resolve_session_file(...)`（无 paths 参数注入），因此 env="wsl" 的 claude_code/opencode/kimi/grok 全部解析失败，返回 fail "SESSION_NOT_FOUND"。对比：token-stats collector 从 `cfg.tokenStats.wslDistro`/`wslUser` 读配置且 `wsl_user` 为空时自动探测（collector.ts:198-210），main/index.ts:331-332 也读取了同一份 config，但未注入到 locator。结果：WSL 会话（recent 列表会返回它们）在真实应用中无法订阅/查询，AC2 规定的 WSL 轮询推送在生产不可达。
- 建议：由 main 从 `cfg.tokenStats.wslDistro`/`wslUser` 构造 `LocatorPaths` 注入 IPC 层（与 collector 同一数据源），或在 locator 的 `wsl_home` 对空 `wsl_user` 做与 collector 一致的自动探测。

### t210_code_f002 - SESSION_HISTORY_OPEN 首次创建窗口时目标会话定位参数丢失

- 严重度：important
- 锚点：spec 上下文区已核实契约「首次创建则 renderer 启动时读初始定位参数」未实现；可观测行为缺陷：首次从明细打开某会话，历史窗口无任何机制得知目标 (source,env,session_id)。
- 位置：`src/main/index.ts:381-387`；`src/main/core/main-panel/history-window-controller.ts:43-60`、`:62-70`
- 问题：OPEN handler 无条件先 `open_or_focus()` 再 `send_focus(loc)`。窗口首次创建时 `loadURL` 是异步的（window-manager.ts:151 `void win.loadURL(...)`），`send_focus` 在 renderer 尚未加载、`onFocus` 未注册时调用 `win.webContents.send(...)`，消息被丢弃。diff 中没有任何向新建窗口传递初始定位参数的通道（`create_window` 无参、renderer URL 只含 route），与已核实契约「首次创建则 renderer 启动时读初始定位参数」不符。已开窗口聚焦分支正常。
- 建议：controller 记录 pending loc，在窗口 `ready-to-show`（或 renderer 完成加载后）再发 `SESSION_HISTORY_FOCUS`；或把目标 loc 并入新建窗口的创建参数/URL。

### t210_code_f003 - query 分页游标编码累计消息数，新消息追加时页面内容漂移

- 严重度：minor
- 锚点：行为缺陷；决策 17「按消息游标返回最近 N 条与更早分页」在会话活跃追加时返回内容错位。
- 位置：`src/main/core/session-history/subscription-service.ts:381-403`
- 问题：分页 `next_cursor` 的 `offset` 编码「已返回消息累计数」。若两次分页间有新消息追加（总消息数增长），`end = total - already_returned` 使「更早一页」取到的是新追加的消息而非更早消息。例：total=10、limit=3，首页返回 [7,8,9]、cursor=3；追加 3 条后 total=13，下一页返回 [10,11,12]（最新消息）而非 [4,5,6]。结果乱序/重复（renderer 侧按 id 去重可掩重复，但内容非用户预期的更早分页）。代码注释自述为简化实现（:350-356），但该简化与「更早分页」语义的偏差在活跃会话下可观测。
- 建议：分页前对消息做快照基准（如记录分页起始时的消息总数），`already_returned` 相对快照计算；或分页游标携带基准 total，偏移基于基准。

### t210_code_f004 - 订阅推送固定目标为历史窗口，与「向订阅方窗口推送」不符

- 严重度：minor
- 锚点：行为缺陷；AC9 允许 agent route 使用会话历史 API，但推送目标硬编码为历史窗口。
- 位置：`src/main/ipc/session-history-ipc.ts:71-84`
- 问题：`on_update` 闭包总是向 `history_window_controller.get_window()` 发消息。preload 对 route `agent` 同样暴露 full `sessionHistory` API（`route_api.ts:52-53`）；若 agent 窗口发起订阅，增量会推到历史窗口而非订阅方窗口，与范围「向订阅方窗口推送增量消息」、AC「订阅方窗口…收到增量消息」不一致。当前仅历史窗口会订阅时行为等价，但契约目标是订阅方。
- 建议：在 SUBSCRIBE handler 捕获 `event.senderFrame`/对应窗口引用作为推送目标，或明确约束仅历史窗口可订阅并据此收紧 AC9 的暴露面。

## 结论

- 前轮 finding 复核：Round 1，无前轮。
- 本轮新发现：4 条（2 important + 2 minor）。
- 未进表的提示：
    - 文件过大：`src/main/core/session-history/subscription-service.ts` 428 行（新文件，>400 minor 阈值，<800）；含 341-356 行设计演进式长注释。未直接造成可观测缺陷，仅提示。其余新文件均 <400（session-locator 254、session-history-ipc 154、history-window-controller 85）。
    - 复杂度：无函数 CC≥10，无提示。
    - 范围外观察（根因在 t209 提取器，本 diff 未触达；5s renderer 兜底可缓解，建议 follow-up）：
        1. grok 增量 id 与全量 id 空间冲突：`grok-extractor.ts:99-115` 增量切片 `line_index` 从 0 重计，追加消息得到 `grok:0..` 与全量已推送 id 相同，破坏下游按 id 去重/React key（kimi 用字节 offset 无此问题）。
        2. byte_offset 增量在 fs.watch 于写入中途触发时：增量读到 EOF，未完整尾行解析失败被跳过，新 cursor 越过该行，该记录在增量通道永久丢失（`claude-code-extractor.ts:89-125`、`kimi/grok-extractor` + `subscription-service.ts:303-320` handle_change 无条件推进 cursor）；仅当 watch 命中写入半行窗口，且被 5s 兜底全量查询覆盖。
    - OPEN handler 未做 `assert_valid_sender`，与 TOKEN_STATS_OPEN 既定模式一致，按 spec 参照行为处理，非问题。
    - 文件大小/阈值：win+claude_code fs.watch 对「写临时文件+rename」式写入只发 `rename` 事件（当前仅监听 `change`），若 claude_code 采用该写法则实时推送退化为 5s 兜底；行为取决于实际写文件方式，无法在本机核实，仅提示。
- 总体判断：WSL 会话在生产无法订阅/查询（AC2 不可达）+ OPEN 首次创建定位参数丢失，两处 important 未解决，FAIL。
- 系统性 follow-up：建议 t209 域修复「grok 增量 id 冲突 + byte_offset 尾行截断」，slug 建议 `fix_session_history_extractor_incremental`；阻断性：该 follow-up 不阻断 t210 合并，但在 t211（窗口 UI）接入前宜修复。

verdict: FAIL

## Round 2 (2026-08-05 15:10 UTC+8)

复核 Round 1 全部 4 条 code finding，对当前完整 diff（含 round 1 后修复）审阅。以 `git diff 0598dab1cf063cdf6941e33dbb0be3eb7798d0dc` 与代码/测试为准。

## Findings

### t210_code_f005 - 分页游标按 message id 定位，空 id / 重复 id 消息使翻页跳段

- 严重度：minor
- 锚点：行为缺陷；决策 17「按消息游标返回最近 N 条与更早分页」在游标 id 不唯一/为空时返回错误页面。
- 位置：`src/main/core/session-history/subscription-service.ts:380`（findIndex）、`:395`（cursor 编码）
- 问题：pagination 游标只编码「已返回页最早消息 id」，下一页靠 `all.findIndex(m => m.id === cursor.start_message_id)` 定位。claude_code 提取器对缺失 `uuid` 的 record 产出 `id: ""`（`claude-code-extractor.ts:39`），且不保证 uuid 在同一 transcript 内唯一。若一次全量提取含 ≥2 条 `id === ""`（或重复 id）的消息，且某一页边界落在后一条空 id 消息上，下一页 `findIndex("")` 命中最早那条空 id 消息，`end` 被压到更早位置，中间消息被跳过（分页数据缺失）。例：`all=[a, ""(idx1), b, c, ""(idx5)]`，limit=1 首屏返回 [idx5]，cursor=""，下一页 `findIndex("")`=1 → 返回 [a] 并到顶，b/c 永久不可达。kimi/grok/opencode 的 id 在单次全量提取内唯一，不受影响。
- 建议：cursor 额外携带边界消息在提取时的下标（`start_index`），下一页从该下标向前线性扫描定位（不依赖 id 唯一性），或提取器保证 id 非空且唯一。

### t210_code_f006 - OPEN 连续调用时窗口首次创建窗口期 send_focus 丢失

- 严重度：minor
- 锚点：行为缺陷；「已开则聚焦并定位」在创建窗口期返回错误定位。
- 位置：`src/main/core/main-panel/history-window-controller.ts:48-68`
- 问题：窗口首次创建时 `win = target` 立即赋值、renderer 尚未加载（`loadURL` 异步），此刻第二次 `open_or_focus(loc2)` 走已开分支调用 `send_focus(loc2)`，`webContents.send` 在 renderer 的 `onFocus` 监听注册前发出即被丢弃；窗口最终按 URL 里的第一个 loc 定位。例：用户在「最近 6 条」连续双击两个会话，二次点击落在加载窗口期时，窗口展示的是第一个会话而非第二次点击的目标。
- 建议：controller 记录 pending loc，窗口 `ready-to-show`（或首次 `did-finish-load`）后再补发一次 `SESSION_HISTORY_FOCUS`；或在创建期缓存目标 loc，renderer 就绪后由主进程补推。

## 结论

- 前轮 finding 复核（Round 2）：
    - t210_code_f001（important）：已修。`session-locator.ts:158-165` `effective_wsl_user` 空串时列 `\\wsl.localhost\<distro>\home` 取第一目录（与 collector `effective_wsl_user` 对齐，collector.ts:198-211）；`main/index.ts:362-367` 从 `currentConfigSnapshot.tokenStats.wslDistro/wslUser` 构造 `locator_paths` 注入 IPC，SUBSCRIBE/QUERY handler 均透传（session-history-ipc.ts:64、:121）。win 环境无误触：探测只在 `wsl_home`（env=wsl 路径 / grok 固定 WSL）内执行，纯 win 会话不碰 UNC。探测失败（无 WSL）`safe_readdir` 返空 → 返回 null → 优雅 fail。测试覆盖显式配置分支与失败优雅返回 null（session-locator.test.ts:101-111、:132-140；ipc.test 验证 locator_paths 透传）。已消除。
    - t210_code_f002（important）：已修（t210 范围）。`history-window-controller.ts:48-68` `open_or_focus(loc)` 首建时把 loc 传入 `create_window`；`main/index.ts:355-359` 经 `createWindowFor("history", { route_query: { loc: JSON.stringify(loc) } })` 附加到渲染 URL；`window-manager.ts:104-120` 用 `encodeURIComponent` 编码 key/value（无注入/编码问题，URL pathname 不受 query 影响，`assert_valid_sender` 精确比对 pathname 仍成立）；已开窗口走 `send_focus`。controller 双路径单测覆盖（history-window-controller.test.ts:101-127）。注：renderer「启动读初始定位」的消费侧在 t211（渲染 UI 范围外），当前仓库无读取 `loc` query 的代码，t210 仅提供投递通道，机制正确。
    - t210_code_f003（minor）：已修。`subscription-service.ts:377-397` 分页游标改 `pagination` 形态（编码已返回页最早消息 id），追加只发生在末尾、旧消息 id 位置稳定；「活跃会话追加后向前翻页不重复不遗漏」测试覆盖（subscription-service.test.ts:414-457）。空页/游标丢失边界：`findIndex` 未命中返回空页 + null cursor（保守到顶），不抛不卡。除 f005 的空 id 边界外已消除。
    - t210_code_f004（minor）：遗留 p048，处置一致，本 diff 未改 on_update 固定推历史窗口；当前仅历史窗口订阅，无实际推错场景，符合 minor 遗留不阻断。
    - t210_test_f001/f002/f003（important）及 test f004-f006（minor）处置表标「已修」的测试补强经抽查属实（route_api 分权矩阵、只读断言、watcher 策略矩阵/fs.watch 分支、分页追加用例均存在于测试文件且通过）。
- 本轮新发现：2 条（均 minor）。
- 未进表的提示：
    - 文件过大：`src/main/core/session-history/subscription-service.ts` 422 行（新文件，>400 minor 阈值，<800），未直接造成可观测缺陷，仅提示；其余新文件均 <400（session-locator 268、session-history-ipc 158、history-window-controller 93）。
    - 复杂度：无函数 CC≥15，无提示。
    - 范围外观察：
        1. `locator_paths` 是注册时快照；设置里改 wslDistro/wslUser 后，collector 按 poll 重读配置立即生效，会话历史 locator 需重启才生效（行为分叉风险小，仅 WSL 路径变更场景）。
        2. SUBSCRIBE/QUERY 的 `extract_full` 与 UNC 探测均在主进程同步执行：大 transcript 每次全量解析 + 每 5s 兜底重复全读，WSL 不可达时探测 readdir 实测 ~490ms 阻塞（本机测试复现）；collector 因在 utility 进程跑不受此影响。大会话下主进程 UI 卡顿风险，属可接受范围但值得 t213 黑盒确认。
        3. fs.watch 仅监听 `change` 不监听 `rename`（Round 1 已提示）：若 claude_code 采用「写临时文件+rename」，实时推送退化为 5s 兜底；取决于实际写文件方式，本机无法核实，未变。
        4. t209 域遗留未变：grok 增量 id 与全量 id 空间冲突（grok-extractor.ts:99-115）、byte_offset 增量在写入半行窗口触发时尾行截断丢失（增量通道），与 Round 1 follow-up 建议一致。
- 总体判断：Round 1 两处 important（f001/f002）已按处置落实并有测试佐证，f003/f004 处置一致；本轮仅 2 条 minor 新发现，无未解决 critical / important。
- 系统性 follow-up：沿用 Round 1 建议（t209 域 `fix_session_history_extractor_incremental`，覆盖 grok 增量 id 冲突 + byte_offset 尾行截断）；无新 follow-up。

verdict: PASS
