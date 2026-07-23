# Task spec

## 背景

t055 遗留：P5 ctx 共享 helper 集中化。

## 范围

- ConnectorContext 加 status_for_pct/ratio/balance（ctx 注入），runtime/sandbox 暴露，全连接器改用 ctx helper 替代内联。

## 验收标准

- [ ] ctx helper 单测三函数边界；全连接器用 ctx helper（替代内联）；黑盒绿。

## 依赖与约束

- 架构改（sandbox 单文件执行 + ConnectorContext 扩展）。
