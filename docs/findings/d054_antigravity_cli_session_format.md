# d054 antigravity CLI 会话格式映射

- 来源：t455 Step 1 实验（2026-09-06，s035 后续）
- 结论：`~/.gemini/antigravity-cli/conversations/<uuid>.db`（sqlite，表 trajectory_meta/steps/gen_metadata/executor_metadata）steps 为 protobuf：user 文本在 `step_type=14` 的 field19/sub2 明文 UTF-8；assistant 回复在 `step_type=15` 的 field20/sub1（sub8 同文复述，sub3 为思考摘要，sub14 为 base64 块）；tool 结果在 `step_type=8` field14/sub4（须过滤）；`step_type=132` field140 为内部动作消息（须过滤）；单步 unix 秒时间戳在 field5/sub1/sub1（与 history.jsonl 毫秒时间戳 cross-check 一致，如 1784078548）。
- 证据：12 库 / 1608 steps 全深度 wire 遍历编目（`.scratch/exp_proto_*.py`，gitignore 未入库）；已知用户文本跨库针刺命中；时间戳实例 1784078548→2026-07-15T09:22:28 与 history 行一致；uuid 在 brain 目录、conversation db 文件名、summaries.conversation_id 三处对齐（38/38/31）。
- 影响：t455 antigravity-extractor 按此映射实现；后续 protobuf field 漂移回本条修订。
- 现状：有效
