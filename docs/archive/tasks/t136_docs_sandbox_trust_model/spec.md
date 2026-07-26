# Task spec

## 背景

review_20260726_054747 采纳项 22：sandbox 采用可信本地脚本模型（`node:vm` 非安全边界），但文档未显式声明；`runtime.ts:42` 引用的 `D8` 在 decisions.md 不存在。

## 范围

- `architecture.md` 与 connector spec 说明「`node:vm` 仅为运行时隔离，connector 来自本地目录」。
- `runtime.ts:42` 的 `D8` 改为实际 ADR 编号或删除（失效引用修正）。

## 非范围

- 不加权限管理、风险提示 UI 等安全管控。
- 不迁移到 isolated-vm / 独立进程。

## 验收标准

- [ ] runtime.ts 不再引用不存在的 `D8`。
- [ ] architecture.md / connector spec 描述与实际运行模型一致。

## 依赖与约束

- 无。
