# 遗留项汇总

从已完成 task 收尾报告中提取的未消化遗留项。最近评估：2026-07-26。

## 已建 task

| 遗留来源       | 内容                                                    | task |
| -------------- | ------------------------------------------------------- | ---- |
| t122 f002      | `session_meta` 迁至 `renderer/lib/` 消除反向依赖        | t124 |
| t122 f003      | 拆 `accounts_section.tsx`（436行）抽 AccountsList       | t125 |
| t100 f001/f002 | 拆 `ProviderCard.tsx`（436行）+ 测试（925行）           | t126 |
| t118 f002      | 提取 grok/kimi OAuth 共享 helper（s001 spike 已定边界） | t127 |
| t096 遗留 P0-B | use-plugins 快照相等性检查（s002 spike 方案 B）         | t128 |
| t096 遗留 P0-A | use-plugins rAF 合批（s002 spike 方案 A）               | t129 |

## 已失效，无需处理

| 遗留来源      | 原内容                                           | 失效原因                                                                    |
| ------------- | ------------------------------------------------ | --------------------------------------------------------------------------- |
| t102 f002     | task.py JSON 序列化 CRLF/2空格导致 prettier 不过 | 2026-07-26 验证：`prettier --check` 已通过                                  |
| t065 遗留 I25 | esbuild devDeps 清理                             | 已从 package.json 移除                                                      |
| t065 遗留 I28 | @types/node 版本                                 | 当前 ^22.0.0 正常                                                           |
| t072 遗留     | 4 文件 test.skip(true)                           | 2026-07-26 验证：无残留 skip                                                |
| t065 遗留 I24 | 启用 7 eslint 插件 recommended                   | package.json 已无独立 eslint-plugin-\* 包，插件随 eslint 版本内置，已不适用 |

## 暂不建 task（附理由）

| 遗留来源       | 内容                                          | 理由                                                                                                                                                                            |
| -------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| t088/t066      | 16 个 connector 删内联 helper 改 `ctx.status` | 全部未迁移，工作量大；纯 DRY 无功能收益；ctx.status 注入机制已就绪但不阻塞；当前各 connector 内联实现语义已统一（t055 修），重复但正确。等有新 connector 需求或批量改动窗口再做 |
| t064 遗留      | I19/I21/I22/I23 测试架构改进                  | 需 CI 环境配合验证；其中 I23（取消 skip）已确认无残留 skip，I19/I21/I22 属测试基建增强非缺陷修复；项目当前测试覆盖率足够支撑日常开发                                            |
| t069 遗留      | migration 测试改 import 生产迁移入口          | 需导出 observation-store 内部迁移函数，属 API 暴露面扩大；当前手写 PRAGMA+ALTER 测试覆盖核心迁移路径，风险可接受                                                                |
| t070 遗留      | e2e 断言真实刷新（当前死等 1000ms）           | 需 e2e 运行环境改造；现有测试通过单元/集成层覆盖刷新逻辑，e2e 死等是已知妥协                                                                                                    |
| t071 遗留      | setupFiles 拆 renderer-only                   | 需 vitest.config 改 + 评估 renderer 测试对 mock 依赖；当前 mock 注入无副作用                                                                                                    |
| t062 遗留      | 完整 rendererIndexPath 白名单                 | 需 helpers 注入 path（架构改）；当前 endsWith index.html 已拒非 HTML file://，攻击面极小                                                                                        |
| t063/t068 遗留 | mock os.replace 失败路径测试                  | 需 pytest 基建，项目无 Python 测试框架；当前原子写实现（tmp+fsync+os.replace）+ happy path + 中断恢复测试已覆盖核心契约                                                         |
| t074 遗留      | taskkill 按路径（PowerShell）                 | Windows 特定重构；当前按端口 kill 已覆盖主场景                                                                                                                                  |

## 无遗留 / 已消化

- t121 f005 → t122 已拆（SettingsView 724行）
- t121 f006 → t123 已补（OAuthDeviceForm secret_name）
- t112 f003/f004 → t118 已提取共享 hook
- t114 f003 → t117 已拆 serde
- t043 f001 → t044 已拆 PopupView
- t089/t090/t091 → t076/t077/t078 已完成
- t045 f001 → t045 已抽 onConfigImported 到 config-callbacks.ts
