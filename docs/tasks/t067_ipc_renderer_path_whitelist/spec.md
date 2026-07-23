# Task spec

## 背景

t062 遗留：IPC file:// rendererIndexPath 完整白名单。

## 范围

- assert_valid_sender 注入 rendererIndexPath，file:// 白名单比对完整路径（非 endsWith index.html）。

## 验收标准

- [ ] 非 rendererIndexPath 的 file:// 拒；helpers 签名改 + 全 IPC 适配 + 测试。

## 依赖与约束

- helpers 纯函数模块需 rendererIndexPath 注入（签名改影响全 IPC 调用）。
