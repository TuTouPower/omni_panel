# connector 进程隔离

- 来源：Grok 全仓评审（2026-08-11）
- 内容：Grok Issue 10：node:vm + 模式拒逃逸非真安全边界；用户 connector 受信代码，建议 utilityProcess/worker 无 vault 隔离；blocklist 仅纵深
- 处理：不办
- 暂搁：2026-08-11 connector 隔离边界未定——utilityProcess/worker 无 vault 隔离方案与 blocklist 纵深定位，需用户决策后再评估
