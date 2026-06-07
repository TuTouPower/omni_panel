# AI 工作规则

## 每轮约束

1. 不实现本轮范围外的功能
2. 不重构无关文件
3. 不修改插件协议来适配实现
4. 无法确认的旧行为写入 `docs/unconfirmed.md`
5. 每个新模块必须有测试
6. 运行测试并报告结果
7. secret 不进日志/错误消息/测试快照
8. renderer 不直接访问 Node API
9. 输出本轮修改文件列表
10. 输出下一轮建议但不提前实现

## 每轮完成验证

1. 本轮改了哪些文件？
2. 哪些测试证明它工作？
3. 哪些行为还是 UNCONFIRMED？

## 禁止行为

- `nodeIntegration: true`
- `contextIsolation: false`
- renderer 直接 `import child_process`
- renderer 直接读写 config.json
- renderer 直接执行 Python
- 无测试的代码提交

## 允许路径

```
renderer → window.omniUsage.* → preload → ipcMain → main process
```

## 参考资源

- 旧项目源码：`<参考仓库路径>`
- 分析报告：`<分析报告路径>/UsageBoard_analysis_2026-05-24.md`
