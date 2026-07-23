# Task spec

## 背景

review_20260723_opus：I16（`scripts/task.py:52-54`）`write_text` 直接覆盖 task JSON，无 tmp+rename+fsync；中断/掉电即损坏权威 task JSON。I17（`scripts/task.py:153-163,166-177`）finish/drop 跨 3 次磁盘写且非事务（active→done、archive append、active remove），任一次中断会留下 done task 同时在 active 与 archive，重跑 finish 被 `require_status("active")` 拒绝。

## 范围

- save：改临时文件 + `os.replace` 原子替换（+ fsync）。
- finish/drop：调整顺序为「先 append archive 确认落盘后再清 active」，或加恢复入口（检测 active 与 archive 同 tid 共存时修复）。

## 非范围

- 不改 task.py 的 tid 分配/状态机逻辑（仅落盘原子性 + 事务顺序）。
- 不迁移到 SQLite/其他存储。

## 验收标准

- [ ] save 用 tmp+os.replace 原子写。
- [ ] finish/drop 中断后重跑可恢复（不留 active 与 archive 共存）。
- [ ] 单测覆盖：模拟写中断（mock os.replace 失败）不损坏 JSON。
- [ ] 现有 task.py 操作全绿。

## 依赖与约束

- Windows 上 os.replace 跨卷可能失败；确保 tmp 与目标同目录。
