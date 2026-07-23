# Task spec

## 背景

main/index.ts 800+ 行，承担 app lifecycle + window management + IPC registration + tray + auto_seed + connector setup。

## 范围

- 按职责拆分（候选：app-lifecycle.ts / ipc-setup.ts / connector-setup.ts / tray-setup.ts）；index.ts 仅保留 app.whenReady 编排。行为不变。

## 非范围

- 不改其他模块。

## 验收标准

- [ ] 见范围具体条目。
- [ ] pnpm test / typecheck / lint 全绿。

## 依赖与约束

- 无外部依赖。
