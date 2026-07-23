# Task spec

## 背景

t062 遗留：IPC file:// rendererIndexPath 完整白名单。

## 范围

- assert_valid_sender file:// 白名单比对完整 rendererIndexPath pathname（非 endsWith index.html）。
- 实现方式：全局 setter（`set_renderer_index_path`，index.ts 启动调）注入 rendererIndexPath，assert_valid_sender 读全局精确比对。**不改 assert_valid_sender 签名**（避免 12 IPC 调用点改动），功能等价。

## 验收标准

- [x] 非 rendererIndexPath 的 file:// 拒（精确 pathname 比对 + 测试）。
- [x] 全局 setter 注入（非签名改，避免全 IPC 适配）。
- [x] 未初始化时 fallback endsWith index.html（兼容测试）。
- [x] error.message 不泄漏绝对路径。

## 依赖与约束

- helpers 用全局 setter 替代签名改（务实等价，避免 12 IPC 调用点 + deps 扩展）。
