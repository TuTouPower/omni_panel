# p203 会话历史把注入信封当作用户消息展示

- 现象：会话历史面板（工作台栏 / 预览 / 摘要 / 复制）期望只展示用户说过的话与 Agent 回复正文，并正确标「用户」/「Agent」。实际四端提取器把 `type/role === user` 且有文本的记录原样标成用户，注入信封全部进气泡。各端形态不同：
    - **Grok**：一条真实提问被拆成多条用户气泡。本机当前 omni_panel 会话 `~/.grok/sessions/%2Fhome%2Ftestuser%2Ftestuser_ubuntu%2Fomni_panel/01a02a77-…/chat_history.jsonl`：提取器产出 4 条 user（`<user_info>`+规则 14KB、skills `<system-reminder>` 15KB、MCP `<system-reminder>` 4KB、`<user_query>`+skill_information），随后才是 Agent。`summaries` / `extract_grok_first_user` 取第一条，标题变成 `<user_info> OS Version: linux…`，不是提问。10 个近期 Grok 文件 58 条 user：context_envelope 7、reminder_only 23、含 `<user_query>` 26、plain 2；**所有文件第一条 user 都是信封，没有裸提问**。
    - **Claude Code**：近 80 个主 transcript **没有** `<user_query>` / `<system-reminder>`。注入是 `isMeta` skill 全文、`<command-name|message|args>` 原样 XML、`<local-command-caveat|stdout>`、字面量 `[Request interrupted by user]`。omni-panel 抽样有文本的 user：slash 16、isMeta 30、interrupted 8、local_cmd 2、plain 59。例 `a591bb13-…`：面板会先画斜杠 XML，再画整份 task-create skill，然后才是真人输入。
    - **Kimi**：真人提问多为裸文本；另有大量**单独一条** user 只有 `<system-reminder>`（turn interrupted / TodoList 未更新）。近 25 个 main wire：plain 144、reminder_only 120（约 45% 用户气泡是注入）。
    - **OpenCode**：user text part 含编辑器注入 `<system-reminder>Note: The user opened the file …` / `user selected #N from …`。近 400 条 text part：user reminder 16、user plain 38。会话 `ses_0091a544…` 第一条 user 就是 file-open reminder，然后才是 `hi`；`extract_opencode_first_user` 返回 reminder。
    - 复现：打开上述任一近期会话看栏内角色标签与正文；或 `python3 .scratch/task_bug_session_msg_roles/sample_extract.py`。
- 影响：会话历史窗口消息列表、库预览、`summaries` 首条用户摘要、跨栏复制（`**用户**` 节会带 XML 信封）、`searchContent` 会命中 skills/MCP/reminder 垃圾文本。四源（claude_code / opencode / kimi_code / grok）全中。token-stats 用量计数不受影响。Codex 有本地 rollout jsonl，但会话历史未接入，不在本条范围。
- 根因（产品缺陷）：
    1. 决策 2 只按 **record type** 留 user/assistant、剔 tool/system/thinking。各端真实「用户」行里嵌了框架信封；提取器不拆标签、不看 `isMeta`。
    2. 共享入口 `pick_text_from_content` 只拼 text 块，不做展示归一。`record_to_message` / `event_to_message` / `row_to_message` 非空即入 `HistoryMessage`。
    3. UI（`PaneMessageRow` / `SessionPreview`）忠实按 `role` 标「用户」/「Agent」，Markdown 渲染原文。数据层脏，所有消费面一起脏。
    - 分类：产品缺陷（展示用用户话未从源信封还原）
    - 已确认同类位点（同一「user 文本原样展示」机制，须一并改）：
        - `src/main/core/session-history/grok-extractor.ts`：`record_to_message` + `extract_grok_first_user`
        - `src/main/core/session-history/claude-code-extractor.ts`：`record_to_message` + `extract_claude_code_first_user`
        - `src/main/core/session-history/kimi-extractor.ts`：`event_to_message`（append_message user）+ `extract_kimi_code_first_user`
        - `src/main/core/session-history/opencode-extractor.ts`：`row_to_message` + `extract_opencode_first_user`
        - `src/main/core/session-history/subscription-service.ts` `summaries`：取第一条 `role=user`（走上述 first_user / cache）
    - 已扫、**同因不成立**（不并入）：
        - renderer `PaneMessageRow` / `SessionPreview` / `copy-format`：消费 `HistoryMessage`，无第二套解析；修提取器后这些面一起干净。
        - token-stats `grok-reader` 标题用目录 basename，不读 user 正文。
        - token-stats `opencode-reader` 标题用 db `session.title`。
        - 已按 type 过滤的 tool/system/thinking/reasoning/`part.type=think`：不是本信封问题。
        - Codex / Cursor：会话历史无提取器。
    - 待确认（不默认算同类）：
        - token-stats `claude-reader.extract_user_text` / `kimi-reader` 首条 user 作 session title：同一「不拆信封」，但是列表标题不是面板气泡；Claude 常有 `type=summary` 标题、Kimi first_user 通常已是真人第一句。
        - Claude 字面量 `[Request interrupted by user]`：合成 user 行，建议与信封一起丢，但是否算「用户可见系统提示」需产品拍板。
- 测试缺口：
    - 四端 fixture 是 `hello grok` / `帮我看看这个文件` 这类裸文本；单测绿，与生产 transcript 脱节。
    - 断言只覆盖 record type 过滤（system/tool/thinking），**零用例**覆盖 user 文本内 `<system-reminder>` / `<user_query>` / `isMeta` / `<command-*>` / `<local-command-*>`。
    - `first_user` 测试假定第一条 user 就是提问；Grok/OpenCode 生产第一条常是信封，现有测试挡不住。
    - 补测方向（须盖住四端，不能只挡 Grok）：
        - Grok fixture：独立 user_info 行、纯 reminder 行、`<user_query>` 混 skill_information；断言只产出 query inner，first_user 等于提问。
        - Claude fixture：`isMeta` skill dump、command-name/message/args、local-command-stdout；断言丢 isMeta/CLI stdout，slash 展开为 `/cmd args`，真人文本保留。
        - Kimi fixture：plain user + 单独 reminder_only append_message；断言 reminder 不产出消息。
        - OpenCode fixture：file-open reminder text part 在 `hi` 之前；断言 first_user=`hi`，reminder 不进列表。
        - 增量路径与全量同一归一化（追加 reminder 行不出现新用户气泡；追加 user_query 行 id 稳定）。
- 线索：`.scratch/task_bug_session_msg_roles/repro_notes.md`；`python3 .scratch/task_bug_session_msg_roles/sample_extract.py`
- 处理：未开
