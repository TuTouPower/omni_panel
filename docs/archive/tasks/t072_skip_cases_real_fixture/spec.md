# Task spec

## 背景

t064 I23：取消 skip 关键 case 补 real fixture。

## 范围

- 取消 4 文件 test.skip(true,...)（KIMI 合并/failed card/accounts/opencode_go），补 real fixture。

## 验收标准

- [ ] CI 覆盖关键路径；skip 取消或标明跟进。

## 依赖与约束

- 需 real fixture（CI 环境）。
