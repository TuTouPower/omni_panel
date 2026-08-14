# p158 cacheMaxMb=0 schema 矛盾：UI/retention 视 0 为不限制，schema min(1) 拒绝 0

- 来源：t343 遗留（2026-08-13，t343_code_f002 minor，pre-existing）
- 内容：`src/main/core/config/types.ts:87` cacheMaxMb schema 为 `z.number().int().min(1).max(10000).optional()`，拒绝 0；但 settings data_section「不限制」保存 `cacheMaxMb: 0`（data_section.tsx:38），observation-retention 也把 0 视为不限制（:20）。若 config-store safeParse 实际拒绝 0，「不限制」选项无法持久化，retention 的 0 分支成死代码，且下次启动 load 校验失败走备份恢复。改进方向：schema 放宽 `min(0)` 对齐 UI/retention 语义。
- 处理：未开
