# Task log / plan

## 记录

- observation-store INIT_SQL CREATE TABLE IF NOT EXISTS 含 last_error TEXT（L55）。但旧 observation.sqlite 表无 last_error（CREATE TABLE 不改旧表）。
- 新代码 INSERT/SELECT 用 last_error，旧表缺列 → INSERT 失败（"no such column: last_error"）→ observation-store 空 → UI 空（"数据没了"）。
- 修：L56 后加 `ALTER TABLE observations ADD COLUMN IF NOT EXISTS last_error TEXT;`（SQLite 3.35+ 支持 IF NOT EXISTS）。
- 单测：better-sqlite3 内存 DB 旧 schema CREATE TABLE（无 last_error）→ INSERT with last_error 失败 → ALTER TABLE 加列 → INSERT 成功。
