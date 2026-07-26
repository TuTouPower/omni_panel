# Task spec

## 背景

review_20260726_054747 采纳项 2、3：domain.md 内置 provider 枚举遗漏 `getoneapi`、`exa`、`tikhub`；bugs.md 最后一条缺 t111 修复行。

## 范围

- `docs/blueprint/domain.md` 内置直连 provider 列表补 `getoneapi`、`exa`、`tikhub`；CPA 保持聚合连接器单独描述。
- `docs/bugs.md` 最后一条目追加「修复：t111」行，记录 P0 保护、auto-seed 条件、原子写入，附 branch 与 commit。

## 非范围

- 不删除 bugs.md 既有条目；不改 connector 实现。

## 验收标准

- [ ] domain.md provider 列表含全部内置直连 provider。
- [ ] bugs.md 最后一条含「修复：t111」及 branch/commit。

## 依赖与约束

- 无。
