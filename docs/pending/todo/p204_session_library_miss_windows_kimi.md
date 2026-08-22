# p204 会话库搜 Windows Kimi 正文关键词为空（WSL 网页）

- 现象：期望在会话库搜「黑沙皇」（勾选「包含消息内容」）命中 Windows Kimi 会话 `session_e36b69aa-2e48-4d19-8494-9ed890da3612`（cwd `D:/Dev/Code`，wire 含该词 318 次）。实际 OmniPanel 在 **WSL 跑 + 网页版搜索** 时结果空。同机 wire 按 extractor 规则模拟提取 99 条消息、关键词命中 25 条——正文匹配本身成立。未勾选「包含消息内容」时 UI 未说明搜的是 title/directory/id（不是只搜 cwd）。
- 影响：WSL/Linux 宿主上的会话库元信息搜索、内容搜索、打开定位，对 **Windows 原生安装** 的 kimi（及同类仅落在 `%USERPROFILE%\.kimi-code` 的会话）全部不可见；用户用 Windows kimi + WSL OmniPanel/网页的组合会系统性踩空。用量 token 计数同样缺这些会话。
- 根因（产品缺陷）：
    1. 会话库搜索候选只来自 `tokenStatsStore.query_sessions`（已采集索引），不直接扫盘（d021 / session-history-ipc `content_search_candidates`）。
    2. WSL 宿主 `kimi_local` 经 `paths.kimi_sessions_path(..., env=local)` 落到 `os.homedir()/.kimi-code`（本机 `/home/testuser/.kimi-code`），**不会**读 `C:\Users\TestUser\.kimi-code`。
    3. 实测：`~/.config/OmniPanel/observations.sqlite` 无该 session_id；scan-state 仅 Linux kimi 路径；Windows Roaming 库亦无（且停在会话创建前）。故元信息搜与内容搜都空。
    - 分类：产品缺陷（跨 OS 采集边界；Windows→WSL 有 UNC `wsl` 源，WSL→Windows 无对称源）
    - 已确认同类位点（同一「Linux local 只扫 POSIX home」机制）：
        - `collector.ts` `kimi_local` + `paths.kimi_sessions_path` local
        - 同清单 `claude_*_local` / `opencode_local` / `grok_local`：Windows 原生 `%USERPROFILE%\.claude` / `.local\share\opencode` / `.grok` 在 WSL OmniPanel 下同样不可见（检索轴：LOCAL_HOSTS + env=local + paths.local_root）
        - `session-locator` resolve\_\* local：即使手填 Windows session_id，WSL 上 resolve 也找不到 Windows 路径文件
        - `content_search_candidates` / `searchContent`：设计依赖索引，索引缺则必空（同因下游，须一并纳入验收「入库后可搜」）
    - 已扫、同因不成立：
        - `searchContent` 的 `toLowerCase` 中文匹配：wire 模拟命中成立，非本空结果原因
        - 「包含消息内容」并集：候选枚举未把 search 当交集过滤（`content_search_candidates` 不含 search）；UI 传 filters.search 只供 metadata 并集支路
        - 勾选框文案不清：UX 缺口，机制不同，可同条 pending 附带改文案，但不算采集同因
    - 待确认：是否引入新 env（如 `windows`）还是配置 `win_home`/`extra_homes` 在 linux 宿主挂第二条 kimi 源；合入前需定稿，避免与现有 `local|wsl` 主键冲突
- 测试缺口：
    - 无「host=linux 且存在 Windows 用户目录下 kimi sessions 时仍可采集/可搜」用例；现有 paths/collector 测试只覆盖 POSIX local 与 Windows 宿主 UNC wsl。
    - 无「未索引会话不会进 content search 候选」的产品级说明/空态断言（易被当成搜索坏了）。
    - 补测方向：paths/collector 在 linux 宿主配置 Windows home 后能列出 `session_e36b69aa…`；入库后 `query_sessions({search:'黑沙皇'})` 与 `searchContent(keyword:'黑沙皇')` 均命中；回归：未配置时仍只扫 `~/.kimi-code`。UI：未勾选内容时 placeholder/hint 写明搜标题/目录/id。
- 线索：`.scratch/task_bug_session_search_heisha/repro_notes.md`、`evidence.json`
- 处理：t437 → t438
