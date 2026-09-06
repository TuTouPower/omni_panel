# antigravity 会话正文提取（SQLite steps protobuf）

需求：`antigravity-extractor` 从 `~/.gemini/antigravity-cli/conversations/<session_id>.db` 的 `steps` 表提取会话历史 user/assistant 文本（t455，来源 s035/d054）。step_payload 为 protobuf（d054 字段映射）：user 在 `step_type=14` 的 field19/sub2 明文；assistant 在 `step_type=15` 的 field20/sub1（sub8 同文复述、sub3 思考摘要、sub14 base64 块丢弃）；`step_type=8` field14/sub4 tool 结果与 `step_type=132` field140 内部动作消息过滤；单步 unix 秒在 field5/sub1/sub1，转 ms。

## 提取契约

- `step_type=14` field19/sub2 非空文本 → role=user 消息；`step_type=15` field20/sub1 非空文本 → role=assistant 消息（idx 升序）。
- field5/sub1/sub1（unix 秒）×1000 为消息时间戳；缺失/非法为 null。
- id 为 `antigravity:${steps.idx}`（行级稳定），全量/增量一致。
- 过滤：非 14/15 step、二进制/替换字符文本、空 text 不产生消息；user 正文再经 `normalize_user_display_text`。
- 增量（`extract_antigravity_incremental`）按 `idx > cursor.max_rowid` 取行（sqlite_rowid 游标复用，语义为 max idx）。
- 定位：`conversation_summaries.db` 索引命中直接拼 `<id>.db`（仍校验存在）；索引缺行回退扫 `conversations/` 文件名；都不中返回 null。

## 验收标准

- AC-001：索引命中的会话 id 解析到 `<id>.db`，`extractor_kind` 为 antigravity。
- AC-002：全量含用户首条文本且全部消息 timestamp 非空数字。
- AC-003：追加 step 后增量只返回新增，id 与全量一致。
- AC-004：不存在的会话 id 返回 null，不抛错。
- AC-005：tool 输出与 system notice 行被过滤。

## 来源与约束

- 来源：s035（数据源勘测）、d054（t455 Step 1 实验：12 库 / 1608 steps wire 遍历 + 真机黑盒 210 steps → 14 消息 7/7）。
- 非范围：代理面板/token-stats、用量面板连接器、GUI state.vscdb、macOS/Windows fixture（只覆盖 linux）。
- 风险：protobuf field 号随 CLI 版本漂移，漂移回 d054 修订。
- 测试：`tests/unit/main/core/session-history/antigravity-extractor.test.ts`（手造最小 sqlite + 手工 protobuf 编码 fixture）。
